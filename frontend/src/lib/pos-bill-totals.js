const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;

// Selling and offer rates are final, GST-inclusive customer prices.
export function calculateInclusiveBill(cart, manualDiscount = 0, promotion = {}) {
  const amounts = cart.map(item => positive(item.price) * positive(item.qty));
  const subtotal = money(amounts.reduce((sum, value) => sum + value, 0));
  const offerDiscount = Math.min(subtotal, positive(promotion.amount));
  const discount = Math.min(subtotal - offerDiscount, positive(manualDiscount));
  const totalDiscount = money(offerDiscount + discount);
  const total = money(Math.max(0, subtotal - totalDiscount));
  const afterOffer = subtotal - offerDiscount;
  const manualRatio = afterOffer > 0 ? (afterOffer - discount) / afterOffer : 0;
  const tax = money(cart.reduce((sum, item, index) => {
    const allocatedOffer = promotion.lineDiscounts?.[index] ?? (subtotal > 0 ? offerDiscount * amounts[index] / subtotal : 0);
    const inclusiveAmount = Math.max(0, amounts[index] - positive(allocatedOffer)) * manualRatio;
    const rate = positive(item.tax ?? 5);
    return sum + inclusiveAmount * rate / (100 + rate);
  }, 0));
  const cgst = money(tax / 2);
  return { subtotal, totalDiscount, taxableSubtotal: money(total - tax), tax, cgst, sgst: money(tax - cgst), total, taxInclusive: true };
}
