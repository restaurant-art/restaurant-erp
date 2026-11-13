import { collectPromotionUsage } from './promotion-customer-limits.js';

// Item-price offers can apply to different lines; overlapping offers never stack.
// Basket and quantity-dependent promotions remain alternatives to the item offers.
export function selectAutomaticOffer(offers, cart, evaluate, context = {}) {
  let best = { amount: 0, lineDiscounts: cart.map(() => 0), appliedOffer: null };
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  if (!(subtotal > 0)) return best;
  const lineWinners = cart.map(() => null);
  for (const offer of offers || []) {
    // Never bypass a coupon's code requirement just because it is active.
    if ((offer.status !== 'Active' && !(offer.status === 'Scheduled' && offer.scheduleVersion === 1)) || offer.type === 'Coupon' || offer.template === 'coupon') continue;
    const result = evaluate(offer, cart, '', context);
    if (!Number.isFinite(result.amount) || result.amount <= 0 || result.error) continue;
    const amount = Math.min(subtotal, result.amount);
    const lineDiscounts = result.lineDiscounts || cart.map(item => amount * Number(item.price || 0) * Number(item.qty || 0) / subtotal);
    const appliedOffer = { id: offer.id, name: offer.name, type: offer.type, amount, automatic: true };
    if (amount > best.amount) best = { amount, lineDiscounts, appliedOffer, offerUsage: [collectPromotionUsage(offer.id, cart, lineDiscounts, result.lineUsage)] };
    const itemPriceOffer = ['flat', 'product-discounts'].includes(offer.template) || (offer.template === 'percent' && offer.discountMode !== 'amount');
    const validAllocation = Array.isArray(result.lineDiscounts) && result.lineDiscounts.length === cart.length && result.lineDiscounts.every((value) => Number.isFinite(Number(value)) && Number(value) >= 0) && Math.abs(result.lineDiscounts.reduce((sum, value) => sum + Number(value), 0) - amount) < 0.005;
    if (itemPriceOffer && validAllocation) {
      result.lineDiscounts.forEach((value, index) => {
        const lineTotal = Math.max(0, Number(cart[index].price || 0) * Number(cart[index].qty || 0));
        const discount = Number(value);
        if (!Number.isFinite(discount) || discount <= 0 || discount > lineTotal + 0.005) return;
        if (!lineWinners[index] || discount > lineWinners[index].discount) lineWinners[index] = { offer: appliedOffer, discount, usage: result.lineUsage?.[index] };
      });
    }
  }
  const combinedDiscounts = lineWinners.map((winner) => winner?.discount || 0);
  const combinedAmount = Math.round((combinedDiscounts.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;
  if (combinedAmount > best.amount + 0.005) {
    const selected = new Map();
    for (const winner of lineWinners) {
      if (!winner) continue;
      const existing = selected.get(winner.offer.id) || { ...winner.offer, amount: 0 };
      existing.amount = Math.round((existing.amount + winner.discount + Number.EPSILON) * 100) / 100;
      selected.set(winner.offer.id, existing);
    }
    const appliedOffers = [...selected.values()];
    const offerUsage = appliedOffers.map((entry) => collectPromotionUsage(entry.id, cart, lineWinners.map((winner) => winner?.offer.id === entry.id ? winner.discount : 0), lineWinners.map((winner) => winner?.usage)));
    best = { amount: combinedAmount, lineDiscounts: combinedDiscounts, appliedOffers, offerUsage, appliedOffer: { id: `multiple:${JSON.stringify(appliedOffers.map((entry) => entry.id))}`, name: 'Multiple offers', amount: combinedAmount, automatic: true } };
  }
  return best;
}

export function selectCouponOffer(offers, cart, evaluate, couponEntry, context = {}) {
  const code = String(couponEntry || "").trim().toUpperCase();
  const lineDiscounts = (cart || []).map(() => 0);
  const empty = { amount: 0, lineDiscounts, appliedOffer: null, couponError: "" };
  if (!code) return empty;

  const coupons = (offers || []).filter((offer) => (
    offer.template === "coupon" || String(offer.type || "").toLowerCase() === "coupon"
  ));
  const matching = coupons.filter((offer) => String(offer.couponCode || "").trim().toUpperCase() === code);
  if (!matching.length) return { ...empty, couponError: "No promotion uses that coupon code." };

  const subtotal = (cart || []).reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  if (!(subtotal > 0)) return { ...empty, couponError: "Add items to the bill before applying a coupon." };

  let best = null;
  let couponError = "This coupon is not valid for the current bill.";
  for (const offer of matching) {
    const result = evaluate(offer, cart, code, context);
    if (result.error) couponError = result.error;
    if (!Number.isFinite(result.amount) || result.amount <= 0 || result.error) continue;
    const amount = Math.min(subtotal, result.amount);
    const discounts = result.lineDiscounts || cart.map((item) => amount * Number(item.price || 0) * Number(item.qty || 0) / subtotal);
    const candidate = {
      amount,
      lineDiscounts: discounts,
      offerUsage: [collectPromotionUsage(offer.id, cart || [], discounts, result.lineUsage)],
      appliedOffer: { id: offer.id, name: offer.name, type: offer.type, amount, automatic: false, coupon: true, couponCode: code },
      couponError: "",
    };
    if (!best || candidate.amount > best.amount) best = candidate;
  }
  return best || { ...empty, couponError };
}
