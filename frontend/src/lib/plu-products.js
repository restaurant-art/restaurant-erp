export function listPluProducts(items = [], query = "") {
  const normalizedQuery = String(query || "").trim().toLowerCase();

  return items
    .filter((item) => !item?.parentProductId)
    .filter((item) => Boolean(item?.pluEnabled ?? item?.plu) && String(item?.plu || "").trim())
    .filter((item) => !normalizedQuery || [
      item.name,
      item.sku,
      item.plu,
      item.barcode,
      item.hsnCode,
      item.department,
      item.category,
      item.subcategory,
      item.brand,
      item.manufacturer,
    ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)))
    .sort((left, right) => String(left.plu || "").localeCompare(String(right.plu || ""), undefined, { numeric: true }));
}

export function nextProductPlu(items = [], productId = "") {
  const product = items.find((item) => String(item?.id || "") === String(productId || "") && !item?.parentProductId);
  if (!product) return "";
  const used = new Set(items
    .filter((item) => !item?.parentProductId && String(item?.id || "") !== String(productId || ""))
    .filter((item) => Boolean(item?.pluEnabled ?? item?.plu))
    .map((item) => String(item?.plu || "").trim().toLowerCase())
    .filter(Boolean));
  for (const item of items) if (item.internalBarcode) used.add(String(item.internalBarcode));
  const preferred = String(product.plu || product.sku || "").trim();
  if (/^\d+$/.test(preferred) && !used.has(preferred.toLowerCase())) return preferred;

  let number = 1;
  while (used.has(String(number).padStart(3, "0"))) number += 1;
  return String(number).padStart(3, "0");
}

export function addProductToPlu(items = [], productId = "", updatedAt = new Date().toISOString()) {
  const plu = nextProductPlu(items, productId);
  if (!plu) return items;
  return items.map((item) => (String(item?.id || "") === String(productId || "") || String(item?.parentProductId || "") === String(productId || ""))
    ? { ...item, pluEnabled: true, plu, updatedAt }
    : item);
}
