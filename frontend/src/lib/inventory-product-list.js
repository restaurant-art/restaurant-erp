import { inventoryStockRows } from "./inventory-stock-list.js";
import { isProductEnabled } from "./product-availability.js";

const list = (value) => Array.isArray(value) ? value : [];
const id = (value) => String(value ?? "");
const present = (value) => value !== "" && value !== null && value !== undefined;
const numeric = (value) => present(value) && Number.isFinite(Number(value)) ? Number(value) : null;
const positive = (value) => numeric(value) !== null && Number(value) > 0;
const tidy = (value) => Number(Number(value).toFixed(6));
const standard = (unit) => ({
  g: ["g", 1], gm: ["g", 1], gms: ["g", 1], gram: ["g", 1], grams: ["g", 1],
  kg: ["g", 1000], kilogram: ["g", 1000], kilograms: ["g", 1000],
  ml: ["ml", 1], l: ["ml", 1000], ltr: ["ml", 1000], litre: ["ml", 1000], liter: ["ml", 1000], litres: ["ml", 1000], liters: ["ml", 1000],
  piece: ["piece", 1], pieces: ["piece", 1], pcs: ["piece", 1], pc: ["piece", 1], each: ["piece", 1], unit: ["piece", 1], units: ["piece", 1],
})[String(unit || "").toLowerCase()];

function masterFields(product, children) {
  const legacy = children[0];
  // Explicit zero is valid. A missing master value can use its older batch.
  const value = (field, fallback = "") => present(product[field]) ? product[field]
    : present(legacy?.[field]) ? legacy[field] : fallback;
  const cost = value("cost", 0);
  const sellingPrice = value("sellingPrice");
  const priceFallback = numeric(cost) === null || numeric(product.gstRate) === null ? ""
    : Math.round(Number(cost) / (1 + Number(product.gstRate) / 100) * 10000) / 10000;
  const margin = numeric(cost) === null || numeric(sellingPrice) === null ? null : Number(sellingPrice) - Number(cost);
  const calculatedMarkup = numeric(cost) !== null && Number(cost) > 0 && numeric(sellingPrice) !== null
    ? ((Number(sellingPrice) - Number(cost)) / Number(cost)) * 100 : null;
  const markup = numeric(product.markupPercent ?? legacy?.markupPercent);
  const sellable = product.sellable !== false;
  return {
    barcode: String(product.barcode || legacy?.barcode || ""),
    reorder: value("reorder", 0), price: value("price", priceFallback), cost, sellingPrice,
    mrp: value("mrp"), wholesalePrice: product.wholesalePrice ?? "",
    ecommercePrice: product.ecommercePrice ?? "", cardPrice: product.cardPrice ?? "",
    margin_amount: sellable ? margin : null,
    margin_percent: sellable && margin !== null && Number(sellingPrice) > 0 ? margin / Number(sellingPrice) * 100 : null,
    markup_percent: sellable ? markup ?? calculatedMarkup : null,
  };
}

function stockFields(product, family, rows, data) {
  const linked = list(data.items).find((item) => id(item.legacy_key) === id(product.id));
  const measure = standard(product.unit);
  const base = linked?.unit || product.productionBaseUnit || measure?.[0] || product.unit || "piece";
  const factor = positive(linked?.inventory_factor) ? Number(linked.inventory_factor)
    : positive(product.productionUnitFactor) ? Number(product.productionUnitFactor) : measure?.[1] || 1;
  const packTracking = Boolean(product.packTracking || positive(linked?.pack_size) || rows.some((row) => row.count_basis === "sealed" || row.count_basis === "unverified" && positive(row.pack_size)));
  let total = 0, unopened = 0, loose = 0, unverified = false;
  for (const row of rows) {
    const source = family.find((entry) => id(entry.id) === id(row.product_id)) || product;
    let multiplier = 1;
    if (row.needs_link) {
      const sourceMeasure = standard(source.unit);
      multiplier = positive(source.productionUnitFactor) ? Number(source.productionUnitFactor)
        : sourceMeasure?.[0] === base ? sourceMeasure[1] : factor;
      unverified ||= Number(row.quantity || 0) !== 0;
    } else if (row.base_unit !== base) {
      const sourceMeasure = standard(row.base_unit);
      const targetMeasure = standard(base);
      if (sourceMeasure && targetMeasure && sourceMeasure[0] === targetMeasure[0]) multiplier = sourceMeasure[1] / targetMeasure[1];
      else unverified = true;
    }
    total += Number(row.quantity || 0) * multiplier;
    const mismatchedPack = packTracking && positive(row.pack_size) && Number(row.pack_size) !== factor;
    if (mismatchedPack && Number(row.sealed_packages || 0)) unverified = true;
    else unopened += Number(row.sealed_packages || 0);
    if (!row.debt) loose += Number(row.open_quantity ?? row.loose_quantity ?? 0) * multiplier;
    unverified ||= Boolean(row.read_only_reason || row.needs_conversion || row.configuration_error);
  }
  const net = tidy(total / factor);
  return {
    stock_quantity: packTracking ? tidy(unopened) : net,
    net_stock_quantity: net, unopened_packs: tidy(unopened), loose_quantity: tidy(loose),
    total_base_quantity: tidy(total), stock_base_unit: base, pack_tracking: packTracking, unverified,
    stock_editable: family.some((entry) => list(data.items).some((item) => id(item.legacy_key) === id(entry.id))),
  };
}

/** Product Master presentation; each family is displayed once at this location. */
export function buildInventoryProductList(data = {}, location) {
  const products = list(data.inventory).filter((product) => product && product.id != null);
  const byId = new Map(products.map((product) => [id(product.id), product]));
  const stocks = inventoryStockRows(data, location);
  return products.filter((product) => !product.parentProductId || !byId.has(id(product.parentProductId))).map((product) => {
    const children = products.filter((child) => id(child.parentProductId) === id(product.id));
    const family = [product, ...children];
    const familyIds = family.map((entry) => id(entry.id));
    const familyRows = stocks.filter((row) => familyIds.includes(id(row.product_id)));
    const fields = masterFields(product, children);
    const stock = stockFields(product, family, familyRows, data);
    const reorder = numeric(fields.reorder) ?? 0;
    const stockStatus = stock.total_base_quantity < 0 || stock.stock_quantity <= reorder ? "Low stock"
      : reorder > 0 && stock.stock_quantity <= reorder * 1.25 ? "Watch" : "Healthy";
    const eans = [{ barcode: fields.barcode, mrp: fields.mrp }, ...list(product.eanMrpOptions)]
      .filter((entry) => entry && (String(entry.barcode || "").trim() || present(entry.mrp)));
    const parent = product.parentProductId ? byId.get(id(product.parentProductId)) : null;
    return {
      ...product, ...fields, ...stock,
      enabled: isProductEnabled(product), parent_disabled: Boolean(product.parentProductId && (!parent || !isProductEnabled(parent))),
      stock_status: stockStatus, family_product_ids: familyIds, batch_count: children.length + eans.length,
      search_values: family.flatMap((entry) => [entry.name, entry.sku, entry.plu, entry.barcode, entry.internalBarcode, entry.hsnCode,
        entry.department, entry.category, entry.subcategory, entry.brand, entry.manufacturer,
        ...list(entry.eanMrpOptions).flatMap((option) => [option?.barcode, option?.mrp])]),
    };
  });
}

export function filterInventoryProductList(rows = [], query = "", stockFilter = "All", statusFilter = "All") {
  const terms = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return list(rows).filter((row) => {
    const enabled = row.enabled && !row.parent_disabled;
    if (statusFilter === "Enabled" && !enabled || statusFilter === "Disabled" && enabled) return false;
    if (stockFilter === "Negative stock" ? row.total_base_quantity >= 0 : stockFilter !== "All" && row.stock_status !== stockFilter) return false;
    const text = [row.name, row.sku, row.plu, row.barcode, row.hsnCode, row.category, row.brand, ...list(row.search_values)]
      .join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
