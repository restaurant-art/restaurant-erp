// Display estimates only. The server reserves and deducts packs atomically.
export function inventoryPackTotals(product, products) {
  if (!product?.packTracking) return null;
  const family = products.filter((row) => row.id === product.id || row.parentProductId === product.id);
  return family.reduce((totals, row) => {
    const hasCounts = row.totalBaseStock != null && row.looseStock != null && row.unopenedPacks != null;
    if (!hasCounts) {
      totals.unverified ||= Number(row.stock || 0) > 0;
      return totals;
    }
    totals.unopened += Number(row.unopenedPacks || 0);
    totals.loose += Number(row.looseStock || 0);
    totals.total += Number(row.totalBaseStock || 0);
    return totals;
  }, { unopened: 0, loose: 0, total: 0, unverified: false });
}

export function retailPackAvailability(product, workspace, location) {
  if (!product?.packTracking || !workspace?.enabled) return null;
  const key = String(product.productMasterId || product.id);
  const item = workspace.items.find((row) => String(row.legacy_key) === key);
  const packs = (workspace.stock?.balances || [])
    .filter((row) => row.item === item?.id && String(row.location) === String(location)
      && Number(row.pack_size) === Number(item?.pack_size))
    .reduce((sum, row) => sum + Number(row.saleable_packs || 0), 0);
  const factor = Number(product.unitConversion || 1);
  return Number.isInteger(factor) && factor > 0 ? Math.floor(packs / factor) : 0;
}
