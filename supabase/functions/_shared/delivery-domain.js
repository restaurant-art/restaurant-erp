export const deliveryProviders = Object.freeze(["zomato", "swiggy"]);

export function canManageDeliveryIntegration(userType, assignedRole = "") {
  return ["super_admin", "owner", "restaurant_admin"].includes(String(userType || "").toLowerCase())
    || ["owner", "restaurant_admin"].includes(String(assignedRole || "").toLowerCase());
}

export function allowedDeliveryStores({ stores = [], isSuperAdmin = false, email = "", assignedStore = "", restaurantId = null }) {
  const normalizedEmail = String(email || "").toLowerCase();
  return stores.filter((store) => isSuperAdmin
    || String(store.id) === String(assignedStore || "")
    || String(store.adminEmail || "").toLowerCase() === normalizedEmail
    || (restaurantId != null && String(store.restaurantId || "") === String(restaurantId))).map((store) => String(store.id));
}

export function canAccessDeliveryStore(storeId, isSuperAdmin, allowedStoreIds) {
  return Boolean(String(storeId || "") && (isSuperAdmin || allowedStoreIds.includes(String(storeId))));
}

const transitions = Object.freeze({
  new: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing", "ready", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["cancelled"],
  rejected: [],
  cancelled: [],
  needs_review: ["accepted", "rejected", "cancelled"],
});

function normalizeTestPayload(normalizedProvider, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Order payload must be an object");

  // These are UVPRO simulator envelopes, not Zomato or Swiggy production API schemas.
  const externalOrderId = String(payload.externalOrderId || "").trim();
  const items = Array.isArray(payload.items) ? payload.items.map((item) => ({
    providerItemId: String(item?.providerItemId || "").trim(),
    name: String(item?.name || "").trim(),
    quantity: Number(item?.quantity),
    addons: Array.isArray(item?.addons) ? item.addons.map((addon) => String(addon).trim()).filter(Boolean) : [],
  })) : [];
  if (!externalOrderId || externalOrderId.length > 160) throw new Error("A valid external order ID is required");
  if (!items.length || items.length > 100) throw new Error("The test order needs between 1 and 100 items");
  if (items.some((item) => !item.providerItemId || !item.name || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100)) {
    throw new Error("Each test item needs an item ID, name, and whole-number quantity from 1 to 100");
  }
  return {
    provider: normalizedProvider,
    externalOrderId,
    customer: String(payload.customer || "Test customer").slice(0, 160),
    items,
    subtotal: Math.max(0, Number(payload.subtotal) || 0),
    currency: "INR",
    receivedAt: new Date().toISOString(),
    testMode: true,
  };
}

// Adapter registry is intentionally test-only until each provider's approved
// API, authentication, webhook signing, and status contracts are documented.
export const providerAdapters = Object.freeze(Object.fromEntries(deliveryProviders.map((provider) => [provider, Object.freeze({
  provider,
  liveEnabled: false,
  normalizeOrder: (payload) => normalizeTestPayload(provider, payload),
})])));

export function normalizeSimulatorOrder(provider, payload) {
  const adapter = providerAdapters[String(provider || "").toLowerCase()];
  if (!adapter) throw new Error("Unsupported delivery provider");
  return adapter.normalizeOrder(payload);
}

export function canTransitionDeliveryOrder(from, to) {
  return Boolean(transitions[String(from || "").toLowerCase()]?.includes(String(to || "").toLowerCase()));
}

export function stockDeltasFor(items) {
  const deltas = new Map();
  for (const item of items || []) {
    const id = String(item.providerItemId || "");
    const qty = Number(item.quantity || 0);
    if (!id || !Number.isInteger(qty) || qty < 1) throw new Error("Invalid stock item in delivery order");
    deltas.set(id, (deltas.get(id) || 0) + qty);
  }
  return [...deltas].map(([providerItemId, quantity]) => ({ providerItemId, quantity }));
}

const encodeBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const decodeBase64 = (value) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export async function signSimulatorRequest(rawBody, timestamp, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return encodeBase64(signature);
}

export async function verifySimulatorRequest(rawBody, timestamp, signature, secret, now = Date.now()) {
  const stamp = Number(timestamp);
  if (!Number.isFinite(stamp) || Math.abs(now - stamp) > 5 * 60 * 1000 || typeof signature !== "string") return false;
  const expected = decodeBase64(await signSimulatorRequest(rawBody, stamp, secret));
  let actual;
  try { actual = decodeBase64(signature); } catch { return false; }
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

export function retryDelayMs(attempt) {
  const safeAttempt = Math.max(1, Math.min(16, Number(attempt) || 1));
  return Math.min(60 * 60 * 1000, 1000 * 2 ** safeAttempt);
}
