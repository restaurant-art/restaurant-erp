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
  if (url.pathname.endsWith("/health")) {
    const { error: databaseError } = await admin.from("django_migrations").select("id").limit(1);
    return json({ ok: !databaseError, user_id: user.id, database: databaseError ? "unavailable" : "ok" }, databaseError ? 503 : 200);
  }

  const resource = url.pathname.split("/").filter(Boolean).at(-1);
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

  let query = admin.from(table).select("*");
  const isSuperAdmin = Boolean(profile.is_superuser || profile.user_type === "super_admin");
  if (!isSuperAdmin && table !== "core_restaurant" && table !== "core_subscriptionplan") {
    query = query.eq("restaurant_id", profile.restaurant_id);
  }
  const branch = url.searchParams.get("branch");
  if (branch && ["core_branch", "core_menucategory", "core_menuitem", "core_table", "core_customer", "core_order", "core_inventoryitem", "core_stockmovement", "core_supplier", "core_purchaseorder", "core_expense", "core_employeeprofile", "core_attendance", "core_supportticket", "core_printer"].includes(table)) {
    query = query.eq("branch_id", branch);
  }
  const { data, error: queryError } = await query;
  if (queryError) return json({ error: queryError.message }, 500);
  return json(data ?? []);
});
