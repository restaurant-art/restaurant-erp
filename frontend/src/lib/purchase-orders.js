export const purchaseOrderStatuses = ["Draft", "Submitted for approval", "Approved", "Partially received", "Closed", "Cancelled"];

export function normalizePurchaseRate(value) {
  if (value === "" || value === null || value === undefined) return "";
  const rate = Number(value);
  if (!Number.isFinite(rate)) return "";
  return Math.max(0, rate).toFixed(2);
}

export function purchaseOrderLineAmounts(line = {}) {
  const quantity = Math.max(0, Number(line.quantity || 0));
  const unitCost = Math.max(0, Number(line.unitCost || 0));
  const discountPercent = Math.min(100, Math.max(0, Number(line.discountPercent || 0)));
  const gstRate = Math.max(0, Number(line.gstRate || 0));
  const subtotal = quantity * unitCost;
  const discount = subtotal * discountPercent / 100;
  const taxable = subtotal - discount;
  const gst = taxable * gstRate / 100;
  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number(discount.toFixed(2)),
    taxable: Number(taxable.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    total: Number((taxable + gst).toFixed(2)),
  };
}

export function purchaseOrderTotals(lines = []) {
  return lines.reduce((totals, line) => {
    const amounts = purchaseOrderLineAmounts(line);
    totals.subtotal += amounts.subtotal;
    totals.discount += amounts.discount;
    totals.gst += amounts.gst;
    totals.total += amounts.total;
    totals.quantity += Math.max(0, Number(line.quantity || 0));
    return totals;
  }, { subtotal: 0, discount: 0, gst: 0, total: 0, quantity: 0 });
}

export function nextPurchaseOrderNumber(records = [], date = new Date()) {
  const dateKey = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  const day = dateKey.replaceAll("-", "");
  const count = records.filter((record) => String(record.poNumber || "").startsWith(`PO-${day}-`)).length + 1;
  return `PO-${day}-${String(count).padStart(3, "0")}`;
}

export function purchaseOrdersForVendor(records = [], vendor = "", excludeId = "") {
  const vendorKey = String(vendor || "").trim().toLowerCase();
  if (!vendorKey) return [];
  return records
    .filter((record) => record.id !== excludeId
      && String(record.vendor || "").trim().toLowerCase() === vendorKey
      && Array.isArray(record.lines) && record.lines.length)
    .sort((first, second) => String(second.updatedAt || second.orderDate || second.createdAt || "")
      .localeCompare(String(first.updatedAt || first.orderDate || first.createdAt || "")));
}

export function automaticPurchaseOrderForEntry(orders = [], purchaseDrafts = []) {
  const occupiedOrderIds = new Set(purchaseDrafts
    .filter((record) => ["Draft", "PendingApproval"].includes(record.status))
    .map((record) => record.entry?.purchaseOrderId)
    .filter(Boolean));
  const available = orders.filter((order) => ["Approved", "Partially received"].includes(order.status) && !occupiedOrderIds.has(order.id));
  return available.length === 1 ? available[0] : null;
}

export function recallPurchaseOrderLines(order, createId = () => crypto.randomUUID()) {
  return (order?.lines || []).map((source) => {
    const { subtotal: _subtotal, discount: _discount, taxable: _taxable, gst: _gst, total: _total, ...line } = source;
    return {
      ...line,
      id: createId(),
      quantity: String(line.quantity ?? ""),
      unitCost: normalizePurchaseRate(line.unitCost),
      discountPercent: String(line.discountPercent ?? 0),
      gstRate: String(line.gstRate ?? 0),
    };
  });
}

export function purchaseOrderToPurchaseDraft(order, inventoryItems = [], createId = () => crypto.randomUUID(), date = new Date()) {
  const dateKey = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
  return {
    supplier: order.vendor,
    invoice: "",
    date: dateKey,
    notes: [`From ${order.poNumber}`, order.notes].filter(Boolean).join(" · "),
    purchaseOrderId: order.id,
    purchaseOrderNumber: order.poNumber,
    lines: (order.lines || []).map((line) => {
      const item = inventoryItems.find((entry) => entry.id === line.itemId) || {};
      return {
        id: createId(),
        itemId: line.itemId,
        batchKey: line.batchKey || "",
        batchLabel: line.batchLabel || "",
        batchBarcode: line.batchBarcode || "",
        batchMrp: line.batchMrp ?? "",
        name: line.itemName || item.name || "",
        sku: line.sku || item.sku || "",
        hsnCode: line.hsnCode || item.hsnCode || "",
        gstRate: String(line.gstRate ?? item.gstRate ?? 0),
        department: item.department || "Food & Beverage",
        category: item.category || "Other",
        subcategory: item.subcategory || "",
        unit: line.unit || item.unit || "pcs",
        reorder: String(item.reorder ?? ""),
        quantity: String(line.quantity ?? ""),
        unitCost: normalizePurchaseRate(line.unitCost),
        discountPercent: String(line.discountPercent ?? 0),
        sellingPrice: String(item.sellingPrice ?? item.price ?? ""),
        taxRate: String(line.gstRate ?? item.gstRate ?? 0),
      };
    }),
  };
}
