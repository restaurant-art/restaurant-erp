export function nextGrnNumber(records = [], date = new Date()) {
  const year = String(date.getFullYear());
  const prefix = `GRN-${year}-`;
  const highest = records.reduce((current, record) => {
    const number = String(record.grnNo || "");
    if (!number.startsWith(prefix)) return current;
    const suffix = Number(number.slice(prefix.length));
    return Number.isInteger(suffix) ? Math.max(current, suffix) : current;
  }, 0);
  return `${prefix}${String(highest + 1).padStart(5, "0")}`;
}

export function normalizeGrnLines(lines = []) {
  return lines
    .map((line) => ({
      itemTypeBrand: String(line.itemTypeBrand || "").trim(),
      quantity: Number(line.quantity || 0),
      unit: String(line.unit || "pcs").trim() || "pcs",
    }))
    .filter((line) => line.itemTypeBrand && Number.isFinite(line.quantity) && line.quantity > 0);
}

function normalizeGrnFields(draft) {
  if (!String(draft.supplierName || "").trim()) throw new Error("Enter a supplier name to generate the GRN.");
  if (!String(draft.invoiceNo || "").trim()) throw new Error("Enter a supplier invoice number to generate the GRN.");
  return {
    date: String(draft.date || ""),
    time: String(draft.time || ""),
    supplierName: String(draft.supplierName).trim(),
    supplierPhone: String(draft.supplierPhone || "").trim(),
    supplierAddress: String(draft.supplierAddress || "").trim(),
    supplierGstin: String(draft.supplierGstin || "").trim().toUpperCase(),
    invoiceNo: String(draft.invoiceNo).trim(),
    invoiceDate: String(draft.invoiceDate || ""),
    billAmount: Math.max(0, Number(draft.billAmount || 0)),
    items: normalizeGrnLines(draft.items),
    vehicleNo: String(draft.vehicleNo || "").trim(),
    remarks: String(draft.remarks || "").trim(),
    paidDate: String(draft.paidDate || ""),
    receiverName: String(draft.receiverName || "").trim(),
  };
}

function newGrnId() {
  const cryptoApi = globalThis.crypto;
  return cryptoApi && typeof cryptoApi.randomUUID === "function"
    ? cryptoApi.randomUUID()
    : `GRN-${Date.now()}`;
}

export function createGrnRecord(draft, records = [], template = {}, { id = newGrnId(), now = new Date() } = {}) {
  const receivedDate = String(draft.date || "");
  const [year, month, day] = receivedDate.split("-").map(Number);
  const numberDate = year && month && day ? new Date(year, month - 1, day) : now;
  return {
    id,
    grnNo: nextGrnNumber(records, numberDate),
    createdAt: now.toISOString(),
    ...normalizeGrnFields(draft),
    company: { ...template },
  };
}

export function updateGrnRecord(record, draft, { now = new Date() } = {}) {
  const numberYear = /^GRN-(\d{4})-/.exec(String(record.grnNo || ""))?.[1];
  if (numberYear && draft.date && String(draft.date).slice(0, 4) !== numberYear) {
    throw new Error(`Receipt date must remain in ${numberYear} because the GRN number is fixed.`);
  }
  return { ...record, ...normalizeGrnFields(draft), updatedAt: now.toISOString() };
}

export function deleteGrnRecord(record, { now = new Date() } = {}) {
  return { ...record, deletedAt: now.toISOString() };
}
