import { cloudRequestJson, syncLocalStateKeyToCloud } from "./cloud.js";
import { createProductionTransport, orderStockLines, stockLineKey, fulfillmentTargets } from "./production-transport.js";
export { orderStockLines, stockLineKey } from "./production-transport.js";

export const kitchenPath = (storeId, suffix = "") => `/api/production/${encodeURIComponent(storeId)}/${suffix}`;

async function request(path, options = {}) {
  const response = await cloudRequestJson(path, options);
  const body = await response.json();
  if (!response.ok) {
    const detail = body?.error || body?.detail || (Array.isArray(body) ? body.join(" ") : JSON.stringify(body));
    const error = new Error(detail || "Production request failed");
    error.status = response.status;
    throw error;
  }
  return body;
}

export const loadKitchen = (storeId, order = "") => request(kitchenPath(storeId, order ? `?order=${encodeURIComponent(order)}` : ""));
const checkoutStock = (storeId, order = "") => request(kitchenPath(storeId, `?view=checkout&order=${encodeURIComponent(order)}`));
export const loadKitchenReport = (storeId, day, batch = "") => request(kitchenPath(storeId, `reports/?date=${encodeURIComponent(day)}${batch ? `&batch=${encodeURIComponent(batch)}` : ""}`));
export const loadPostedSaleCosts = (storeId, references) => request(kitchenPath(storeId, "sale-costs/"), {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ references }),
});
export const setupKitchen = (storeId, branch) => request(kitchenPath(storeId, "setup/"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branch }) });
export async function kitchenCommand(storeId, command, data, key = crypto.randomUUID(), preview = false) {
  const result = await request(kitchenPath(storeId, "command/"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, data, key, preview }) });
  if (!preview) {
    window.dispatchEvent(new CustomEvent("uvpro-kitchen-updated", { detail: { storeId } }));
    if (result.effects?.length || ["product", "product_status", "repack"].includes(command)) {
      await syncLocalStateKeyToCloud(`vestora-inventory-${storeId}`).catch(() => {});
    }
  }
  return result;
}

// Confirmation is online and server-authoritative. No optimistic stock changes
// enter the generic offline shared-state queue. Retrying preserves the key/body.
const transport = createProductionTransport({ storage: window.localStorage, send: kitchenCommand });
export async function reliableKitchenCommand(storeId, command, data, logicalKey) {
  return transport.execute(storeId, command, data, logicalKey);
}
export const pendingKitchenCommand = (storeId, logicalKey) => transport.pending(storeId, logicalKey);
export const resumeKitchenCommand = (storeId, logicalKey) => transport.resume(storeId, logicalKey);

export async function confirmKitchenOrder(storeId, order) {
  const retail = order.salesChannel === "Supermarket POS";
  const pending = transport.pending(storeId, `confirm:${order.id}`);
  if (pending) {
    const previous = pending.data.lines.map(({ key, menu_key, quantity }) => ({ key, menu_key, quantity }));
    const next = orderStockLines(order.items).map(({ key, menu_key, quantity }) => ({ key, menu_key, quantity }));
    if (JSON.stringify(previous) !== JSON.stringify(next)) throw new Error("Retry the original confirmed quantities before changing this order.");
    return transport.resume(storeId, `confirm:${order.id}`);
  }
  const workspace = await checkoutStock(storeId, order.id);
  if (!workspace.enabled) return null;
  const existing = workspace.orders.find((entry) => entry.reference === order.id);
  const location = existing?.location || order.stockLocation || workspace.locations.find((entry) => entry.name === (retail ? "Main store" : "Kitchen"))?.id;
  if (!location) throw new Error("Select a kitchen in Production setup before confirming orders.");
  const data = { reference: String(order.id), location, lines: orderStockLines(order.items, existing?.lines, retail) };
  return reliableKitchenCommand(storeId, "confirm", data, `confirm:${order.id}`);
}

export async function serveKitchenOrder(storeId, reference, items, source, expectedPrevious = null) {
  const workspace = await checkoutStock(storeId, reference);
  if (!workspace.enabled) return null;
  const order = workspace.orders.find((entry) => entry.reference === reference);
  if (!order) throw new Error("This order has no confirmed stock snapshot. Confirm its KOT first; historic bills are not replayed.");
  const targets = fulfillmentTargets(items, order.lines);
  return reliableKitchenCommand(storeId, "fulfill", { reference, targets, source,
    ...(expectedPrevious ? { expected_previous: expectedPrevious } : {}) }, `serve:${source}`);
}

export async function cancelKitchenOrder(storeId, order, reason, item = null, physicallyUsed = false) {
  const workspace = await checkoutStock(storeId, order.id);
  if (!workspace.enabled) return null;
  if (!workspace.orders.some((entry) => entry.reference === order.id)) return null; // unconfirmed draft
  return reliableKitchenCommand(storeId, "cancel", { reference: String(order.id), reason,
    disposition: physicallyUsed ? "waste" : "no_return", ...(item ? { line: stockLineKey(item) } : {}),
    ...(physicallyUsed ? { used_targets: Object.fromEntries((item ? [item] : order.items).map((i) => [stockLineKey(i), String(i.qty)])) } : {}) }, `cancel:${order.id}:${item ? stockLineKey(item) : "all"}`);
}

export async function postKitchenPurchase(storeId, payload) {
  const workspace = await checkoutStock(storeId);
  if (!workspace.enabled) return false;
  await syncLocalStateKeyToCloud(`vestora-purchase-drafts-${storeId}`);
  const location = workspace.locations.find((l) => l.name === "Main store")?.id;
  if (!location) throw new Error("Configure the Main store receipt location in Production setup.");
  const result = transport.pending(storeId, `purchase:${payload.source}`)
    ? await transport.resume(storeId, `purchase:${payload.source}`)
    : await reliableKitchenCommand(storeId, "purchase", { ...payload, location }, `purchase:${payload.source}`);
  await Promise.all(["inventory", "inventory-transactions", "purchase-drafts"].map((prefix) => syncLocalStateKeyToCloud(`vestora-${prefix}-${storeId}`)));
  return result;
}

export async function postKitchenPurchaseReturn(storeId, payload) {
  const workspace = await checkoutStock(storeId);
  if (!workspace.enabled) return false;
  const location = workspace.locations.find((l) => l.name === "Main store")?.id;
  if (!location) throw new Error("Configure the Main store return location in Production setup.");
  const result = await reliableKitchenCommand(storeId, "purchase_return", { ...payload, location }, `return:${payload.source}`);
  await Promise.all(["inventory", "inventory-transactions"].map((prefix) => syncLocalStateKeyToCloud(`vestora-${prefix}-${storeId}`)));
  return result;
}

export async function postBulkRepack(storeId, location, direction, lines, reason = "") {
  const logicalKey = `bulk-repacking:${direction}`;
  const result = transport.pending(storeId, logicalKey)
    ? await transport.resume(storeId, logicalKey)
    : await reliableKitchenCommand(storeId, "repack", { location, direction, lines, reason }, logicalKey);
  await syncLocalStateKeyToCloud(`vestora-inventory-transactions-${storeId}`).catch(() => {});
  return result;
}
