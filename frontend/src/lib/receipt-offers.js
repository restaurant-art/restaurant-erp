export function receiptLineAmounts(bill, index) {
  const item = bill?.items?.[index] || {};
  const original = Math.max(0, Number(item.qty || 0) * Number(item.price || 0));
  const savedDiscount = Number(bill?.lineDiscounts?.[index] || 0);
  const discount = Number.isFinite(savedDiscount) ? Math.max(0, Math.min(original, savedDiscount)) : 0;
  return { original, discount, total: Math.round((original - discount + Number.EPSILON) * 100) / 100 };
}
