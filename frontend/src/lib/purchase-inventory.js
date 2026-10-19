import { calculatePurchaseInvoice } from "./purchase-invoice-adjustments.js";
const round = (value, decimals = 3) => Number(Number(value).toFixed(decimals));
const purchaseCostIncludingTax = (price, taxRate) => round(Number(price) * (1 + Number(taxRate || 0) / 100), 4);
const purchasePriceBeforeTax = (cost, taxRate) => round(Number(cost) / (1 + Number(taxRate || 0) / 100), 4);

export function purchaseLineAmounts(line) {
  const quantity = Number(line.quantity || 0);
  const unitCost = Number(line.unitCost || 0);
  const taxRate = Number(line.taxRate || 0);
  const discountPercent = Number(line.discountPercent || 0);
  const subtotal = quantity * unitCost;
  const discount = round(subtotal * discountPercent / 100, 2);
  const taxableSubtotal = round(subtotal - discount, 2);
  const netUnitCost = quantity > 0 ? round(taxableSubtotal / quantity, 4) : unitCost * (1 - discountPercent / 100);
  const tax = taxableSubtotal * taxRate / 100;
  return {
    quantity,
    unitCost,
    taxRate,
    discountPercent,
    subtotal: round(subtotal, 2),
    discount,
    taxableSubtotal,
    netUnitCost,
    tax: round(tax, 2),
    total: round(taxableSubtotal + tax, 2),
  };
}

export function purchaseTotals(lines = []) {
  return lines.reduce((totals, line) => {
    const amounts = purchaseLineAmounts(line);
    totals.subtotal = round(totals.subtotal + amounts.subtotal, 2);
    totals.discount = round(totals.discount + amounts.discount, 2);
    totals.tax = round(totals.tax + amounts.tax, 2);
    totals.total = round(totals.total + amounts.total, 2);
    return totals;
  }, { subtotal: 0, discount: 0, tax: 0, total: 0 });
}

export function reversePurchaseInventory(inventory = [], receiptTransactions = [], timestamp = new Date().toISOString()) {
  const quantities = new Map();
  for (const receipt of receiptTransactions) {
    const quantity = Number(receipt.quantity);
    if (!receipt.itemId || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Purchase stock cannot be reversed because a receipt line is incomplete.");
    quantities.set(receipt.itemId, (quantities.get(receipt.itemId) || 0) + quantity);
  }
  const next = inventory.map((item) => {
    const quantity = quantities.get(item.id) || 0;
    if (!quantity) return item;
    if (Number(item.stock || 0) + 0.00001 < quantity) throw new Error(`Cannot edit or delete this bill: ${item.name} has only ${item.stock} ${item.unit} on hand, below the ${quantity} ${item.unit} received.`);
    quantities.delete(item.id);
    return { ...item, stock: round(Number(item.stock || 0) - quantity), updatedAt: timestamp };
  });
  if (quantities.size) throw new Error("Cannot edit or delete this bill because a received inventory item no longer exists.");
  return next;
}

export function applyPurchaseToInventory(inventory = [], lines = [], options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const createId = options.createId || (() => `INV-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`);
  const next = inventory.map((item) => ({ ...item }));
  const receivedLines = [];
  const invoice = calculatePurchaseInvoice(lines.map(purchaseLineAmounts), options.invoiceAdjustments || {}, { strict: true });

  for (const [lineIndex, line] of lines.entries()) {
    if (line.unitCost === null || line.unitCost === undefined || String(line.unitCost).trim() === "") {
      throw new Error("Enter a rate for every purchase item");
    }
    const amounts = invoice.lines[lineIndex];
    if (!Number.isFinite(amounts.quantity) || amounts.quantity <= 0) throw new Error("Every purchase quantity must be greater than zero");
    if (!Number.isFinite(amounts.unitCost) || amounts.unitCost < 0) throw new Error("Every purchase rate must be zero or more");
    if (!Number.isFinite(amounts.discountPercent) || amounts.discountPercent < 0 || amounts.discountPercent > 100) throw new Error("Discount must be between 0 and 100 percent");
    if (!Number.isFinite(amounts.taxRate) || amounts.taxRate < 0 || amounts.taxRate > 100) throw new Error("Tax must be between 0 and 100 percent");

    const existingIndex = line.itemId && line.itemId !== "__new__" ? next.findIndex((item) => item.id === line.itemId) : -1;
    if (line.itemId && line.itemId !== "__new__" && existingIndex < 0) throw new Error("A selected inventory item is no longer available");

    if (existingIndex >= 0) {
      const current = next[existingIndex];
      if (String(current.unit || "").toLowerCase() !== String(line.unit || current.unit || "").toLowerCase()) {
        throw new Error(`${current.name} must be purchased in ${current.unit}`);
      }
      const previousStock = Number(current.stock || 0);
      const newStock = previousStock + amounts.quantity;
      const receivedCost = amounts.receivedUnitCost;
      const weightedCost = newStock > 0
        ? ((previousStock * Number(current.cost || 0)) + (amounts.quantity * receivedCost)) / newStock
        : receivedCost;
      const previousPrice = current.price === null || current.price === undefined || current.price === ""
        ? purchasePriceBeforeTax(current.cost || 0, current.gstRate ?? amounts.taxRate)
        : Number(current.price);
      const weightedPrice = newStock > 0
        ? ((previousStock * previousPrice) + (amounts.quantity * amounts.netUnitCost)) / newStock
        : amounts.netUnitCost;
      next[existingIndex] = {
        ...current,
        stock: round(newStock),
        price: round(weightedPrice, 4),
        cost: round(weightedCost, 4),
        lastPurchaseCost: amounts.netUnitCost,
        updatedAt: timestamp,
        lastPurchaseAt: timestamp,
      };
      receivedLines.push({
        ...line,
        ...amounts,
        itemId: current.id,
        name: current.name,
        sku: current.sku,
        hsnCode: current.hsnCode || line.hsnCode || "",
        gstRate: Number(current.gstRate ?? line.gstRate ?? line.taxRate ?? 0),
        department: current.department || line.department || "",
        category: current.category || line.category || "",
        subcategory: current.subcategory || line.subcategory || "",
        unit: current.unit,
      });
      continue;
    }

    const name = String(line.name || "").trim().replace(/\s+/g, " ");
    const sku = String(line.sku || "").trim().toUpperCase();
    const hsnCode = String(line.hsnCode || "").trim();
    const gstRate = Number(line.gstRate ?? line.taxRate ?? 0);
    const department = String(line.department || "Other").trim() || "Other";
    const category = String(line.category || "Other").trim() || "Other";
    const subcategory = String(line.subcategory || "").trim();
    const reorder = Number(line.reorder || 0);
    if (!name) throw new Error("Enter a name for every new inventory item");
    if (!sku) throw new Error(`Enter an SKU for ${name}`);
    if (hsnCode && !/^(?:\d{4}|\d{6}|\d{8})$/.test(hsnCode)) throw new Error(`HSN code for ${name} must contain 4, 6, or 8 digits`);
    if (!Number.isFinite(gstRate) || gstRate < 0 || gstRate > 100) throw new Error(`GST rate for ${name} must be between 0 and 100 percent`);
    if (line.gstRate !== null && line.gstRate !== undefined && String(line.gstRate).trim() !== "" && gstRate !== amounts.taxRate) {
      throw new Error(`GST rate and purchase tax for ${name} must match`);
    }
    if (!Number.isFinite(reorder) || reorder < 0) throw new Error(`Reorder level for ${name} must be zero or more`);
    if (next.some((item) => String(item.sku || "").trim().toUpperCase() === sku)) throw new Error(`SKU ${sku} is already in use`);
    if (next.some((item) => String(item.name || "").trim().toLowerCase() === name.toLowerCase())) throw new Error(`${name} already exists; select it instead`);
    const created = {
      id: createId(),
      name,
      sku,
      hsnCode,
      gstRate,
      department,
      category,
      subcategory,
      stock: round(amounts.quantity),
      unit: line.unit || "kg",
      reorder: round(reorder),
      price: round(amounts.netUnitCost, 4),
      cost: amounts.receivedUnitCost,
      lastPurchaseCost: amounts.netUnitCost,
      updatedAt: timestamp,
      lastPurchaseAt: timestamp,
    };
    next.unshift(created);
    receivedLines.push({ ...line, ...amounts, ...created, itemId: created.id, created: true });
  }

  return { inventory: next, receivedLines, invoiceTotals: invoice.totals };
}

