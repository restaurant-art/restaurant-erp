const normalizedVendor = (value) => String(value || "").trim().toLowerCase();
const ignoredTransaction = (entry) => ["Cancelled", "Deleted", "Reversed", "Pending", "Draft"].includes(entry.status);
const invoiceKey = (vendor, invoice) => JSON.stringify([normalizedVendor(vendor), normalizedVendor(invoice)]);

export function paymentMatchesPurchase(payment, purchase) {
  if (payment.purchaseId) return payment.purchaseId === purchase.id;
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return normalize(payment.vendor) === normalize(purchase.supplier)
    && normalize(payment.invoice) === normalize(purchase.invoice);
}

export function buildPurchasePayables(transactions = [], payments = []) {
  const groups = new Map();
  for (const entry of transactions) {
    if (entry.type !== "Purchase" || !entry.purchaseId || ignoredTransaction(entry)) continue;
    const purchase = groups.get(entry.purchaseId) || {
      id: entry.purchaseId, supplier: entry.supplier, invoice: entry.invoice, date: entry.date,
      purchaseOrderId: entry.purchaseOrderId || "", purchaseOrderNumber: entry.purchaseOrderNumber || "",
      createdAt: entry.createdAt, itemCount: 0, quantity: 0, total: 0, returnCredit: 0,
    };
    purchase.itemCount += 1;
    purchase.quantity += Number(entry.quantity || 0);
    purchase.total += Number(entry.total || 0);
    if (entry.invoiceSummary && Number.isFinite(Number(entry.invoiceSummary.total))) {
      purchase.invoiceTotal = Number(entry.invoiceSummary.total);
    }
    groups.set(purchase.id, purchase);
  }
  const byInvoice = new Map();
  for (const purchase of groups.values()) {
    if (!purchase.supplier || !purchase.invoice) continue;
    const key = invoiceKey(purchase.supplier, purchase.invoice);
    byInvoice.set(key, byInvoice.has(key) ? null : purchase);
  }
  const corrected = new Set(transactions.filter((entry) => !ignoredTransaction(entry) && entry.correctionOnly)
    .map((entry) => entry.correctsTransaction).filter(Boolean));
  for (const entry of transactions) {
    if (entry.type !== "Purchase Return" || ignoredTransaction(entry) || corrected.has(entry.productionTransaction)) continue;
    const reference = entry.invoice || entry.reference;
    const purchase = entry.purchaseId ? groups.get(entry.purchaseId)
      : groups.get(reference) || byInvoice.get(invoiceKey(entry.supplier, reference));
    if (!purchase || (entry.supplier && normalizedVendor(entry.supplier) !== normalizedVendor(purchase.supplier))) continue;
    purchase.returnCredit += Math.abs(Number(entry.total) || 0);
  }
  return [...groups.values()].map((purchase) => {
    const paid = payments.filter((payment) => !["Cancelled", "Reversed", "Pending"].includes(payment.status) && paymentMatchesPurchase(payment, purchase))
      .reduce((sum, payment) => sum + Math.max(0, Number(payment.amount || 0)), 0);
    const { invoiceTotal, ...row } = purchase;
    const total = Number((invoiceTotal ?? row.total).toFixed(2));
    const returnCredit = Number(row.returnCredit.toFixed(2));
    const balance = Math.max(0, Number((total - returnCredit - paid).toFixed(2)));
    return { ...row, total, returnCredit, paid: Number(paid.toFixed(2)), balance,
      overpayment: Math.max(0, Number((paid + returnCredit - total).toFixed(2))),
      settlementStatus: balance <= 0.005 ? "Paid" : paid > 0 || returnCredit > 0 ? "Partially paid" : "Unpaid" };
  }).sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
}

export function buildVendorBillPickerRows(transactions = [], payments = [], vendor = "") {
  const selectedVendor = normalizedVendor(vendor);
  const purchases = buildPurchasePayables(transactions, payments)
    .filter((purchase) => !selectedVendor || normalizedVendor(purchase.supplier) === selectedVendor)
    .map((purchase) => ({
      ...purchase,
      rowType: "bill",
      status: purchase.settlementStatus,
      selectable: purchase.balance > 0.005,
    }));

  const returns = new Map();
  for (const entry of transactions) {
    if (entry.type !== "Purchase Return" || ignoredTransaction(entry)) continue;
    if (selectedVendor && normalizedVendor(entry.supplier) !== selectedVendor) continue;
    const returnId = entry.returnId || `RETURN-${entry.invoice || entry.reference || entry.id}`;
    const current = returns.get(returnId) || {
      id: returnId,
      rowType: "return",
      supplier: entry.supplier || "",
      invoice: entry.invoice || entry.reference || "",
      date: entry.date || "",
      createdAt: entry.createdAt || entry.date || "",
      itemCount: 0,
      quantity: 0,
      total: 0,
      paid: 0,
      balance: 0,
      status: "Returned",
      selectable: false,
    };
    current.itemCount += 1;
    current.quantity += Number(entry.quantity || 0);
    current.total += Math.max(0, Number(entry.total || 0));
    returns.set(returnId, current);
  }

  return [...purchases, ...[...returns.values()].map((entry) => ({
    ...entry,
    total: Number(entry.total.toFixed(2)),
  }))].sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
}

export function settlementSearch(record, query) {
  const text = [record.supplier, record.vendor, record.invoice, record.id, record.purchaseId,
    record.reference, record.method, record.note, record.date].join(" ").toLowerCase();
  return String(query || "").toLowerCase().trim().split(/\s+/).every((term) => text.includes(term));
}
