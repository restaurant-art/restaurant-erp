const UNIT_GRAMS = { mg: 0.001, g: 1, kg: 1000 };

export function normalizeRepackWeightUnit(unit) {
  const value = String(unit || "").trim().toLowerCase();
  const aliases = { gram: "g", grams: "g", gm: "g", gms: "g", kilogram: "kg", kilograms: "kg", kgs: "kg", milligram: "mg", milligrams: "mg" };
  return aliases[value] || value;
}

export function repackWeightFactor(unit) {
  return UNIT_GRAMS[normalizeRepackWeightUnit(unit)] || 0;
}

export function formatRepackWeight(grams) {
  const value = Number(grams);
  if (!Number.isFinite(value) || value <= 0) return "";
  const unit = value >= 1000 ? "kg" : "g";
  const quantity = value >= 1000 ? value / 1000 : value;
  return `${quantity.toLocaleString("en-IN", { maximumFractionDigits: 3 })} ${unit}`;
}

const rounded = (value, places = 6) => Number(Number(value).toFixed(places));

export function calculateBulkRepack(source, { packSize, packUnit, packCount }) {
  if (!source?.id) throw new Error("Select the bulk product to repack");
  const sourceFactor = repackWeightFactor(source.unit);
  const packFactor = repackWeightFactor(packUnit);
  const size = Number(packSize);
  const count = Number(packCount);
  const available = Number(source.stock);
  if (!sourceFactor || !packFactor) throw new Error("Bulk repacking supports products measured in mg, g, or kg");
  if (!Number.isFinite(size) || size <= 0) throw new Error("Enter a pack weight greater than zero");
  if (!Number.isInteger(count) || count <= 0) throw new Error("Enter a whole number of packs greater than zero");
  if (!Number.isFinite(available) || available < 0) throw new Error("The bulk product has an invalid stock quantity");
  const packGrams = size * packFactor;
  const consumedGrams = packGrams * count;
  const sourceQuantityUsed = rounded(consumedGrams / sourceFactor);
  if (!Number.isFinite(sourceQuantityUsed) || sourceQuantityUsed <= 0) throw new Error("The repack quantity is invalid");
  if (sourceQuantityUsed > available + 0.000001) {
    throw new Error(`Not enough ${source.name || "bulk stock"}. This run needs ${sourceQuantityUsed} ${source.unit}; ${available} ${source.unit} is available.`);
  }
  return {
    packGrams: rounded(packGrams, 3),
    totalGrams: rounded(consumedGrams, 3),
    sourceQuantityUsed,
    sourceQuantityRemaining: rounded(Math.max(0, available - sourceQuantityUsed)),
    packCount: count,
  };
}

export function calculateBulkRepackBatch(lines = [], products = []) {
  if (!Array.isArray(lines) || !lines.length) throw new Error("Add at least one bulk product to repack");
  const remainingBySource = new Map();
  const packSizesBySource = new Map();
  const plannedLines = lines.map((line) => {
    const source = products.find((product) => String(product.id) === String(line.sourceId));
    if (!source) throw new Error("Select a bulk product for every repack line");
    const sourceId = String(source.id);
    const packGrams = Number(line.packSize) * repackWeightFactor(line.packUnit);
    const sizes = packSizesBySource.get(sourceId) || new Set();
    const sizeKey = Math.round(packGrams * 1000);
    if (Number.isFinite(sizeKey) && sizeKey > 0 && sizes.has(sizeKey)) {
      throw new Error(`${source.name || "This product"} already has a ${formatRepackWeight(packGrams)} pack. Change its quantity instead.`);
    }
    const available = remainingBySource.has(sourceId) ? remainingBySource.get(sourceId) : Number(source.stock);
    const plan = calculateBulkRepack({ ...source, stock: available }, line);
    sizes.add(sizeKey);
    packSizesBySource.set(sourceId, sizes);
    remainingBySource.set(sourceId, plan.sourceQuantityRemaining);
    return { line, source, plan };
  });
  return {
    lines: plannedLines,
    productCount: remainingBySource.size,
    variantCount: plannedLines.length,
    totalPacks: plannedLines.reduce((sum, entry) => sum + entry.plan.packCount, 0),
    totalGrams: rounded(plannedLines.reduce((sum, entry) => sum + entry.plan.totalGrams, 0), 3),
  };
}

export function calculateBulkRepackReversal(source, product, packCount) {
  if (!product?.id || !product.repackedFromProductId) throw new Error("Select a repacked product to return to bulk");
  if (!source?.id || String(product.repackedFromProductId) !== String(source.id) || String(product.id) === String(source.id)) throw new Error("The original bulk product could not be found");
  const sourceFactor = repackWeightFactor(source.unit);
  const packGrams = Number(product.packSizeGrams);
  const count = Number(packCount);
  const available = Number(product.stock);
  const bulkStock = Number(source.stock);
  if (!sourceFactor || !Number.isFinite(packGrams) || packGrams <= 0) throw new Error("The product needs a valid pack weight and bulk weight unit before it can be reversed");
  if (!Number.isInteger(count) || count <= 0) throw new Error("Enter a whole number of packs to reverse");
  if (!Number.isFinite(available) || available < 0 || !Number.isFinite(bulkStock)) throw new Error("The product has an invalid stock quantity");
  if (count > available) throw new Error(`Only ${available} unsold packs of ${product.name || "this product"} are available to reverse`);
  const totalGrams = packGrams * count;
  const bulkQuantityReturned = rounded(totalGrams / sourceFactor);
  const bulkQuantityAfter = rounded(bulkStock + bulkQuantityReturned);
  if (!Number.isFinite(totalGrams) || !Number.isFinite(bulkQuantityReturned) || bulkQuantityReturned <= 0 || !Number.isFinite(bulkQuantityAfter)) throw new Error("The reverse repack quantity is invalid");
  return { packCount: count, totalGrams, bulkQuantityReturned, bulkQuantityAfter, packQuantityRemaining: rounded(available - count) };
}

export function reverseBulkRepack(products = [], productId, packCount, { id = `TRN-RPK-REV-${globalThis.crypto?.randomUUID?.() || Date.now()}`, now = new Date().toISOString() } = {}) {
  const product = products.find((entry) => String(entry.id) === String(productId));
  const source = products.find((entry) => String(entry.id) === String(product?.repackedFromProductId));
  const plan = calculateBulkRepackReversal(source, product, packCount);
  return {
    plan,
    products: products.map((entry) => entry === source ? { ...entry, stock: plan.bulkQuantityAfter, updatedAt: now } : entry === product ? { ...entry, stock: plan.packQuantityRemaining, updatedAt: now } : entry),
    transaction: {
      id, type: "Bulk Repacking Reversal", direction: "reverse",
      sourceItemId: source.id, sourceItemName: source.name, sourceQuantity: plan.bulkQuantityReturned, sourceUnit: source.unit,
      outputItemId: product.id, outputItemName: product.name, outputQuantity: plan.packCount, outputUnit: "pcs",
      packSizeGrams: Number(product.packSizeGrams), barcode: product.barcode,
      date: now.slice(0, 10), createdAt: now,
    },
  };
}

export function ean13CheckDigit(firstTwelve) {
  const digits = String(firstTwelve || "");
  if (!/^\d{12}$/.test(digits)) throw new Error("EAN-13 needs twelve numeric digits before its check digit");
  const sum = [...digits].reduce((total, character, index) => total + Number(character) * (index % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

export function makeUniqueEan13(products = [], seed = Date.now()) {
  const used = new Set();
  for (const product of products || []) {
    for (const code of [product.barcode, ...(product.additionalBarcodes || []), ...(product.eanMrpOptions || []).map((option) => option?.barcode)]) {
      const value = String(code || "").trim();
      if (value) used.add(value);
    }
  }
  const baseSeed = Math.abs(Math.trunc(Number(seed) || 0));
  for (let offset = 0; offset < 10000; offset += 1) {
    const serial = String(baseSeed + offset).slice(-10).padStart(10, "0");
    const firstTwelve = `20${serial}`;
    const candidate = `${firstTwelve}${ean13CheckDigit(firstTwelve)}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique barcode. Please try again.");
}

export function makeUniqueRepackSku(products = [], seed = Date.now()) {
  const used = new Set((products || []).map((product) => String(product.sku || "").trim()));
  const baseSeed = Math.abs(Math.trunc(Number(seed) || 0));
  for (let offset = 0; offset < 10000; offset += 1) {
    const candidate = `9${String(baseSeed + offset).slice(-10).padStart(10, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Could not generate a unique SKU. Please try again.");
}

export function createRepackProduct(source, plan, { sellingPrice, mrp = "", products = [], id = `INV-RPK-${Date.now()}`, now = new Date().toISOString() } = {}) {
  const salePrice = Number(sellingPrice);
  const retailMrp = mrp === "" || mrp === null || mrp === undefined ? "" : Number(mrp);
  if (!Number.isFinite(salePrice) || salePrice < 0) throw new Error("Enter a valid selling price for each pack");
  if (retailMrp !== "" && (!Number.isFinite(retailMrp) || retailMrp < salePrice)) throw new Error("MRP must be at least the selling price");
  const sourceFactor = repackWeightFactor(source.unit);
  const packQuantityInSourceUnits = plan.packGrams / sourceFactor;
  const unitCost = Number(source.cost || 0) * packQuantityInSourceUnits;
  const unitPrice = Number(source.price || source.sellingPrice || 0) * packQuantityInSourceUnits;
  const sizeLabel = formatRepackWeight(plan.packGrams);
  const barcode = makeUniqueEan13(products);
  return {
    ...source,
    id,
    name: `${String(source.name || "Product").trim()} - ${sizeLabel} pack`,
    sku: makeUniqueRepackSku(products),
    barcode,
    internalBarcode: undefined,
    additionalBarcodes: [],
    eanMrpOptions: [],
    pluEnabled: false,
    plu: "",
    stock: plan.packCount,
    unit: "pcs",
    purchasable: false,
    sellable: true,
    productType: "sellable",
    price: rounded(unitPrice, 4),
    cost: rounded(unitCost, 4),
    mrp: retailMrp,
    sellingPrice: rounded(salePrice, 2),
    wholesalePrice: "",
    ecommercePrice: "",
    cardPrice: "",
    reorder: 0,
    parentProductId: undefined,
    parentProductName: undefined,
    variantLabel: undefined,
    repackedFromProductId: source.id,
    repackedFromName: source.name,
    packSizeGrams: plan.packGrams,
    packWeight: sizeLabel,
    weightMachineEnabled: false,
    updatedAt: now,
  };
}

export function createBulkRepackTransaction(source, product, plan, { id = `TRN-RPK-${Date.now()}`, date = new Date().toISOString().slice(0, 10), now = new Date().toISOString() } = {}) {
  return {
    id,
    type: "Bulk Repacking",
    sourceItemId: source.id,
    sourceItemName: source.name,
    sourceQuantity: plan.sourceQuantityUsed,
    sourceUnit: source.unit,
    outputItemId: product.id,
    outputItemName: product.name,
    outputQuantity: plan.packCount,
    outputUnit: "pcs",
    packSizeGrams: plan.packGrams,
    barcode: product.barcode,
    date,
    createdAt: now,
  };
}
