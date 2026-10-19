const text = (value) => String(value ?? "").trim();

// EAN/MRP choices belong to the product's stock record; saved stock batches
// retain their own item IDs. Never pass a display-only batch ID to inventory.
export function purchaseItemOptions(items = []) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return items.flatMap((item) => {
    const parent = byId.get(item.parentProductId);
    const label = text(item.variantLabel);
    const name = parent?.name || item.parentProductName || item.name;
    const base = {
      ...item,
      key: item.id,
      itemId: item.id,
      displayName: label ? `${name} - ${label}` : item.name,
      batchLabel: label,
      batchBarcode: text(item.barcode),
      batchMrp: item.mrp ?? "",
      sharedStock: false,
      searchTerms: [item.name, name, label, item.sku, parent?.sku, item.barcode],
    };
    if (item.parentProductId) return [base];
    const combinations = [{ barcode: item.barcode, mrp: item.mrp }, ...(item.eanMrpOptions || [])]
      .filter((option) => text(option.barcode) || text(option.mrp));
    if (!(item.eanMrpOptions || []).length || !combinations.length) return [base];
    return combinations.map((option, index) => {
      const batchLabel = `Batch ${index + 1}`;
      return {
        ...base,
        key: JSON.stringify([item.id, index, text(option.barcode), text(option.mrp)]),
        displayName: `${item.name} - ${batchLabel}`,
        batchLabel,
        batchBarcode: text(option.barcode),
        batchMrp: option.mrp ?? "",
        sharedStock: true,
        searchTerms: [item.name, item.sku, batchLabel, option.barcode, option.mrp],
      };
    });
  });
}

export function matchesPurchaseItem(option, query) {
  const haystack = option.searchTerms.map(text).join(" ").toLowerCase();
  return text(query).toLowerCase().split(/\s+/).filter(Boolean).every((term) => haystack.includes(term));
}

export function purchaseBatchFields(option) {
  return {
    batchKey: option?.key || "",
    batchLabel: option?.batchLabel || "",
    batchBarcode: option?.batchBarcode || "",
    batchMrp: option?.batchMrp ?? "",
  };
}
