function normalizeProductSearchValue(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

export function hasProductMasterSearchQuery(value) {
  return Boolean(normalizeProductSearchValue(value));
}

function productSearchValues(product) {
  return [
    product.name,
    product.sku,
    product.plu,
    product.barcode,
    product.hsnCode,
    ...(product.eanMrpOptions || []).flatMap((option) => [option?.barcode, option?.mrp]),
    ...(product.searchBarcodes || []),
  ].map(normalizeProductSearchValue).filter(Boolean);
}

function productSearchRank(product, needle) {
  if (!needle) return 0;
  const name = normalizeProductSearchValue(product.name);
  const sku = normalizeProductSearchValue(product.sku);
  const plu = normalizeProductSearchValue(product.plu);
  const barcode = normalizeProductSearchValue(product.barcode);
  if (name === needle) return 0;
  if (name.startsWith(needle)) return 1;
  if (sku === needle || plu === needle || barcode === needle) return 2;
  if (name.includes(needle)) return 3;
  return 4;
}

export function searchProductMaster(products = [], query = "") {
  const needle = normalizeProductSearchValue(query);
  const seen = new Set();
  return products
    .filter((product) => product && !product.parentProductId)
    .filter((product) => {
      const identity = String(product.id || `${product.sku || ""}:${product.name || ""}`);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return !needle || productSearchValues(product).some((value) => value.includes(needle));
    })
    .sort((first, second) => productSearchRank(first, needle) - productSearchRank(second, needle)
      || String(first.name || "").localeCompare(String(second.name || ""), undefined, { numeric: true, sensitivity: "base" })
      || String(first.sku || "").localeCompare(String(second.sku || ""), undefined, { numeric: true, sensitivity: "base" }));
}
