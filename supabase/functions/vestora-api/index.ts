import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
  const { data: profile, error: profileError } = await admin
    .from("core_user")
    .select("id, email, restaurant_id, user_type, is_superuser")
    .eq("email", user.email ?? "")
    .maybeSingle();
  if (profileError || !profile) return json({ error: "VESTORA profile is not linked to this Supabase user" }, 403);

  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const apiIndex = pathParts.indexOf("vestora-api");
  const resource = apiIndex >= 0 ? pathParts[apiIndex + 1] : undefined;
  const recordId = apiIndex >= 0 ? pathParts[apiIndex + 2] : undefined;
  if (resource === "profile") {
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
      id: profile.id,
      email: profile.email,
      restaurantId: profile.restaurant_id,
      role: profile.user_type,
      appRole: appRoleByType[profile.user_type] || profile.user_type,
      isSuperuser: Boolean(profile.is_superuser),
      status: "Active",
    });
  }
  if (resource === "health") {
    const { error: databaseError } = await admin.from("django_migrations").select("id").limit(1);
    return json({ ok: !databaseError, user_id: user.id, database: databaseError ? "unavailable" : "ok" }, databaseError ? 503 : 200);
  }
  if (resource === "state") {
    if (request.method === "GET") {
      const key = url.searchParams.get("key");
      let stateQuery = admin.from("vestora_app_state").select("state_key, state_value, updated_at").eq("user_id", user.id);
      if (key) stateQuery = stateQuery.eq("state_key", key);
      const { data, error: stateError } = await stateQuery;
      if (stateError) return json({ error: stateError.message }, 500);
      return json(data ?? []);
    }
    if (request.method === "PUT") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body.key !== "string") return json({ error: "A state key is required" }, 400);
      const { data, error: stateError } = await admin.from("vestora_app_state").upsert({ user_id: user.id, state_key: body.key, state_value: body.value ?? null, updated_at: new Date().toISOString() }).select("state_key, state_value, updated_at").single();
      if (stateError) return json({ error: stateError.message }, 500);
      return json(data);
    }
    if (request.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) return json({ error: "A state key is required" }, 400);
      const { error: deleteError } = await admin.from("vestora_app_state").delete().eq("user_id", user.id).eq("state_key", key);
      if (deleteError) return json({ error: deleteError.message }, 500);
      return json({ ok: true, key });
    }
    return json({ error: "State endpoint supports GET, PUT, and DELETE" }, 405);
  }
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
  };
  const table = resource ? tableByResource[resource] : undefined;
  if (!table) return json({ error: "Unknown API resource" }, 404);

  const isSuperAdmin = Boolean(profile.is_superuser || profile.user_type === "super_admin");
  const tenantTables = ["core_branch", "core_role", "core_user", "core_menucategory", "core_menuitem", "core_table", "core_customer", "core_order", "core_inventoryitem", "core_stockmovement", "core_supplier", "core_purchaseorder", "core_expense", "core_employeeprofile", "core_attendance", "core_supportticket", "core_integrationsetting", "core_printer"];
  const tenantScoped = !isSuperAdmin && tenantTables.includes(table);
  const safeSelect = table === "core_user"
    ? "id,email,username,first_name,last_name,user_type,restaurant_id,role_id,is_active,mobile,two_factor_enabled,custom_permissions,is_superuser"
    : "*";

  if (request.method === "POST") {
    if (table === "core_user") return json({ error: "Create users through Supabase Auth and the profile-linking flow" }, 405);
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
    let scoped = admin.from(table).select("id").eq("id", recordId);
    if (tenantScoped) scoped = scoped.eq("restaurant_id", profile.restaurant_id);
    const { data: existing, error: lookupError } = await scoped.maybeSingle();
    if (lookupError) return json({ error: lookupError.message }, 500);
    if (!existing) return json({ error: "Record not found" }, 404);
    if (request.method === "DELETE") {
      const { error: deleteError } = await admin.from(table).delete().eq("id", recordId);
      if (deleteError) return json({ error: deleteError.message }, 400);
      return json({ ok: true, id: recordId });
    }
    const body = await request.json().catch(() => null);
    if (!body || Array.isArray(body) || typeof body !== "object") return json({ error: "A JSON object is required" }, 400);
    const payload = { ...(body as Record<string, unknown>) };
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
  const branch = url.searchParams.get("branch");
  if (branch && ["core_branch", "core_menucategory", "core_menuitem", "core_table", "core_customer", "core_order", "core_inventoryitem", "core_stockmovement", "core_supplier", "core_purchaseorder", "core_expense", "core_employeeprofile", "core_attendance", "core_supportticket", "core_printer"].includes(table)) {
    query = query.eq("branch_id", branch);
  }
  const { data, error: queryError } = recordId ? await query.maybeSingle() : await query;
  if (queryError) return json({ error: queryError.message }, 500);
  return json(recordId ? data : (data ?? []));
});
