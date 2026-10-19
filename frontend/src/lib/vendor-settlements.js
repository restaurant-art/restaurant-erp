export function paymentMatchesPurchase(payment, purchase) {
  if (payment.purchaseId) return payment.purchaseId === purchase.id;
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return normalize(payment.vendor) === normalize(purchase.supplier)
    && normalize(payment.invoice) === normalize(purchase.invoice);
}

export function buildPurchasePayables(transactions = [], payments = []) {
  const groups = new Map();
  for (const entry of transactions) {
    if (entry.type !== "Purchase" || !entry.purchaseId || ["Cancelled", "Deleted", "Reversed"].includes(entry.status)) continue;
    const purchase = groups.get(entry.purchaseId) || {
      id: entry.purchaseId, supplier: entry.supplier, invoice: entry.invoice, date: entry.date,
      purchaseOrderId: entry.purchaseOrderId || "", purchaseOrderNumber: entry.purchaseOrderNumber || "",
      createdAt: entry.createdAt, itemCount: 0, quantity: 0, total: 0,
    };
    purchase.itemCount += 1;
    purchase.quantity += Number(entry.quantity || 0);
    purchase.total += Number(entry.total || 0);
    groups.set(purchase.id, purchase);
  }
  return [...groups.values()].map((purchase) => {
    const paid = payments.filter((payment) => !["Cancelled", "Reversed", "Pending"].includes(payment.status) && paymentMatchesPurchase(payment, purchase))
      .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0);
    const total = Number(purchase.total.toFixed(2));
    const balance = Math.max(0, Number((total - paid).toFixed(2)));
    return { ...purchase, total, paid: Number(paid.toFixed(2)), balance,
      settlementStatus: balance <= 0.005 ? "Paid" : paid > 0 ? "Partially paid" : "Unpaid" };
  }).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
}

export function settlementSearch(record, query) {
  const text = [record.supplier, record.vendor, record.invoice, record.id, record.purchaseId,
    record.reference, record.method, record.note, record.date].join(" ").toLowerCase();
  return String(query || "").toLowerCase().trim().split(/\s+/).every((term) => text.includes(term));
}
