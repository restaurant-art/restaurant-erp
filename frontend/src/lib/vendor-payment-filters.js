import { settlementSearch } from "./vendor-settlements.js";

export function withPaymentPurchaseNumbers(payments, purchases) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return payments.map((payment) => {
    if (payment.purchaseId) return { ...payment, purchaseNumber: payment.purchaseId };
    const matches = payment.vendor && payment.invoice ? purchases.filter((purchase) =>
      normalize(purchase.supplier) === normalize(payment.vendor)
      && normalize(purchase.invoice) === normalize(payment.invoice)) : [];
    return { ...payment, purchaseNumber: matches.length === 1 ? matches[0].id : "" };
  });
}

export function matchesVendorPaymentScope(record, filters = {}) {
  const normalize = (value) => String(value || "").trim().toLowerCase();
  return (!filters.vendor || normalize(record.supplier || record.vendor) === normalize(filters.vendor))
    && settlementSearch({ ...record, purchaseId: record.purchaseId || record.purchaseNumber }, filters.query)
    && (!filters.from || record.date >= filters.from)
    && (!filters.to || record.date <= filters.to);
}

export function filterVendorPaymentHistory(records, filters = {}) {
  return records.filter((record) => matchesVendorPaymentScope(record, filters)
    && (!filters.status || filters.status === "All" || record.status === filters.status)
    && (!filters.method || filters.method === "All" || [record.method, record.debitAccount, record.creditAccount].includes(filters.method)));
}
