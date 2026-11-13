const clean = (value) => String(value ?? "").trim();
const groups = [
  ["g", 1, ["g", "gm", "gms", "gram", "grams"]],
  ["g", 1000, ["kg", "kilogram", "kilograms"]],
  ["ml", 1, ["ml", "millilitre", "milliliter"]],
  ["ml", 1000, ["l", "ltr", "litre", "liter", "litres", "liters"]],
  ["piece", 1, ["piece", "pieces", "pcs", "pc", "each", "unit", "units", "no", "nos", "cyl"]],
];
export function standardPurchaseMeasure(unit) {
  const found = groups.find(([, , names]) => names.includes(clean(unit).toLowerCase()));
  return found ? { base: found[0], factor: found[1] } : null;
}
export function productStockMeasure(product) {
  if (product?.productionConsumption === false && !product?.productionManaged && !standardPurchaseMeasure(product?.unit)) return null;
  if (clean(product?.unit).toLowerCase() === "dozen") return { base: "piece", factor: 12 };
  const standard = standardPurchaseMeasure(product?.unit);
  if (standard) return standard;
  const factor = Number(product?.productionUnitFactor);
  return ["g", "ml", "piece"].includes(product?.productionBaseUnit)
    ? { base: product.productionBaseUnit, factor: Number.isFinite(factor) && factor > 0 ? factor : null } : null;
}
export function withProductionMeasure(product, workspace) {
  const item = workspace?.items?.find((entry) => String(entry.legacy_key) === String(product?.id));
  return item ? { ...product, productionBaseUnit: item.unit, productionUnitFactor: item.measures?.[clean(product.unit).toLowerCase()] ?? "" } : product;
}
export function deliveryPurchaseUnit(product) {
  const stock = productStockMeasure(product);
  const customUnit = !standardPurchaseMeasure(product?.unit) && clean(product?.unit).toLowerCase() !== "dozen";
  return { mode: "delivery", name: customUnit ? clean(product?.unit) || "pack" : "pack", quantity: customUnit ? stock?.factor ?? "" : "", unit: stock?.base || "" };
}
export function purchaseQuantityLabel(line) {
  return `${line.quantity} ${line.unit || ""}${line.purchaseUnit ? ` × ${line.purchaseUnit.quantity} ${line.purchaseUnit.unit}` : ""}`;
}
export function normalizePurchaseUnits(units = [], product) {
  const stock = productStockMeasure(product);
  const seen = new Set([clean(product?.unit).toLowerCase()]);
  return (Array.isArray(units) ? units : []).map((row) => {
    const name = clean(row.name);
    const quantity = Number(row.quantity);
    const unit = clean(row.unit).toLowerCase();
    const measure = standardPurchaseMeasure(unit);
    if (!name || seen.has(name.toLowerCase()) || standardPurchaseMeasure(name)) throw new Error("Give each purchase size a unique name, such as 100 g pack or 5 kg bag.");
    if (!stock || !measure || measure.base !== stock.base) throw new Error(`${name}: choose a measure compatible with the product's stock unit.`);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 1e14 || Math.abs(quantity * 1e6 - Math.round(quantity * 1e6)) > 0.01) throw new Error(`${name}: enter a positive net quantity with at most 6 decimal places.`);
    if (stock.base === "piece" && !Number.isInteger(quantity * measure.factor)) throw new Error(`${name}: a package must contain whole pieces.`);
    seen.add(name.toLowerCase());
    return { id: clean(row.id) || name.toLowerCase(), name, quantity, unit };
  });
}
export function purchaseUnitOptions(product) {
  if (!product) return [];
  const stock = productStockMeasure(product);
  if (product.packTracking && stock?.factor > 0) return [{ key: "stock", name: product.unit,
    purchaseUnit: { mode: "configured", name: product.unit, quantity: stock.factor, unit: stock.base } }];
  const customUnit = !standardPurchaseMeasure(product.unit) && clean(product.unit).toLowerCase() !== "dozen";
  const options = customUnit && stock && !(Number(stock.factor) > 0) ? [] : [{ key: "stock", name: product.unit, purchaseUnit: null }];
  if (!stock) return options;
  options.push({ key: "delivery", name: customUnit ? `Actual ${product.unit} size` : "Pack / box for this delivery", purchaseUnit: deliveryPurchaseUnit(product) });
  if (!customUnit || Number(stock.factor) > 0) {
    const loose = stock.base === "g" ? ["g", "kg"] : stock.base === "ml" ? ["ml", "litre"] : ["piece"];
    for (const unit of loose) {
      if (unit === clean(product.unit).toLowerCase()) continue;
      options.push({ key: `loose:${unit}`, name: unit, purchaseUnit: { name: unit, quantity: 1, unit } });
    }
  }
  for (const size of product.purchaseUnits || []) options.push({ key: `size:${size.id}`, name: clean(size.name).toLowerCase() === "pack" ? `pack · ${size.quantity} ${size.unit}` : size.name, purchaseUnit: { ...size } });
  return options;
}
export function purchaseUnitKey(product, line) {
  if (line.purchaseUnit?.mode === "delivery") return "delivery";
  return purchaseUnitOptions(product).find(({ purchaseUnit: size }) => !size ? !line.purchaseUnit : line.purchaseUnit && size.name === line.purchaseUnit.name && size.unit === line.purchaseUnit.unit && Number(size.quantity) === Number(line.purchaseUnit.quantity) && clean(size.id) === clean(line.purchaseUnit.id))?.key || "saved";
}
export function resolvePurchaseQuantity(product, line) {
  const count = Number(line.quantity || 0);
  if (!line.purchaseUnit) {
    if (clean(line.unit || product.unit).toLowerCase() !== clean(product.unit).toLowerCase()) throw new Error(`${product.name} must be purchased in ${product.unit} or a saved purchase size`);
    const stock = productStockMeasure(product);
    if (stock && !standardPurchaseMeasure(product.unit) && clean(product.unit).toLowerCase() !== "dozen" && !(Number(stock.factor) > 0)) {
      throw new Error(`${product.name}: enter the actual contents of each pack in this purchase.`);
    }
    return { stockQuantity: count, stockUnit: product.unit, stockFactor: 1, ...(stock ? { baseQuantity: count * stock.factor, baseUnit: stock.base } : {}) };
  }
  const size = line.purchaseUnit;
  const stock = productStockMeasure(product);
  const measure = standardPurchaseMeasure(size.unit);
  const standardName = standardPurchaseMeasure(size.name);
  const loose = standardName && Number(size.quantity) === 1 && clean(size.name).toLowerCase() === clean(size.unit).toLowerCase();
  const saved = (product.purchaseUnits || []).some((entry) => clean(entry.id) === clean(size.id) && entry.name === size.name && Number(entry.quantity) === Number(size.quantity) && entry.unit === size.unit);
  const delivery = size.mode === "delivery" && (size.name === product.unit || size.name === "pack");
  const configured = size.mode === "configured" && size.name === product.unit && stock && measure?.base === stock.base && Number(size.quantity) * measure.factor === Number(stock.factor);
  if (size.mode && !delivery && !configured) throw new Error(`${product.name}: the saved pack size changed. Reselect the product before submitting.`);
  if (delivery && (!Number.isFinite(Number(size.quantity)) || Number(size.quantity) <= 0)) throw new Error(`${product.name}: actual net quantity is missing from this older draft. Select the product's configured purchase unit again.`);
  if (!stock || !measure || stock.base !== measure.base || !(Number(size.quantity) > 0) || !Number.isFinite(Number(size.quantity)) || Number(size.quantity) >= 1e14 || Math.abs(Number(size.quantity) * 1e6 - Math.round(Number(size.quantity) * 1e6)) > 0.01 || line.unit !== size.name || (!loose && !saved && !delivery && !configured)) throw new Error(`${product.name}: this purchase size changed or is missing. Select a compatible configured purchase unit again.`);
  if (product.packTracking && (!Number.isInteger(count) || count < 0)) throw new Error(`${product.name}: enter a whole number of unopened packs.`);
  if (!delivery && !(Number(stock.factor) > 0)) throw new Error(`${product.name}: enter the actual contents of each pack in this purchase.`);
  const baseContent = Number(size.quantity) * measure.factor;
  const stockFactor = Number(stock.factor) > 0 ? baseContent / Number(stock.factor) : 1;
  const stockQuantity = count * stockFactor;
  if (!Number.isFinite(stockQuantity) || stockQuantity >= 1e14 || (count > 0 && Number(stockQuantity.toFixed(6)) <= 0)) throw new Error(`${product.name}: enter a quantity that can be recorded in the stock unit.`);
  if (stock.base === "piece" && !Number.isInteger(count * Number(size.quantity) * measure.factor)) throw new Error(`${product.name} must be received in whole pieces.`);
  return { stockQuantity: Number(stockQuantity.toFixed(6)), stockUnit: product.unit, stockFactor, baseQuantity: count * baseContent, baseUnit: stock.base };
}

export function purchaseOrderReceiptQuantity(receipt, orderLine) {
  if (!receipt.purchaseUnit || clean(receipt.unit).toLowerCase() === clean(orderLine.unit).toLowerCase()) return Number(receipt.quantity);
  const ordered = standardPurchaseMeasure(orderLine.unit);
  if (!ordered && receipt.purchaseUnit.mode === "delivery" && clean(orderLine.unit).toLowerCase() !== "dozen") return Number(receipt.quantity);
  const size = standardPurchaseMeasure(receipt.purchaseUnit.unit);
  if (ordered && size && ordered.base === size.base) return Number(receipt.quantity) * Number(receipt.purchaseUnit.quantity) * size.factor / ordered.factor;
  if (receipt.stockUnit === orderLine.unit) return Number(receipt.stockQuantity);
  throw new Error("The received size cannot be converted to the purchase order's unit.");
}
