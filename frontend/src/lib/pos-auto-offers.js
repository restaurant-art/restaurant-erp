// Preserve the POS's one-offer-per-bill policy. Re-evaluate instead of storing
// a stale discount when quantities, customer, price mode or eligibility change.
export function selectAutomaticOffer(offers, cart, evaluate, context = {}) {
  let best = { amount: 0, lineDiscounts: cart.map(() => 0), appliedOffer: null };
  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
  if (!(subtotal > 0)) return best;
  for (const offer of offers || []) {
    // Never bypass a coupon's code requirement just because it is active.
    if ((offer.status !== 'Active' && !(offer.status === 'Scheduled' && offer.scheduleVersion === 1)) || offer.type === 'Coupon' || offer.template === 'coupon') continue;
    const result = evaluate(offer, cart, '', context);
    if (!Number.isFinite(result.amount) || result.amount <= best.amount || result.error) continue;
    const amount = Math.min(subtotal, result.amount);
    const lineDiscounts = result.lineDiscounts || cart.map(item => amount * Number(item.price || 0) * Number(item.qty || 0) / subtotal);
    best = { amount, lineDiscounts, appliedOffer: { id: offer.id, name: offer.name, type: offer.type, amount, automatic: true } };
  }
  return best;
}
