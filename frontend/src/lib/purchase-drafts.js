export const purchaseDraftMatches = (record, entry) => record?.status === "Draft"
  && JSON.stringify(record.entry) === JSON.stringify(entry);

export function normalizePurchaseDraftDays(value, fallback = 7) {
  const days = Number(value);
  if (!Number.isFinite(days)) return fallback;
  return Math.min(365, Math.max(1, Math.round(days)));
}

export function purchaseDraftAgeDays(record, now = new Date()) {
  const created = new Date(record?.createdAt || record?.entry?.date || "");
  const current = new Date(now);
  if (!Number.isFinite(created.getTime()) || !Number.isFinite(current.getTime())) return 0;
  const createdDay = Date.UTC(created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate());
  const currentDay = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  return Math.max(0, Math.floor((currentDay - createdDay) / 86400000));
}

export function purchaseDraftDeadline(record, maximumDays = 7, now = new Date()) {
  const limit = normalizePurchaseDraftDays(maximumDays);
  const age = purchaseDraftAgeDays(record, now);
  return { age, limit, overdue: record?.status === "Draft" && age > limit, daysRemaining: Math.max(0, limit - age), daysOverdue: Math.max(0, age - limit) };
}

export function purchaseDraftNumber(record = {}) {
  if (record.purchaseNumber) return record.purchaseNumber;
  const day = String(record.entry?.date || "").replace(/\D/g, "") || "DRAFT";
  const identity = String(record.id || "draft").replace(/^PUR-DRAFT-/i, "").replace(/[^a-z0-9]/gi, "");
  const numericId = [...identity].reduce((value, character) => (value * 31 + character.charCodeAt(0)) % 1000000, 0);
  const suffix = String(numericId).padStart(6, "0");
  return `PUR-${day}-${suffix}`;
}

export function savePurchaseDraftRecord(records, entry, id, timestamp = new Date().toISOString()) {
  const existing = records.find((record) => record.id === id);
  if (existing && existing.status !== "Draft") throw new Error("This purchase is awaiting approval or has already been approved.");
  if (!String(entry?.invoice || "").trim()) throw new Error("Supplier invoice number is required.");
  const record = { id, purchaseNumber: existing?.purchaseNumber || purchaseDraftNumber({ id, entry }), status: "Draft", entry: JSON.parse(JSON.stringify(entry)),
    createdAt: existing?.createdAt || timestamp, updatedAt: timestamp };
  return [record, ...records.filter((current) => current.id !== id)];
}

export function requestPurchaseApprovalRecord(records, id, timestamp = new Date().toISOString()) {
  const existing = records.find((record) => record.id === id);
  if (!existing || existing.status !== "Draft") throw new Error("Save this purchase as a draft before submitting it for approval.");
  return records.map((record) => record.id === id
    ? { ...record, status: "PendingApproval", requestedAt: timestamp, updatedAt: timestamp } : record);
}

export function returnPurchaseToDraft(records, id, timestamp = new Date().toISOString()) {
  const existing = records.find((record) => record.id === id);
  if (!existing || existing.status !== "PendingApproval") throw new Error("Only purchases awaiting approval can return to draft.");
  return records.map((record) => record.id === id
    ? { ...record, status: "Draft", requestedAt: undefined, updatedAt: timestamp } : record);
}

export function submitPurchaseDraftRecord(records, id, purchaseId, timestamp) {
  const existing = records.find((record) => record.id === id);
  if (!existing || existing.status !== "PendingApproval") throw new Error("This purchase is not awaiting approval.");
  return records.map((record) => record.id === id
    ? { ...record, status: "Approved", purchaseId, approvedAt: timestamp, updatedAt: timestamp } : record);
}

export function deletePurchaseDraftRecord(records, id) {
  return records.filter((record) => record.id !== id || !["Draft", "PendingApproval"].includes(record.status));
}
