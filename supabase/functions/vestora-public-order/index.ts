import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Public ordering is not configured" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(request.url);
  const storeId = url.searchParams.get("storeId") || "";
  const tableId = url.searchParams.get("tableId") || "";
  // A store QR opens the public menu before a table has been selected. Keep
  // this endpoint guest-accessible for that first screen; a table is still
  // required and validated when the customer submits an order.
  if (!storeId) return json({ error: "Store is required" }, 400);

  const { data: menuState, error: menuError } = await admin.from("vestora_shared_app_state").select("state_value").eq("state_key", `vestora-menu-items-${storeId}`).maybeSingle();
  if (menuError) return json({ error: menuError.message }, 500);
  const { data: tableState, error: tableError } = await admin.from("vestora_shared_app_state").select("state_value").eq("state_key", `vestora-tables-${storeId}`).maybeSingle();
  if (tableError) return json({ error: tableError.message }, 500);
  const items = Array.isArray(menuState?.state_value) ? menuState.state_value : [];
  const tables = Array.isArray(tableState?.state_value) ? tableState.state_value : [];
  const table = tableId ? tables.find((entry) => String(entry?.id) === tableId) : null;
  const publicTables = tables.filter((entry) => entry?.status !== "Cleaning").map((entry) => ({ id: entry.id, name: entry.name, floor: entry.floor, seats: entry.seats }));
  if (request.method === "GET") return json({ table: table ? { id: table.id, name: table.name, floor: table.floor, seats: table.seats } : null, tables: publicTables, items: items.filter((item) => (item?.status || "Active") === "Active").map((item) => ({ id: item.id, name: item.name, category: item.category, price: Number(item.price || 0), tax: Number(item.tax || 0), status: "Active" })) });
  if (!table) return json({ error: "This table is not available for ordering" }, 404);
  if (request.method !== "POST") return json({ error: "Method not supported" }, 405);

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.items) || !body.items.length) return json({ error: "Choose at least one item" }, 400);
  const catalog = new Map(items.map((item) => [String(item?.id), item]));
  const validatedItems = body.items.map((entry: Record<string, unknown>) => {
    const source = catalog.get(String(entry.id));
    const qty = Math.max(1, Math.min(50, Number(entry.qty || 1)));
    if (!source || (source.status || "Active") !== "Active") return null;
    return { id: source.id, name: source.name, price: Number(source.price || 0), qty, notes: String(entry.notes || "").slice(0, 240) };
  }).filter(Boolean) as Array<{ id: string; name: string; price: number; qty: number; notes: string }>;
  if (!validatedItems.length) return json({ error: "The selected items are no longer available" }, 400);
  const subtotal = validatedItems.reduce((sum, item) => sum + Number(item.price) * Number(item.qty), 0);
  const orderNumber = `QR-${Date.now().toString().slice(-8)}`;
  const payload = {
    order_number: orderNumber,
    store_id: storeId,
    table_id: table.id,
    table_name: String(table.name),
    floor: String(table.floor || "Main"),
    customer_name: String(body.customerName || "Guest").trim().slice(0, 60) || "Guest",
    customer_note: String(body.customerNote || "").trim().slice(0, 240),
    guest_count: Math.max(1, Math.min(Number(table.seats || 1), Number(body.guestCount || 1))),
    items: validatedItems,
    item_count: validatedItems.reduce((sum, item) => sum + Number(item.qty), 0),
    subtotal,
    status: "New",
  };
  const { error: insertError } = await admin.from("vestora_public_orders").insert(payload);
  if (insertError) return json({ error: insertError.message }, 400);
  return json({ orderNumber, status: "New" }, 201);
});
