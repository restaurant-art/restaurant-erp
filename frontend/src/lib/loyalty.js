export function normalizeLoyaltySettings(value) {
  if (!value || typeof value !== 'object') return null;
  const purchaseAmount = Number(value.purchaseAmount);
  const points = Number(value.points);
  const pointValue = Number(value.pointValue);
  if (!Number.isFinite(purchaseAmount) || purchaseAmount <= 0 || !Number.isSafeInteger(points) || points <= 0 || !Number.isFinite(pointValue) || pointValue <= 0) return null;
  return { purchaseAmount, points, pointValue };
}

export function pointsForSale(amount, settings) {
  const rule = normalizeLoyaltySettings(settings);
  const sale = Number(amount);
  if (!rule || !Number.isFinite(sale) || sale <= 0) return 0;
  return Math.floor((sale + 1e-9) / rule.purchaseAmount) * rule.points;
}

export function loyaltyPointValue(points, settings) {
  const rule = normalizeLoyaltySettings(settings);
  const count = Number(points);
  return rule && Number.isFinite(count) && count > 0 ? Math.round((count * rule.pointValue + Number.EPSILON) * 100) / 100 : 0;
}
