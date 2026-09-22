import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sharedSuperAdminStateKeys = new Set(["vestora-stores"]);
// Business snapshots can contain nested user/settings objects. Their secrets
// must not become shared merely because the outer storage key is shareable.
const stripStateSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripStateSecrets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/(password|token|credential|secret|access.?key|api.?key)/i.test(key))
    .map(([key, entry]) => [key, stripStateSecrets(entry)]));
  return value;
};
const globalKeys = new Set(["vestora-stores", "vestora-users", "vestora-custom-roles", "vestora-sales-ledger", "vestora-void-ledger", "vestora-refund-ledger", "vestora-kds-orders", "vestora-table-orders", "vestora-supplier-orders"]);
const storePrefixes = ["active-settings","attendance-employees","attendance-logs","attendance-records","attendance-report","attendance-settings","finance-bank-accounts","finance-expenses","finance-journals","finance-ledgers","finance-receipts","finance-vendor-payments","finished-goods","floors","food-stock","inventory-categories","inventory-transactions","inventory","last-shift-close","shifts", "shift-history","leave-requests","menu-items","menu-setup","offers","payroll-attendance","production-batches","production-categories","production-wastage","recipes","tables","bill-template","theme-config","supplier-documents","customer-details"];
const stateStore = (key: string) => { const prefix = storePrefixes.find((name) => key.startsWith(`vestora-${name}-`)); return prefix ? key.slice(`vestora-${prefix}-`.length) : null; };
const isBusinessKey = (key: string) => globalKeys.has(key) || stateStore(key) !== null;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Supabase function is not configured" }, 500);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return json({ error: "Authentication required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: coreProfile, error: profileError } = await admin
    .from("core_user")
    .select("id, email, restaurant_id, user_type, is_superuser, is_active")
    .eq("email", user.email ?? "")
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);


  // Only admin-controlled assignments grant access. Never trust user_metadata
  // (which users can change themselves) or a storeId supplied in a request.
  const assigned = user.app_metadata?.vestora;
  const profile = coreProfile || (assigned ? { id: user.id, email: user.email, restaurant_id: null, user_type: assigned.role, is_superuser: false, is_active: assigned.active !== false } : null);
  if (profile?.is_active === false || assigned?.active === false) return json({ error: "This account is inactive" }, 403);
  const isPlatformAdmin = Boolean(profile?.is_superuser || profile?.user_type === "super_admin");
  const { data: directoryRow, error: directoryError } = await admin.from("vestora_shared_app_state").select("state_value").eq("state_key", "vestora-stores").maybeSingle();
  const { data: staffRow, error: staffError } = await admin.from("vestora_shared_app_state").select("state_value").eq("state_key", "vestora-users").maybeSingle();
  if (directoryError || staffError) return json({ error: "Store access could not be verified" }, 503);
  const directory = Array.isArray(directoryRow?.state_value) ? directoryRow.state_value : [];
  const staff = Array.isArray(staffRow?.state_value) ? staffRow.state_value : [];
  const email = String(user.email || "").toLowerCase();
  const linkedStaff = staff.find((entry) => String(entry.email || "").toLowerCase() === email && entry.status !== "Inactive");
  const assignedStore = assigned?.storeId || linkedStaff?.storeId;
  const allowedStoreIds = directory.filter((store) => isPlatformAdmin || String(store.id) === String(assignedStore || "") || String(store.adminEmail || "").toLowerCase() === email || (profile?.restaurant_id != null && String(store.restaurantId || "") === String(profile.restaurant_id))).map((store) => String(store.id));
  const canStore = (storeId: string) => isPlatformAdmin || allowedStoreIds.includes(String(storeId));
  const canKey = (key: string) => isBusinessKey(key) && (!stateStore(key) || canStore(stateStore(key)!));
  const scopeValue = (key: string, value: unknown) => {
    if (isPlatformAdmin || stateStore(key) || !Array.isArray(value)) return value;
    return value.filter((item) => key === "vestora-stores" ? canStore(String(item.id)) : canStore(String(item.storeId || "")));
  };

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const apiIndex = pathParts.indexOf("vestora-api");
  const resource = apiIndex >= 0 ? pathParts[apiIndex + 1] : undefined;
  const recordId = apiIndex >= 0 ? pathParts[apiIndex + 2] : undefined;
  if (resource === "profile") {
    if (!profile) return json({ error: "This login is not linked to a VESTORA restaurant profile" }, 403);
    const appRoleByType: Record<string, string> = {
      super_admin: "Super Admin",
      owner: "Restaurant Owner",
      restaurant_admin: "Restaurant Admin",
      branch_manager: "Branch Manager",
      manager: "Manager",
      cashier: "Cashier",
      waiter: "Waiter",
      kitchen_staff: "Chef",
      chef: "Chef",
      inventory_manager: "Inventory Manager",
      purchase_manager: "Purchase Manager",
      hr_manager: "HR Manager",
      accountant: "Accountant",
      delivery_boy: "Delivery Boy",
      customer: "Customer",
    };
    return json({
      id: profile?.id || user.id,
      email: profile?.email || user.email,
      restaurantId: profile?.restaurant_id || null,
      role: profile?.user_type || "cashier",
      appRole: assigned?.appRole || (profile ? (appRoleByType[profile.user_type] || profile.user_type) : "Cashier"),
      isSuperuser: Boolean(profile?.is_superuser),
      status: "Active",
      storeId: assignedStore || allowedStoreIds[0] || "GLOBAL",
      allowedStoreIds,
    });
  }
  if (resource === "health") {
    const { error: databaseError } = await admin.from("django_migrations").select("id").limit(1);
    return json({ ok: !databaseError, user_id: user.id, database: databaseError ? "unavailable" : "ok" }, databaseError ? 503 : 200);
  }

  if (resource === "cashier-login" && request.method === "POST") {
    if (!profile) return json({ error: "Staff sign-in required" }, 403);
    const body = await request.json().catch(() => null);
    const cashier = staff.find((entry) => String(entry.email || "").toLowerCase() === String(body?.email || "").toLowerCase() && entry.role === "Cashier" && entry.status === "Active");
    if (!cashier || !canStore(String(cashier.storeId))) return json({ error: "Cashier is not available in this store" }, 403);
    const isolated = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error: loginError } = await isolated.auth.signInWithPassword({ email: cashier.email, password: String(body?.password || "") });
    if (loginError || !data.user) return json({ error: "Incorrect cashier sign-in details" }, 403);
    return json(stripStateSecrets(cashier));
  }
  if (resource === "staff-account" && request.method === "POST") {
    if (!profile || (!isPlatformAdmin && !["owner", "restaurant_admin"].includes(profile.user_type))) return json({ error: "Administrator permission required" }, 403);
    const body = await request.json().catch(() => null);
    const storeId = String(body?.storeId || "");
    const email = String(body?.email || "").trim().toLowerCase();
    const name = String(body?.name || "").trim();
    const roleNames: Record<string, string> = { "Restaurant Admin": "restaurant_admin", "Restaurant Owner": "owner", "Cashier": "cashier", "Waiter": "waiter", "Chef": "chef", "Inventory Manager": "inventory_manager", "Accountant": "accountant", "Manager": "manager", "HR Manager": "hr_manager", "Purchase Manager": "purchase_manager", "Supplier": "supplier" };
    if (!email.includes("@")) return json({ error: "Valid staff email required" }, 400);
    if (email === String(user.email || "").toLowerCase()) return json({ error: "You cannot change or deactivate the account currently signed in. Use Account security to change its password." }, 400);
    const { data: protectedProfile, error: protectedProfileError } = await admin.from("core_user").select("user_type,is_superuser").eq("email", email).maybeSingle();
    if (protectedProfileError) return json({ error: "Unable to verify the protected account" }, 503);
    if (protectedProfile?.is_superuser || protectedProfile?.user_type === "super_admin") return json({ error: "Super Admin accounts cannot be reassigned as staff users." }, 403);
    const assignedRole = roleNames[body.role] || "cashier";
    let authUser = null;
    for (let page = 1; page <= 100; page++) {
      const { data, error: listError } = await admin.auth.admin.listUsers({ page, perPage: 100 });
      if (listError) return json({ error: "Unable to verify staff account" }, 503);
      authUser = data.users.find((entry) => String(entry.email).toLowerCase() === email);
      if (authUser || data.users.length < 100) break;
    }
    if (body?.action === "delete") {
      if (!authUser) return json({ deleted: true });
      if (!isPlatformAdmin) {
        const assignedStoreId = String(authUser.app_metadata?.vestora?.storeId || "");
        if (!directory.some((store) => store.id === storeId) || !canStore(storeId) || assignedStoreId !== storeId) return json({ error: "Store access denied" }, 403);
        if (["owner", "restaurant_admin", "super_admin"].includes(String(authUser.app_metadata?.vestora?.role || ""))) return json({ error: "This login cannot be deleted by this administrator" }, 403);
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(authUser.id);
      if (deleteError) return json({ error: deleteError.message }, 400);
      return json({ deleted: true });
    }
    if (!name || body?.role === "Super Admin") return json({ error: "Valid staff name and store role required" }, 400);
    if (!directory.some((store) => store.id === storeId) || !canStore(storeId)) return json({ error: "Store access denied" }, 403);
    if (!isPlatformAdmin && ["Restaurant Admin", "Restaurant Owner"].includes(body.role)) return json({ error: "Super Admin permission required to manage administrator logins" }, 403);
    if (authUser && !isPlatformAdmin && (!canStore(String(authUser.app_metadata?.vestora?.storeId || "")) || ["owner", "restaurant_admin", "super_admin"].includes(authUser.app_metadata?.vestora?.role))) return json({ error: "This login cannot be reassigned by this administrator" }, 403);
    const password = String(body.password || "");
    if ((!authUser || password) && password.length < 8) return json({ error: "Use a password of at least 8 characters" }, 400);
    const app_metadata = { ...(authUser?.app_metadata || {}), vestora: { storeId, role: assignedRole, appRole: body.role, active: body.status !== "Inactive" } };
    const result = authUser
      ? await admin.auth.admin.updateUserById(authUser.id, { app_metadata, user_metadata: { name }, ...(password ? { password } : {}) })
      : await admin.auth.admin.createUser({ email, password, email_confirm: true, app_metadata, user_metadata: { name } });
    if (result.error) return json({ error: result.error.message }, 400);
    return json({ authUserId: result.data.user.id });
  }
  if (resource === "state") {
    if (!profile) return json({ error: "This login is not linked to a VESTORA restaurant profile" }, 403);
    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      const requestedStore = url.searchParams.get("storeId");
      if ((key && !canKey(key)) || (requestedStore && !canStore(requestedStore))) return json({ error: "Store access denied" }, 403);
      let query = admin.from("vestora_shared_app_state").select("state_key, state_value, updated_at");
      if (key) query = query.eq("state_key", key);
      const { data, error: stateError } = await query;
      if (stateError) return json({ error: stateError.message }, 500);
      return json((data || []).filter((row) => canKey(row.state_key) && (!requestedStore || !stateStore(row.state_key) || stateStore(row.state_key) === requestedStore)).map((row) => ({ ...row, state_value: stripStateSecrets(scopeValue(row.state_key, row.state_value)) })));
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.key !== "string" || !isBusinessKey(body.key)) return json({ error: "A supported business state key is required" }, 400);
      if (!canKey(body.key)) return json({ error: "Store access denied" }, 403);
      const managesStaff = isPlatformAdmin || ["owner", "restaurant_admin"].includes(profile.user_type);
      if (["vestora-users", "vestora-custom-roles"].includes(body.key) && !managesStaff) return json({ error: "Administrator permission required" }, 403);
      if (!("expectedUpdatedAt" in body)) return json({ error: "Refresh this app to save shared data safely" }, 409);
      if (body.expectedUpdatedAt !== null && typeof body.expectedUpdatedAt !== "string") return json({ error: "Invalid shared data version" }, 400);
      if (typeof body.mutationId !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.mutationId)) return json({ error: "Refresh this app to enable reliable store synchronization" }, 409);
      let value = stripStateSecrets(body.value ?? null);
      // Global arrays contain store-tagged records. Retain all records outside
      // this login's scope and compare the complete row's version atomically.
      if (!isPlatformAdmin && globalKeys.has(body.key)) {
        if (!Array.isArray(value)) return json({ error: "Expected a list of store records" }, 400);
        if (value.some((item) => !canStore(String(body.key === "vestora-stores" ? item.id : item.storeId || "")))) return json({ error: "Cannot change records from another store" }, 403);
        const { data: previous, error: readError } = await admin.from("vestora_shared_app_state").select("state_value").eq("state_key", body.key).maybeSingle();
        if (readError) return json({ error: readError.message }, 500);
        const old = Array.isArray(previous?.state_value) ? previous.state_value : [];
        if (body.key === "vestora-stores") {
          if (!managesStaff || value.some((item) => !old.some((entry) => entry.id === item.id)) || value.length !== old.filter((entry) => canStore(String(entry.id))).length) return json({ error: "Super Admin permission required to create or delete stores" }, 403);
          const protectedFields = ["id", "parentStoreId", "restaurantId", "adminEmail", "status"];
          if (value.some((item) => protectedFields.some((field) => JSON.stringify(item[field]) !== JSON.stringify(old.find((entry) => entry.id === item.id)?.[field])))) return json({ error: "Super Admin permission required to change store access" }, 403);
        }
        if (body.key === "vestora-users") {
          if (value.some((item) => ["Super Admin", "Restaurant Admin", "Restaurant Owner"].includes(item.role) && JSON.stringify(item) !== JSON.stringify(old.find((entry) => String(entry.id) === String(item.id))))) return json({ error: "Super Admin permission required to change administrator accounts" }, 403);
        }
        value = [...value, ...old.filter((item) => !canStore(String(body.key === "vestora-stores" ? item.id : item.storeId || "")))];
      }
      const { data, error: writeError } = await admin.rpc("vestora_write_shared_state", {
        p_user_id: user.id, p_operation_id: body.mutationId, p_key: body.key,
        p_value: value, p_request_value: stripStateSecrets(body.value ?? null), p_expected: body.expectedUpdatedAt,
      });
      if (data?.conflict) return json({ error: "Data changed on another device; retry with the latest version" }, 409);
      if (writeError) return json({ error: writeError.message }, 500);
      return json({ ...data, state_value: scopeValue(body.key, data.state_value) });
    }
    return json({ error: "Method not supported" }, 405);
  }

  if (!profile) return json({ error: "This Supabase user is not linked to a VESTORA restaurant profile" }, 403);
  const tableByResource: Record<string, string> = {
    restaurants: "core_restaurant",
    branches: "core_branch",
    roles: "core_role",
    users: "core_user",
    "menu-categories": "core_menucategory",
    "menu-items": "core_menuitem",
    tables: "core_table",
    customers: "core_customer",
    orders: "core_order",
    "inventory-items": "core_inventoryitem",
    "stock-movements": "core_stockmovement",
    suppliers: "core_supplier",
    "purchase-orders": "core_purchaseorder",
    expenses: "core_expense",
    employees: "core_employeeprofile",
    attendance: "core_attendance",
    "support-tickets": "core_supportticket",
    announcements: "core_announcement",
    integrations: "core_integrationsetting",
    printers: "core_printer",
    "public-orders": "vestora_public_orders",
  };
  const table = resource ? tableByResource[resource] : undefined;
  if (!table) return json({ error: "Unknown API resource" }, 404);

  const isSuperAdmin = Boolean(profile.is_superuser || profile.user_type === "super_admin");
  if (table === "vestora_public_orders" && !isSuperAdmin) {
    const requestedStore = url.searchParams.get("storeId");
    if (requestedStore && !canStore(requestedStore)) return json({ error: "Store access denied" }, 403);
  }
  const tenantTables = ["core_branch", "core_role", "core_user", "core_menucategory", "core_menuitem", "core_table", "core_customer", "core_order", "core_inventoryitem", "core_stockmovement", "core_supplier", "core_purchaseorder", "core_expense", "core_employeeprofile", "core_attendance", "core_supportticket", "core_integrationsetting", "core_printer"];
  const tenantScoped = !isSuperAdmin && tenantTables.includes(table);
  const safeSelect = table === "core_user"
    ? "id,email,username,first_name,last_name,user_type,restaurant_id,role_id,is_active,mobile,two_factor_enabled,custom_permissions,is_superuser"
    : "*";

  if (request.method === "POST") {
    if (table === "core_user") return json({ error: "Create users through Supabase Auth and the profile-linking flow" }, 405);
    if (table === "vestora_public_orders") return json({ error: "Public orders are created through the customer ordering endpoint" }, 405);
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "A JSON object is required" }, 400);
    const payload = { ...(body as Record<string, unknown>) };
    delete payload.id;
    delete payload.created_at;
    delete payload.updated_at;
    if (tenantScoped) payload.restaurant_id = profile.restaurant_id;
    const { data, error: insertError } = await admin.from(table).insert(payload).select(safeSelect).single();
    if (insertError) return json({ error: insertError.message }, 400);
    return json(data, 201);
  }

  if (recordId && ["PATCH", "DELETE"].includes(request.method)) {
    let scoped = admin.from(table).select(table === "vestora_public_orders" ? "id,store_id" : "id").eq("id", recordId);
    if (tenantScoped) scoped = scoped.eq("restaurant_id", profile.restaurant_id);
    const { data: existing, error: lookupError } = await scoped.maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, 500);
    if (!existing) return json({ error: "Record not found" }, 404);
    if (table === "vestora_public_orders" && !canStore(existing.store_id)) return json({ error: "Store access denied" }, 403);
    if (request.method === "DELETE") {
      const { error: deleteError } = await admin.from(table).delete().eq("id", recordId);
      if (deleteError) return json({ error: deleteError.message }, 400);
      return json({ ok: true, id: recordId });
    }
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "A JSON object is required" }, 400);
    const payload = { ...(body as Record<string, unknown>) };
    if (table === "vestora_public_orders" && Object.keys(payload).some((key) => !["status"].includes(key))) return json({ error: "Only order status may be updated" }, 400);
    delete payload.id;
    delete payload.restaurant_id;
    delete payload.created_at;
    delete payload.updated_at;
    payload.updated_at = new Date().toISOString();
    const { data, error: updateError } = await admin.from(table).update(payload).eq("id", recordId).select(safeSelect).single();
    if (updateError) return json({ error: updateError.message }, 400);
    return json(data);
  }

  if (request.method !== "GET") return json({ error: "Method not supported for this resource" }, 405);
  let query = admin.from(table).select(safeSelect);
  if (tenantScoped) query = query.eq("restaurant_id", profile.restaurant_id);
  if (recordId) query = query.eq("id", recordId);
  if (table === "vestora_public_orders") {
    if (!isSuperAdmin) query = query.in("store_id", allowedStoreIds);
    const storeId = url.searchParams.get("storeId");
    if (storeId) query = query.eq("store_id", storeId);
    if (url.searchParams.get("open") === "1") query = query.in("status", ["New", "KOT sent", "Ready for billing"]);
    query = query.order("created_at", { ascending: false }).limit(100);
  }
  const branch = url.searchParams.get("branch");
  if (branch && ["core_branch", "core_menucategory", "core_menuitem", "core_table", "core_customer", "core_order", "core_inventoryitem", "core_stockmovement", "core_supplier", "core_purchaseorder", "core_expense", "core_employeeprofile", "core_attendance", "core_supportticket", "core_printer"].includes(table)) {
    query = query.eq("branch_id", branch);
  }
  const { data, error: queryError } = recordId ? await query.maybeSingle() : await query;
  if (queryError) return json({ error: queryError.message }, 500);
  return json(recordId ? data : (data ?? []));
});
