// Durable operation envelopes. A lost acknowledgement is retried with the same
// exact body and key, including after a browser restart. No offline stock delta.
export function createProductionTransport({ storage, send, newKey = () => crypto.randomUUID() }) {
  const inflight = new Map();
  const storageKey = (store, logical) => `uvpro-production-pending:${store}:${logical}`;
  const read = (store, logical) => JSON.parse(storage.getItem(storageKey(store, logical)) || "null");
  async function deliver(store, logical, envelope) {
    const id = storageKey(store, logical);
    if (inflight.has(id)) return inflight.get(id);
    const job = (async () => {
      try {
        const result = await send(store, envelope.command, envelope.data, envelope.key);
        storage.removeItem(id);
        return result;
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 409) storage.removeItem(id);
        throw error;
      } finally { inflight.delete(id); }
    })();
    inflight.set(id, job);
    return job;
  }
  return {
    pending: read,
    async resume(store, logical) {
      const envelope = read(store, logical);
      return envelope ? deliver(store, logical, envelope) : null;
    },
    async execute(store, command, data, logical) {
      const signature = JSON.stringify({ command, data });
      const existing = read(store, logical);
      if (existing && existing.signature !== signature) throw new Error("This stock action has an unacknowledged request. Retry the original action before editing it.");
      const envelope = existing || { command, data, signature, key: newKey() };
      storage.setItem(storageKey(store, logical), JSON.stringify(envelope));
      return deliver(store, logical, envelope);
    },
  };
}

export const stockLineKey = (item) => String(item.stockLineKey || item.cartItemKey || `${item.id}::${String(item.name || "").trim().toLowerCase()}`);
export function orderStockLines(items, existing = [], retail = false) {
  return items.map((item) => {
    const key = stockLineKey(item);
    const old = existing.find((line) => line.key === key);
    return { key, menu_key: String(item.productionMenuKey ?? item.id), quantity: String(item.qty),
      ...(retail && (item.productMasterId || item.productMasterItem) ? { product_id: String(item.productMasterId || item.id), sales_unit: item.salesUnit || item.unit } : {}),
      unit_price: String(item.price || 0), tax_rate: String(item.tax || 0),
      ...(old ? { expected_revision: old.revision } : {}) };
  });
}

export function fulfillmentTargets(items, confirmedLines) {
  return Object.fromEntries(items.map((item) => {
    const key = stockLineKey(item);
    const line = confirmedLines.find((entry) => entry.key === key);
    if (!line) throw new Error("This KOT contains an unconfirmed line. Refresh its order before service.");
    // A cancellation notice may arrive after the original KOT was printed.
    // Acknowledging that ticket must not serve the cancelled portion.
    return [key, String(Math.min(Number(item.qty), Number(line.quantity) - Number(line.cancelled)))];
  }));
}
