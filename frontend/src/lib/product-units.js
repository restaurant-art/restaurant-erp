const cleanUnitName = (value) => String(value || "").trim();

const pricingGroupId = (item) => String(item?.unitPricingGroupId || item?.productMasterId || "");

const normalizedConversionMode = (value) => (
  value === "base_contains_unit" ? "base_contains_unit" : "unit_contains_base"
);

export function productUnitStockConversion(unit = {}) {
  const conversion = Number(unit?.conversion);
  if (!Number.isFinite(conversion) || conversion <= 0) return 0;
  return normalizedConversionMode(unit?.conversionMode) === "base_contains_unit"
    ? 1 / conversion
    : conversion;
}

export function normalizeProductUnits(units = [], baseUnit = "piece") {
  const base = cleanUnitName(baseUnit).toLowerCase();
  const seen = new Set();
  return (Array.isArray(units) ? units : []).flatMap((unit, index) => {
    const name = cleanUnitName(unit?.name);
    const normalizedName = name.toLowerCase();
    const conversion = Number(unit?.conversion);
    if (!name || normalizedName === base || seen.has(normalizedName) || !Number.isFinite(conversion) || conversion <= 0) return [];
    seen.add(normalizedName);
    const mrp = unit?.mrp === "" || unit?.mrp == null ? null : Number(unit.mrp);
    const sellingPrice = unit?.sellingPrice === "" || unit?.sellingPrice == null ? null : Number(unit.sellingPrice);
    return [{
      id: String(unit?.id || `unit-${index + 1}`),
      name,
      conversion,
      conversionMode: normalizedConversionMode(unit?.conversionMode),
      ...(Number.isFinite(mrp) && mrp >= 0 ? { mrp } : {}),
      ...(Number.isFinite(sellingPrice) && sellingPrice >= 0 ? { sellingPrice } : {}),
    }];
  });
}

export function expandProductUnitCatalog(product) {
  const units = normalizeProductUnits(product?.alternateUnits, product?.unit)
    .filter((unit) => !product?.packTracking || Number.isInteger(productUnitStockConversion(unit)));
  const baseId = String(product.id);
  const basePrice = Number(product.price || 0);
  const baseMrp = Number(product.mrp ?? basePrice);
  const baseWholesale = product.wholesalePrice === "" || product.wholesalePrice == null
    ? null
    : Number(product.wholesalePrice);
  const common = {
    productMasterId: baseId,
    unitPricingGroupId: String(product?.unitPricingGroupId || baseId),
    baseProductName: product.name,
    stockConversionTracked: true,
  };
  if (!units.length) return [{ ...product, ...common, salesUnit: product.unit || "piece", unitConversion: 1 }];
  return [
    { ...product, ...common, salesUnit: product.unit || "piece", unitConversion: 1 },
    ...units.map((unit) => {
      const stockConversion = productUnitStockConversion(unit);
      const unitPrice = Number.isFinite(unit.sellingPrice) ? unit.sellingPrice : basePrice * stockConversion;
      const unitMrp = Number.isFinite(unit.mrp) ? unit.mrp : baseMrp * stockConversion;
      return {
        ...product,
        ...common,
        id: `${baseId}::unit::${unit.id}`,
        name: `${product.name} · ${unit.name}`,
        salesUnit: unit.name,
        unitConversion: stockConversion,
        unitRelationshipQuantity: unit.conversion,
        unitConversionMode: unit.conversionMode,
        mrp: unitMrp,
        price: unitPrice,
        retailPrice: unitPrice,
        sellingPrice: unitPrice,
        wholesalePrice: baseWholesale === null ? "" : baseWholesale * stockConversion,
        barcode: "",
        additionalBarcodes: [],
      };
    }),
  ];
}

export function buildUnitStockRequirements(cart = []) {
  return (Array.isArray(cart) ? cart : []).reduce((requirements, item) => {
    if (!item?.stockConversionTracked || !item.productMasterId) return requirements;
    const productId = String(item.productMasterId);
    const required = Math.max(0, Number(item.qty || 0)) * Math.max(0, Number(item.unitConversion || 1));
    requirements.set(productId, Number(requirements.get(productId) || 0) + required);
    return requirements;
  }, new Map());
}

export function consolidateProductUnitCart(cart = [], catalog = []) {
  const lines = Array.isArray(cart) ? cart : [];
  const sellingUnits = Array.isArray(catalog) ? catalog : [];
  const groupedIds = new Set(lines
    .filter((item) => item?.stockConversionTracked && item.productMasterId)
    .map(pricingGroupId));
  if (!groupedIds.size) return lines;

  const rebuiltGroups = new Map();
  groupedIds.forEach((groupId) => {
    const groupLines = lines.filter((item) => pricingGroupId(item) === groupId);
    const totalBaseQuantity = groupLines.reduce((sum, item) => (
      sum + Math.max(0, Number(item.qty || 0)) * Math.max(0, Number(item.unitConversion || 1))
    ), 0);
    const unitOptions = sellingUnits
      .filter((item) => item?.stockConversionTracked && pricingGroupId(item) === groupId)
      .filter((item) => Number(item.unitConversion || 0) > 0)
      .sort((first, second) => Number(second.unitConversion) - Number(first.unitConversion));
    if (!unitOptions.length) {
      rebuiltGroups.set(groupId, groupLines);
      return;
    }
    const smallestOption = unitOptions[unitOptions.length - 1];
    const keepAsSmallestUnits = groupLines.some((item) => item.unitPricingLocked === "base" || item.unitPricingLocked === "smallest");
    if (keepAsSmallestUnits && smallestOption) {
      const smallestConversion = Number(smallestOption.unitConversion || 1);
      rebuiltGroups.set(groupId, [{
        ...smallestOption,
        cartItemKey: `${String(smallestOption.id ?? "item")}::${String(smallestOption.name ?? "").trim().toLowerCase()}`,
        qty: Number((totalBaseQuantity / smallestConversion).toFixed(6)),
        notes: "",
        unitPricingLocked: "smallest",
      }]);
      return;
    }
    let remaining = totalBaseQuantity;
    const rebuilt = [];
    unitOptions.forEach((option, index) => {
      const conversion = Number(option.unitConversion);
      const quantity = index === unitOptions.length - 1
        ? Number((remaining / conversion).toFixed(6))
        : Math.floor((remaining + 0.000001) / conversion);
      if (!quantity) return;
      rebuilt.push({ ...option, cartItemKey: `${String(option.id ?? "item")}::${String(option.name ?? "").trim().toLowerCase()}`, qty: quantity, notes: "" });
      remaining -= quantity * conversion;
    });
    rebuiltGroups.set(groupId, rebuilt);
  });

  const result = [];
  const emitted = new Set();
  lines.forEach((item) => {
    const groupId = item?.stockConversionTracked && item.productMasterId ? pricingGroupId(item) : "";
    if (!groupId) {
      result.push(item);
      return;
    }
    if (emitted.has(groupId)) return;
    emitted.add(groupId);
    result.push(...(rebuiltGroups.get(groupId) || []));
  });
  return result;
}

export function expandProductUnitCartToBase(cart = [], catalog = [], unitPricingGroupId) {
  const groupId = String(unitPricingGroupId || "");
  if (!groupId) return Array.isArray(cart) ? cart : [];
  const lines = Array.isArray(cart) ? cart : [];
  const groupLines = lines.filter((item) => pricingGroupId(item) === groupId);
  if (!groupLines.length) return lines;
  const smallestOption = (Array.isArray(catalog) ? catalog : [])
    .filter((item) => item?.stockConversionTracked && pricingGroupId(item) === groupId && Number(item.unitConversion || 0) > 0)
    .sort((first, second) => Number(first.unitConversion) - Number(second.unitConversion))[0]
    || groupLines.slice().sort((first, second) => Number(first.unitConversion || 1) - Number(second.unitConversion || 1))[0];
  if (!smallestOption) return lines;
  const baseQuantity = groupLines.reduce((sum, item) => (
    sum + Math.max(0, Number(item.qty || 0)) * Math.max(0, Number(item.unitConversion || 1))
  ), 0);
  const expandedLine = {
    ...smallestOption,
    cartItemKey: `${String(smallestOption.id ?? "item")}::${String(smallestOption.name ?? "").trim().toLowerCase()}`,
    qty: Number((baseQuantity / Number(smallestOption.unitConversion || 1)).toFixed(6)),
    notes: "",
    unitPricingLocked: "smallest",
  };
  const result = [];
  let inserted = false;
  lines.forEach((item) => {
    if (pricingGroupId(item) !== groupId) {
      result.push(item);
      return;
    }
    if (!inserted) {
      result.push(expandedLine);
      inserted = true;
    }
  });
  return result;
}

export function groupProductUnitCart(cart = [], catalog = [], unitPricingGroupId) {
  const groupId = String(unitPricingGroupId || "");
  const unlocked = (Array.isArray(cart) ? cart : []).map((item) => (
    pricingGroupId(item) === groupId ? { ...item, unitPricingLocked: undefined } : item
  ));
  return consolidateProductUnitCart(unlocked, catalog);
}

export function unitStockShortage(products = [], cart = []) {
  const requirements = buildUnitStockRequirements(cart);
  for (const [productId, required] of requirements) {
    const product = products.find((item) => String(item.id) === productId);
    const available = Number(product?.packTracking ? product?.unopenedPacks || 0 : product?.stock || 0);
    if (product?.packTracking && !Number.isInteger(required)) {
      return { productId, name: product.name, required, available, unit: product.unit, reason: "Whole unopened packs only" };
    }
    if (!product || required > available + 0.000001) {
      return { productId, name: product?.name || "Product", required, available, unit: product?.unit || "piece" };
    }
  }
  return null;
}

export function applyUnitStockSale(products = [], cart = [], timestamp = new Date().toISOString()) {
  const requirements = buildUnitStockRequirements(cart);
  if (!requirements.size) return products;
  return products.map((product) => {
    const required = Number(requirements.get(String(product.id)) || 0);
    if (!required) return product;
    return { ...product, stock: Number(product.stock || 0) - required, updatedAt: timestamp };
  });
}
