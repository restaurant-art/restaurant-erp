import { isProductEnabled } from "./product-availability.js";

const asList = (value) => Array.isArray(value) ? value : [];
const sameId = (left, right) => String(left ?? "") === String(right ?? "");
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const standardUnit = (value) => new Set(["g", "gm", "gms", "gram", "grams", "kg", "kilogram", "kilograms", "ml", "millilitre", "milliliter", "l", "ltr", "litre", "litres", "liter", "liters", "piece", "pieces", "pcs", "pc", "no", "nos", "cyl", "each", "unit", "units"]).has(String(value || "").toLowerCase());

function productFor(item, data) {
  if (!item || item.legacy_key == null || String(item.legacy_key) === "") return undefined;
  return asList(data?.inventory).find((product) => sameId(product.id, item?.legacy_key));
}

function stockMeasure(item, product) {
  const unit = String(item.inventory_unit || product?.unit || item.unit || "piece");
  const base = String(item.unit || "piece");
  if (positive(item.inventory_factor)) return { unit, factor: String(item.inventory_factor) };
  if (item.inventory_factor !== undefined) return { unit, factor: null, needsConversion: true };
  if (unit.toLowerCase() === base.toLowerCase()) return { unit, factor: "1" };
  const standard = {
    kg: ["g", "1000"], kilogram: ["g", "1000"], kilograms: ["g", "1000"],
    l: ["ml", "1000"], litre: ["ml", "1000"], liter: ["ml", "1000"],
    litres: ["ml", "1000"], liters: ["ml", "1000"],
    ltr: ["ml", "1000"],
    gm: ["g", "1"], gms: ["g", "1"], gram: ["g", "1"], grams: ["g", "1"],
    millilitre: ["ml", "1"], milliliter: ["ml", "1"],
    piece: ["piece", "1"], pieces: ["piece", "1"], pcs: ["piece", "1"], pc: ["piece", "1"],
    no: ["piece", "1"], nos: ["piece", "1"], cyl: ["piece", "1"], each: ["piece", "1"],
    unit: ["piece", "1"], units: ["piece", "1"],
  }[unit.toLowerCase()];
  if (standard?.[0] === base) return { unit, factor: standard[1] };
  const measured = item.measures?.[unit.toLowerCase()];
  if (positive(measured)) return { unit, factor: String(measured) };
  if (positive(item.pack_size)) return { unit, factor: String(item.pack_size) };
  return { unit, factor: null, needsConversion: true };
}

/** Read-only list. Server count snapshots remain authoritative while editing. */
export function inventoryStockRows(data, location) {
  if (location === "" || location == null) return [];
  const balances = asList(data?.stock?.balances).filter((row) => sameId(row.location, location));
  const rows = [];
  const items = asList(data?.items).filter((item) => Boolean(productFor(item, data)))
    .slice().sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  for (const item of items) {
    const product = productFor(item, data);
    const { unit, factor, needsConversion = false } = stockMeasure(item, product);
    const itemBalances = balances.filter((row) => sameId(row.item, item.id));
    let hasPhysicalBalance = false;
    for (const balance of itemBalances) {
      const debt = String(balance.reference || "").startsWith("__negative_stock__:");
      if (!debt) hasPhysicalBalance = true;
      const loose = String(balance.loose_quantity ?? 0);
      const verifiedSize = positive(balance.pack_size) ? String(balance.pack_size) : null;
      const packSize = verifiedSize || (positive(item.pack_size) ? String(item.pack_size) : null);
      const unverified = !debt && Number(balance.on_hand) > 0 && !verifiedSize &&
        (Boolean(packSize) || !standardUnit(unit)) && !needsConversion;
      const countBasis = debt ? "debt" : unverified ? "unverified" : packSize ? "sealed" : "total";
      rows.push({
        balance: balance.balance, lot: balance.lot, item: item.id,
        quantity: String(balance.on_hand ?? 0), value: String(balance.value ?? 0),
        sealed_packages: balance.unopened_packs ?? 0, open_quantity: loose, loose_quantity: loose,
        pack_size: debt ? "" : packSize || "", count_basis: countBasis,
        debt, count_unit: debt || unverified ? item.unit : unit,
        count_factor: debt || unverified ? "1" : needsConversion ? null : packSize || factor,
        base_unit: item.unit, needs_conversion: !debt && needsConversion,
        ...(unverified ? { read_only_reason: "Verify unopened packs and loose contents in Production stock count first." } : {}),
      });
    }
    if (!hasPhysicalBalance) {
      rows.push({
        balance: "new:" + item.id, lot: null, item: item.id, quantity: "0", value: "0",
        sealed_packages: 0, open_quantity: "0", pack_size: String(item.pack_size || ""),
        loose_quantity: "0", count_basis: positive(item.pack_size) ? "sealed" : "total",
        new: true, count_unit: unit, count_factor: needsConversion ? null : positive(item.pack_size) ? String(item.pack_size) : factor,
        base_unit: item.unit, needs_conversion: needsConversion,
      });
    }
  }
  for (const product of asList(data?.inventory)) {
    if (items.some((item) => sameId(item.legacy_key, product.id))) continue;
    rows.push({
      balance: "unlinked:" + product.id, lot: null, item: null, product_id: product.id,
      quantity: String(product.stock ?? 0), value: "0", count_unit: product.unit || "",
      count_factor: "1", base_unit: product.unit || "", count_basis: "total", needs_link: true,
      name: product.name || String(product.id), sku: product.sku || "", barcode: product.barcode || "",
      reference: "Not linked to stock ledger",
      read_only_reason: "Save this product in Product Master to link its stock before editing.",
    });
  }
  return decorateInventoryStockRows(rows, data).sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
}

/** Add display metadata without replacing any saved quantity or conversion. */
export function decorateInventoryStockRows(expected, data) {
  return asList(expected).map((row) => {
    const item = asList(data?.items).find((entry) => sameId(entry.id, row.item));
    const product = productFor(item, data) || asList(data?.inventory).find((entry) => sameId(entry.id, row.product_id));
    const parent = product?.parentProductId ? asList(data?.inventory).find((entry) => sameId(entry.id, product.parentProductId)) : null;
    const balance = asList(data?.stock?.balances).find((entry) => sameId(entry.balance, row.balance));
    return {
      ...row,
      product_id: row.product_id ?? product?.id ?? item?.legacy_key,
      product_updated_at: product?.updatedAt,
      enabled: isProductEnabled(product),
      parent_disabled: Boolean(parent && !isProductEnabled(parent)),
      needs_conversion: Boolean(row.needs_conversion || row.count_factor === null || row.configuration_error),
      loose_quantity: row.loose_quantity ?? row.open_quantity ?? balance?.loose_quantity ?? "0",
      name: row.name || item?.name || product?.name || String(row.item),
      sku: row.sku ?? product?.sku ?? "",
      barcode: row.barcode ?? product?.barcode ?? "",
      reference: row.reference || (row.new ? "No stock recorded" : row.debt ? "Negative stock balance" : balance?.reference || "Lot " + row.lot),
    };
  });
}

export function filterInventoryStockRows(rows, query) {
  const terms = String(query || "").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return asList(rows).filter((row) => {
    const text = [row.name, row.sku, row.barcode, row.reference].join(" ").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

/** A blank is untouched; an explicitly entered zero is a physical count. */
export function inventoryCountPhysical(expected, quantities) {
  return asList(expected).flatMap((row) => {
    if (row.needs_link || String(row.balance).startsWith("unlinked:")) return [];
    if (!Object.prototype.hasOwnProperty.call(quantities || {}, row.balance)) return [];
    const quantity = quantities[row.balance];
    if (quantity == null || typeof quantity === "string" && quantity.trim() === "") return [];
    return [{ balance: row.balance, quantity: typeof quantity === "string" ? quantity.trim() : quantity }];
  });
}
