import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  allowedDeliveryStores,
  canAccessDeliveryStore,
  canManageDeliveryIntegration,
  normalizeSimulatorOrder,
  retryDelayMs,
  signSimulatorRequest,
  verifySimulatorRequest,
} from "../_shared/delivery-domain.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const providers = new Set(["zomato", "swiggy"]);
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function encryptionKey() {
  const encoded = Deno.env.get("AGGREGATOR_ENCRYPTION_KEY");
  if (!encoded) throw new Error("Secure credential storage is not configured on the UVPRO server");
  const bytes = unb64(encoded);
  if (bytes.length !== 32) throw new Error("AGGREGATOR_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptCredentials(credentials: Record<string, unknown>) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await encryptionKey();
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return `v1:${b64(iv)}:${b64(new Uint8Array(ciphertext))}`;
}

async function decryptCredentials(encrypted: string) {
  const [version, iv, ciphertext] = encrypted.split(":");
  if (version !== "v1" || !iv || !ciphertext) throw new Error("Credential envelope version is not supported");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await encryptionKey(), unb64(ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>;
}

function parseCredentials(value: unknown) {
  if (!value) return {};
  if (typeof value === "string") {
    if (value.length > 12000) throw new Error("Credential bundle is too large");
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw new Error("Credentials must be a JSON object");
    return parsed as Record<string, unknown>;
  }
  if (Array.isArray(value) || typeof value !== "object") throw new Error("Credentials must be a JSON object");
  return value as Record<string, unknown>;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Use POST for integration operations" }, 405);
  const rawRequestBody = await request.text();
  if (new TextEncoder().encode(rawRequestBody).byteLength > 64_000) return json({ error: "Request is too large" }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Online delivery service is not configured" }, 503);

  const auth = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: request.headers.get("Authorization") || "" } },
  });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return json({ error: "Sign in to UVPRO to use the test simulator and integration settings" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const email = String(user.email || "").toLowerCase();
  const assigned = user.app_metadata?.vestora || {};
  const [{ data: profile, error: profileError }, { data: directoryRow, error: directoryError }, { data: staffRow, error: staffError }] = await Promise.all([
    admin.from("core_user").select("id,email,restaurant_id,user_type,is_superuser,is_active").eq("email", email).maybeSingle(),
    admin.from("vestora_shared_app_state").select("state_value").eq("state_key", "vestora-stores").maybeSingle(),
    admin.from("vestora_shared_app_state").select("state_value").eq("state_key", "vestora-users").maybeSingle(),
  ]);
  if (profileError || directoryError || staffError) return json({ error: "Branch access could not be verified" }, 503);
  const linkedProfile = profile || (assigned.role ? { user_type: assigned.role, is_superuser: false, is_active: assigned.active !== false, restaurant_id: null } : null);
  if (!linkedProfile || linkedProfile.is_active === false || assigned.active === false) return json({ error: "This active UVPRO account is not linked to a restaurant" }, 403);
  const isSuperAdmin = Boolean(linkedProfile.is_superuser || linkedProfile.user_type === "super_admin");
  const canManage = canManageDeliveryIntegration(linkedProfile.user_type, assigned.role);
  const stores = Array.isArray(directoryRow?.state_value) ? directoryRow.state_value : [];
  const staff = Array.isArray(staffRow?.state_value) ? staffRow.state_value : [];
  const linkedStaff = staff.find((entry) => String(entry.email || "").toLowerCase() === email && entry.status !== "Inactive");
  const assignedStore = String(assigned.storeId || linkedStaff?.storeId || "");
  const allowedStoreIds = allowedDeliveryStores({ stores, isSuperAdmin, email, assignedStore, restaurantId: linkedProfile.restaurant_id });

  let body: Record<string, unknown> | null = null;
  try { body = JSON.parse(rawRequestBody) as Record<string, unknown>; } catch { return json({ error: "Request body must be valid JSON" }, 400); }
  if (!body || Array.isArray(body) || typeof body.action !== "string") return json({ error: "An action is required" }, 400);
  const storeId = String(body.storeId || "").trim();
  const provider = String(body.provider || "").toLowerCase();
  if (!storeId || storeId === "GLOBAL" || !canAccessDeliveryStore(storeId, isSuperAdmin, allowedStoreIds)) return json({ error: "This branch is outside your account access" }, 403);
  if (!providers.has(provider)) return json({ error: "Choose Zomato or Swiggy" }, 400);
  if (["config.save", "mapping.save", "mapping.delete", "order.change", "stock.change", "job.retry", "simulate"].includes(body.action) && !canManage) {
    return json({ error: "Restaurant administrator permission is required" }, 403);
  }

  const { data: connection, error: connectionError } = await admin.from("vestora_delivery_connections")
    .select("id,store_id,provider,outlet_id,mode,status,settings,credentials_ciphertext,credential_key_version,updated_at")
    .eq("store_id", storeId).eq("provider", provider).maybeSingle();
  if (connectionError) return json({ error: "Online delivery tables are not ready. Apply the online-delivery database migration first." }, 503);

  if (body.action === "config.get") {
    return json({ connection: connection ? {
      id: connection.id, storeId: connection.store_id, provider: connection.provider, outletId: connection.outlet_id,
      mode: connection.mode, status: connection.status, settings: connection.settings,
      credentialsConfigured: Boolean(connection.credentials_ciphertext), updatedAt: connection.updated_at,
    } : null });
  }

  if (body.action === "config.save") {
    const outletId = String(body.outletId || "").trim();
    if (!(["test", "live"] as unknown[]).includes(body.mode)) return json({ error: "Choose test or live mode" }, 400);
    const mode = body.mode as "test" | "live";
    if (!outletId || outletId.length > 160) return json({ error: "Enter a valid platform outlet ID" }, 400);
    if (mode === "live" && !body.confirmLivePending) return json({ error: "Live credentials and traffic remain disabled until partner approval and official API specifications are supplied" }, 409);
    let credentialsCiphertext = connection?.credentials_ciphertext || null;
    try {
      const credentials = parseCredentials(body.credentials);
      if (Object.keys(credentials).length) credentialsCiphertext = await encryptCredentials(credentials);
      if (body.clearCredentials === true) credentialsCiphertext = null;
    } catch (error) { return json({ error: error instanceof Error ? error.message : "Credential encryption failed" }, 503); }
    const settings = {
      kotPrinter: String((body.settings as Record<string, unknown> | null)?.kotPrinter || "").slice(0, 160),
      currency: "INR",
    };
    const saved = await admin.from("vestora_delivery_connections").upsert({
      store_id: storeId, provider, outlet_id: outletId, mode,
      status: mode === "test" ? "test_ready" : "live_pending_approval",
      settings, credentials_ciphertext: credentialsCiphertext,
      credential_key_version: credentialsCiphertext ? "v1" : null, created_by: user.id, updated_at: new Date().toISOString(),
    }, { onConflict: "provider,store_id" }).select("id,store_id,provider,outlet_id,mode,status,settings,credentials_ciphertext,updated_at").single();
    if (saved.error) return json({ error: saved.error.code === "23505" ? "That provider outlet is already mapped to another UVPRO branch" : "Could not save branch integration settings" }, 409);
    await admin.from("vestora_delivery_logs").insert({
      store_id: storeId, connection_id: saved.data.id, provider, event_type: "configuration_saved", outcome: "success",
      message: mode === "test" ? "Test-mode outlet mapping saved" : "Live configuration saved as pending approval; live traffic is not enabled",
    });
    return json({ connection: {
      id: saved.data.id, storeId: saved.data.store_id, provider: saved.data.provider, outletId: saved.data.outlet_id,
      mode: saved.data.mode, status: saved.data.status, settings: saved.data.settings,
      credentialsConfigured: Boolean(saved.data.credentials_ciphertext), updatedAt: saved.data.updated_at,
    } });
  }

  if (!connection) return json({ error: "Save this branch's outlet mapping first" }, 409);
  if (body.action === "mapping.list") {
    const [{ data: mappings, error: mappingError }, { data: orders, error: orderError }, { data: logs, error: logError }, { data: jobs, error: jobsError }] = await Promise.all([
      admin.from("vestora_delivery_menu_mappings").select("id,provider_item_id,provider_item_name,local_item_id,local_item_name,addon_mapping,gst_rate,provider_price,online_stock,is_available,kot_printer,updated_at").eq("connection_id", connection.id).order("provider_item_name"),
      admin.from("vestora_delivery_orders").select("id,external_order_id,customer_label,status,prep_minutes,subtotal,currency,items,kot_data,stock_deducted,kot_print_status,cancel_reason,received_at,updated_at").eq("connection_id", connection.id).order("received_at", { ascending: false }).limit(100),
      admin.from("vestora_delivery_logs").select("id,order_id,event_type,outcome,message,detail,created_at").eq("connection_id", connection.id).order("created_at", { ascending: false }).limit(100),
      admin.from("vestora_delivery_jobs").select("id,order_id,event_type,status,attempt_count,next_attempt_at,last_error,created_at,updated_at").eq("connection_id", connection.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (mappingError || orderError || logError || jobsError) return json({ error: "Could not load integration mappings and logs" }, 500);
    return json({ mappings: mappings || [], orders: orders || [], logs: logs || [], jobs: jobs || [] });
  }

  if (body.action === "mapping.save") {
    const value = body.mapping as Record<string, unknown> | null;
    if (!value) return json({ error: "Menu mapping is required" }, 400);
    const providerItemId = String(value.providerItemId || "").trim();
    const providerItemName = String(value.providerItemName || "").trim();
    const localItemId = String(value.localItemId || "").trim();
    const localItemName = String(value.localItemName || "").trim();
    const gstRate = Number(value.gstRate || 0);
    const providerPrice = Number(value.providerPrice || 0);
    const onlineStock = Number(value.onlineStock || 0);
    let addonMapping: Record<string, string>;
    try { addonMapping = typeof value.addonMapping === "string" ? JSON.parse(value.addonMapping || "{}") : value.addonMapping as Record<string, string> || {}; }
    catch { return json({ error: "Add-on mapping must be valid JSON" }, 400); }
    if (!providerItemId || !providerItemName || !localItemId || !localItemName) return json({ error: "Map both platform and UVPRO menu items" }, 400);
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100 || !Number.isFinite(providerPrice) || providerPrice < 0 || !Number.isFinite(onlineStock) || onlineStock < 0) return json({ error: "Enter valid GST, price, and non-negative online stock values" }, 400);
    if (!addonMapping || Array.isArray(addonMapping) || typeof addonMapping !== "object") return json({ error: "Add-on mapping must be a JSON object" }, 400);
    const result = await admin.from("vestora_delivery_menu_mappings").upsert({
      connection_id: connection.id, provider_item_id: providerItemId, provider_item_name: providerItemName,
      local_item_id: localItemId, local_item_name: localItemName, addon_mapping: addonMapping,
      gst_rate: gstRate, provider_price: providerPrice, online_stock: onlineStock, is_available: value.isAvailable !== false,
      kot_printer: String(value.kotPrinter || connection.settings?.kotPrinter || "").slice(0, 160), updated_at: new Date().toISOString(),
    }, { onConflict: "connection_id,provider_item_id" }).select("id,provider_item_id,provider_item_name,local_item_id,local_item_name,addon_mapping,gst_rate,provider_price,online_stock,is_available,kot_printer,updated_at").single();
    if (result.error) return json({ error: "Could not save the branch menu mapping" }, 400);
    await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, provider, event_type: "menu_mapping_saved", outcome: "success", message: `Mapping saved for ${providerItemName}` });
    return json({ mapping: result.data });
  }

  if (body.action === "mapping.delete") {
    const result = await admin.from("vestora_delivery_menu_mappings").delete().eq("connection_id", connection.id).eq("id", String(body.mappingId || "")).select("id").maybeSingle();
    if (result.error) return json({ error: "Could not remove the branch menu mapping" }, 400);
    return json({ deleted: Boolean(result.data) });
  }

  if (body.action === "simulate") {
    if (connection.mode !== "test") return json({ error: "Switch this outlet to test mode before simulating orders" }, 409);
    let normalized;
    try { normalized = normalizeSimulatorOrder(provider, body.order); }
    catch (error) { return json({ error: error instanceof Error ? error.message : "Invalid simulator order" }, 400); }
    const rawBody = JSON.stringify({ provider, outletId: connection.outlet_id, order: normalized });
    const timestamp = String(Date.now());
    const ephemeralSecret = b64(crypto.getRandomValues(new Uint8Array(32)));
    const signature = await signSimulatorRequest(rawBody, timestamp, ephemeralSecret);
    const validSignature = await verifySimulatorRequest(rawBody, timestamp, signature, ephemeralSecret);
    if (!validSignature) return json({ error: "Simulator webhook signature validation failed" }, 401);
    const { data: result, error: ingestError } = await admin.rpc("vestora_delivery_ingest_test_order", {
      p_provider: provider, p_outlet_id: connection.outlet_id, p_external_order_id: normalized.externalOrderId,
      p_payload: normalized, p_items: normalized.items, p_subtotal: normalized.subtotal,
    });
    if (ingestError) return json({ error: "Order ingest failed. Check the integration database migration and menu mappings." }, 500);
    if (result?.duplicate) {
      await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, order_id: result.order?.id, provider, event_type: "duplicate_order", outcome: "warning", message: "Duplicate external order ID ignored; stock was not deducted again", detail: { externalOrderId: normalized.externalOrderId } });
      return json({ duplicate: true, order: result.order, message: "Duplicate order ignored; no stock was deducted" });
    }
    const jobStatus = result?.stockIssue ? "blocked" : "succeeded";
    const jobError = result?.stockIssue ? String(result.stockIssue) : null;
    await admin.from("vestora_delivery_jobs").insert({
      store_id: storeId, connection_id: connection.id, order_id: result.order.id, provider,
      event_type: "test_order_acknowledgement", payload: { externalOrderId: normalized.externalOrderId },
      status: jobStatus, attempt_count: 1, last_error: jobError,
    });
    return json({ duplicate: false, order: result.order, stockIssue: result.stockIssue || null, signatureValidated: true });
  }

  if (body.action === "order.change") {
    const status = String(body.status || "").toLowerCase();
    if (!["accepted", "preparing", "ready", "rejected", "cancelled"].includes(status)) return json({ error: "Unsupported delivery order action" }, 400);
    const orderId = String(body.orderId || "");
    const { data: scopedOrder, error: lookupError } = await admin.from("vestora_delivery_orders").select("id,store_id,connection_id,provider,status").eq("id", orderId).eq("store_id", storeId).eq("connection_id", connection.id).maybeSingle();
    if (lookupError || !scopedOrder) return json({ error: "Delivery order not found in this branch" }, 404);
    const { data: order, error: actionError } = await admin.rpc("vestora_delivery_change_order", {
      p_order_id: orderId, p_status: status,
      p_prep_minutes: body.prepMinutes == null || body.prepMinutes === "" ? null : Number(body.prepMinutes),
      p_reason: String(body.reason || ""),
    });
    if (actionError) return json({ error: actionError.message }, 409);
    const liveBlocked = connection.mode === "live";
    await admin.from("vestora_delivery_jobs").insert({
      store_id: storeId, connection_id: connection.id, order_id: orderId, provider,
      event_type: `provider_${status}`, payload: { externalOrderId: order.external_order_id, status },
      status: liveBlocked ? "blocked" : "succeeded", attempt_count: 1,
      next_attempt_at: liveBlocked ? new Date(Date.now() + retryDelayMs(1)).toISOString() : null,
      last_error: liveBlocked ? "Live provider status API is disabled pending official approval and integration documentation" : null,
    });
    if (liveBlocked) await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, order_id: orderId, provider, event_type: "provider_status_sync", outcome: "warning", message: "Order updated in UVPRO; external provider sync is queued until official API access is approved" });
    return json({ order, providerSync: liveBlocked ? "pending_approval" : "test_acknowledged" });
  }

  if (body.action === "stock.change") {
    const mappingId = String(body.mappingId || "");
    const isAvailable = body.isAvailable === true;
    const result = await admin.from("vestora_delivery_menu_mappings").update({ is_available: isAvailable, updated_at: new Date().toISOString() })
      .eq("id", mappingId).eq("connection_id", connection.id).select("id,provider_item_id,provider_item_name,is_available,online_stock").maybeSingle();
    if (result.error || !result.data) return json({ error: "Menu item mapping not found for this branch" }, 404);
    await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, provider, event_type: "stock_availability", outcome: "success", message: `${result.data.provider_item_name} marked ${isAvailable ? "available" : "out of stock"}` });
    const liveBlocked = connection.mode === "live";
    await admin.from("vestora_delivery_jobs").insert({
      store_id: storeId, connection_id: connection.id, provider, event_type: "provider_stock_availability",
      payload: { providerItemId: result.data.provider_item_id, isAvailable }, status: liveBlocked ? "blocked" : "succeeded",
      attempt_count: 1, next_attempt_at: liveBlocked ? new Date(Date.now() + retryDelayMs(1)).toISOString() : null,
      last_error: liveBlocked ? "Live stock API is disabled pending official approval and integration documentation" : null,
    });
    return json({ mapping: result.data, providerSync: liveBlocked ? "pending_approval" : "test_acknowledged" });
  }

  if (body.action === "order.print-result") {
    const orderId = String(body.orderId || "");
    const printStatus = String(body.printStatus || "");
    if (!["printed", "failed", "not_configured"].includes(printStatus)) return json({ error: "Invalid KOT print result" }, 400);
    const result = await admin.from("vestora_delivery_orders").update({ kot_print_status: printStatus, updated_at: new Date().toISOString() })
      .eq("id", orderId).eq("store_id", storeId).eq("connection_id", connection.id).select("id,kot_print_status").maybeSingle();
    if (result.error || !result.data) return json({ error: "Delivery order not found in this branch" }, 404);
    await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, order_id: orderId, provider, event_type: "kot_print", outcome: printStatus === "printed" ? "success" : printStatus === "failed" ? "error" : "warning", message: `KOT print status: ${printStatus}`, detail: { printer: String(body.printer || "").slice(0, 160) } });
    return json({ order: result.data });
  }

  if (body.action === "job.retry") {
    const jobId = String(body.jobId || "");
    const { data: job, error: jobError } = await admin.from("vestora_delivery_jobs").select("id,order_id,event_type,status,attempt_count,payload,last_error")
      .eq("id", jobId).eq("store_id", storeId).eq("connection_id", connection.id).maybeSingle();
    if (jobError || !job) return json({ error: "Retry job not found in this branch" }, 404);
    if (job.status === "succeeded") return json({ job, message: "This operation already succeeded" });
    const attemptCount = Number(job.attempt_count || 0) + 1;
    const liveBlocked = connection.mode === "live";
    if (!liveBlocked && job.event_type === "test_order_acknowledgement" && job.order_id) {
      const { data: failedOrder, error: failedOrderError } = await admin.from("vestora_delivery_orders")
        .select("id,external_order_id,items,subtotal,raw_test_payload")
        .eq("id", job.order_id).eq("store_id", storeId).eq("connection_id", connection.id).maybeSingle();
      if (failedOrderError || !failedOrder) return json({ error: "The failed delivery order is no longer available" }, 404);
      const retryPayload = { ...(failedOrder.raw_test_payload || {}), retry: true };
      const { data: retried, error: ingestError } = await admin.rpc("vestora_delivery_ingest_test_order", {
        p_provider: provider, p_outlet_id: connection.outlet_id, p_external_order_id: failedOrder.external_order_id,
        p_payload: retryPayload, p_items: failedOrder.items, p_subtotal: failedOrder.subtotal,
      });
      if (ingestError) return json({ error: "Test order retry failed before stock could be updated" }, 500);
      const stockIssue = String(retried?.stockIssue || "");
      const retryResult = await admin.from("vestora_delivery_jobs").update({
        status: stockIssue ? "blocked" : "succeeded", attempt_count: attemptCount,
        next_attempt_at: stockIssue ? new Date(Date.now() + retryDelayMs(attemptCount)).toISOString() : null,
        last_error: stockIssue || null, updated_at: new Date().toISOString(),
      }).eq("id", jobId).eq("store_id", storeId).eq("connection_id", connection.id)
        .select("id,order_id,event_type,status,attempt_count,next_attempt_at,last_error").single();
      await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, order_id: job.order_id, provider, event_type: "retry", outcome: stockIssue ? "retry" : "success", message: stockIssue ? `Test order still needs review: ${stockIssue}` : "Test order revalidated and branch online stock reserved" });
      return json({ job: retryResult.data, order: retried?.order, stockIssue: stockIssue || null, message: stockIssue ? "Correct menu mapping or online stock, then retry again." : "Test order retry succeeded." });
    }
    const result = await admin.from("vestora_delivery_jobs").update({
      status: liveBlocked ? "blocked" : "succeeded", attempt_count: attemptCount,
      next_attempt_at: liveBlocked ? new Date(Date.now() + retryDelayMs(attemptCount)).toISOString() : null,
      last_error: liveBlocked ? "Retry held: live provider endpoint is not configured" : null, updated_at: new Date().toISOString(),
    }).eq("id", jobId).eq("store_id", storeId).eq("connection_id", connection.id)
      .select("id,order_id,event_type,status,attempt_count,next_attempt_at,last_error").single();
    await admin.from("vestora_delivery_logs").insert({ store_id: storeId, connection_id: connection.id, order_id: job.order_id, provider, event_type: "retry", outcome: liveBlocked ? "retry" : "success", message: liveBlocked ? "Retry scheduled but provider is awaiting approved API access" : "Test-mode retry acknowledged" });
    return json({ job: result.data, retryDelayMs: liveBlocked ? retryDelayMs(attemptCount) : 0 });
  }

  return json({ error: "Unknown online delivery action" }, 404);
});
