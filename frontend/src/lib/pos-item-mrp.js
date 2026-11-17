export function resolvePosItemMrp(item = {}) {
  const candidates = [item.batchMrp, item.mrp, item.retailPrice, item.price];
  for (const candidate of candidates) {
    if (candidate === "" || candidate === null || candidate === undefined) continue;
    const amount = Number(candidate);
    if (Number.isFinite(amount) && amount >= 0) return amount;
  }
  return 0;
}
