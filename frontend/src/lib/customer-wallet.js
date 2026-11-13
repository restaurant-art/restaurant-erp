import { customerRecordKey } from "./crm-customers.js";

const cents = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

export function customerWalletBalance(entries = [], customerKey) {
  const key = String(customerKey || "").trim();
  if (!key) return 0;
  const balance = (entries || []).reduce((total, entry) => {
    const entryKey = String(entry?.customerKey || customerRecordKey(entry || {}));
    const amount = Number(entry?.amount);
    if (["cancelled", "canceled", "reversed", "draft", "void", "voided"].includes(String(entry?.status || "").trim().toLowerCase())) return total;
    if (entryKey !== key || !Number.isFinite(amount) || amount <= 0) return total;
    if (entry.direction === "credit") return total + amount;
    if (entry.direction === "debit") return total - amount;
    return total;
  }, 0);
  return cents(Math.max(0, balance));
}

export function createWalletEntry({ customer, direction, amount, source, method = "", reference = "", orderNumber = "", date = new Date().toISOString().slice(0, 10) }) {
  const value = Number(amount);
  const customerKey = customer?.key || customerRecordKey(customer || {});
  if (!customerKey || !["credit", "debit"].includes(direction) || !Number.isFinite(value) || value <= 0) return null;
  return {
    id: `WAL-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    customerKey,
    customerName: String(customer?.name || "Customer").trim(),
    customerMobile: String(customer?.mobile || "").replace(/\D/g, "").slice(-10),
    direction,
    amount: cents(value),
    source: String(source || (direction === "credit" ? "Wallet deposit" : "Wallet redemption")),
    method: String(method || ""),
    reference: String(reference || "").trim(),
    orderNumber: String(orderNumber || ""),
    date,
    createdAt: new Date().toISOString(),
  };
}
