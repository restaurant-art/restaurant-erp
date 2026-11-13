// Deliberately has no cloud, browser storage, printer, or network dependencies.
// Nothing from this session can be queued for later synchronization.
export function createPracticeStorage(seed = {}) {
  const records = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  const listeners = new Set();
  let active = true;
  const notify = () => [...listeners].forEach((listener) => listener());
  const storage = {
    getItem: (key) => active ? records.get(key) ?? null : null,
    setItem(key, value) {
      if (!active) return;
      const serialized = String(value);
      if (records.get(key) === serialized) return;
      records.set(key, serialized);
      notify();
    },
    removeItem(key) { if (active && records.delete(key)) notify(); },
  };
  return {
    storage,
    subscribe(listener) { if (active) listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { active = false; records.clear(); listeners.clear(); },
  };
}

export function readPracticeValue(storage, key, fallback = []) {
  try { return JSON.parse(storage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}

export async function requestTrainingOtp(cashier, storeId, request) {
  if (!cashier?.email || !storeId) throw new Error("Select a cashier to receive a WhatsApp code.");
  const result = await request("training-otp/request", { method: "POST", body: JSON.stringify({ email: cashier.email, storeId: String(storeId) }) });
  if (result?.otpRequired !== false && !result?.challengeId) throw new Error("Could not request a WhatsApp code. Please try again.");
  return result;
}

export async function verifyTrainingOtp(cashier, storeId, challengeId, code, request) {
  if (!cashier?.email || !storeId || !challengeId || !/^\d{6}$/.test(code)) throw new Error("Enter the 6-digit WhatsApp code.");
  const result = await request("training-otp/verify", { method: "POST", body: JSON.stringify({ email: cashier.email, storeId: String(storeId), challengeId, code }) });
  const verified = result?.cashier;
  if (!verified?.email || verified.email.toLowerCase() !== cashier.email.toLowerCase() || String(verified.storeId) !== String(storeId)) {
    throw new Error("Cashier verification failed. Please request a new code.");
  }
  return verified;
}

export function createTrainingSession({ liveStorage, store, cashier, items = [], foodStock = [], pendingTableOrders = [] }) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const storeId = store.id;
  const seed = {};
  for (const prefix of ["inventory", "customer-details", "customer-master", "customer-credit-settlements", "offers"]) {
    const key = `vestora-${prefix}-${storeId}`;
    seed[key] = readPracticeValue(liveStorage, key);
  }
  // Historical rows are a balance baseline only; only new practice bills are
  // exposed for history/refunds. Copies never reference the live arrays.
  for (const key of ["vestora-sales-ledger", "vestora-refund-ledger"]) {
    seed[key] = readPracticeValue(liveStorage, key).filter((row) => String(row.storeId) === String(storeId));
  }
  seed[`vestora-food-stock-${storeId}`] = foodStock;
  seed["vestora-table-orders"] = pendingTableOrders;
  const adapter = createPracticeStorage(seed);
  const { storage } = adapter;
  const metadata = clone({ storeId, storeName: store.name, branch: store.branch });
  const operator = clone({ id: cashier.id, name: cashier.name, email: cashier.email });
  const id = (kind) => `TRAIN-${kind}-${globalThis.crypto.randomUUID()}`;
  const read = (key, fallback) => readPracticeValue(storage, key, fallback);
  const write = (key, value) => storage.setItem(key, JSON.stringify(value));
  const prepend = (key, row) => write(key, [row, ...read(key)]);
  const stamp = (row) => ({ ...row, ...metadata, training: true, syncStatus: "Training only", shiftId: read("training-current-shift", {})?.id || "", createdAt: new Date().toISOString() });
  const actions = {
    openShift(openingBalance) {
      const shift = { ...metadata, training: true, id: id("SHIFT"), cashierId: operator.id, cashierName: operator.name, openingBalance: Number(openingBalance), openedAt: new Date().toISOString() };
      write("training-current-shift", shift);
      return shift;
    },
    closeShift(closingBalance, details = {}) {
      prepend(`vestora-shift-history-${storeId}`, { ...read("training-current-shift", {}), ...details, training: true, closingBalance: Number(closingBalance), closedAt: new Date().toISOString() });
      write("training-current-shift", null);
    },
    sale(bill) {
      const saved = stamp({ ...bill, paymentStatus: "Simulated", id: bill.id.startsWith("TRAIN-") ? bill.id : id("BILL") });
      prepend("vestora-sales-ledger", saved);
      return saved;
    },
    refund(refund) {
      if (!read("vestora-sales-ledger").some((bill) => bill.training && bill.id === refund.billId)) throw new Error("Only practice bills can be refunded in Training Mode.");
      const saved = stamp({ ...refund, id: id("REF"), status: "Simulated refund" });
      prepend("vestora-refund-ledger", saved);
      return saved;
    },
    voidItem(item, orderType) { prepend("vestora-void-ledger", stamp({ id: id("VOID"), itemName: item.name, qty: item.qty, rate: item.price, amount: Number(item.price) * Number(item.qty), orderType })); },
    foodStock(update) { const key = `vestora-food-stock-${storeId}`; write(key, typeof update === "function" ? update(read(key)) : update); },
    tablePaid(order, bill) { write("vestora-table-orders", read("vestora-table-orders").map((entry) => entry.id === order.id ? { ...entry, status: "Paid", training: true, billId: bill.id } : entry)); },
  };
  actions.openShift(0);
  return { adapter, actions, store: clone(store), cashier: operator, items: clone(items) };
}
