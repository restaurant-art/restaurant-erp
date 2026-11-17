const phone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const roundQuantity = (value) => Math.round((value + Number.EPSILON) * 1000000) / 1000000;
const roundMoney = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
export const promotionProductId = (item) => String(item?.productMasterId || item?.id || '');
export const promotionStockQuantity = (item) => Math.max(0, Number(item?.qty || 0)) * (Number(item?.unitConversion) > 0 ? Number(item.unitConversion) : 1);

export function customerPromotionUsage(offer, mobile, history = []) {
  const customer = phone(mobile), quantities = {};
  let uses = 0;
  for (const bill of history || []) {
    if (!customer || phone(bill.customerMobile) !== customer || ['void', 'voided', 'cancelled'].includes(String(bill.status || '').toLowerCase())) continue;
    const entries = (bill.offerUsage || []).filter((entry) => String(entry.offerId) === String(offer.id));
    const legacyMatches = (bill.appliedOffers || []).some((entry) => String(entry.id) === String(offer.id)) || String(bill.appliedOffer?.id || '') === String(offer.id);
    if (!entries.length && !legacyMatches) continue;
    uses += 1;
    if (entries.length) {
      for (const entry of entries) for (const item of entry.products || []) quantities[item.productId] = roundQuantity((quantities[item.productId] || 0) + Math.max(0, Number(item.quantity || 0)));
    } else {
      // Older sales did not save per-offer quantities. Count eligible purchases conservatively.
      const ids = new Set((offer.customerQuantityLimits || []).map((entry) => String(entry.productId)));
      for (const item of bill.items || []) { const id = promotionProductId(item); if (ids.has(id)) quantities[id] = roundQuantity((quantities[id] || 0) + promotionStockQuantity(item)); }
    }
  }
  return { uses, quantities };
}

export function applyCustomerPromotionLimits(offer, cart, discounts, context = {}) {
  const limits = Array.isArray(offer.customerQuantityLimits) ? offer.customerQuantityLimits : [];
  const maxUses = Number(offer.customerMaxUses || 0);
  if (!maxUses && !limits.length) return { lineDiscounts: discounts, lineUsage: cart.map((item, index) => discounts[index] > 0 ? roundQuantity(promotionStockQuantity(item)) : 0) };
  if (!/^\d{10}$/.test(phone(context.customerMobile))) return { error: 'Select a customer with a valid mobile number for this offer.' };
  const usage = customerPromotionUsage(offer, context.customerMobile, context.customerOfferHistory || context.orderHistory || []);
  if (maxUses && usage.uses >= maxUses) return { error: 'This customer has reached the offer usage limit.' };
  const remaining = Object.fromEntries(limits.map((limit) => [String(limit.productId), Math.max(0, Number(limit.quantity) - (usage.quantities[String(limit.productId)] || 0))]));
  const lineUsage = cart.map(() => 0);
  const lineDiscounts = discounts.map((discount, index) => {
    if (!(discount > 0)) return 0;
    const item = cart[index], id = promotionProductId(item), quantity = promotionStockQuantity(item);
    if (!(quantity > 0)) return 0;
    const allowed = Object.hasOwn(remaining, id) ? Math.min(quantity, remaining[id]) : quantity;
    if (Object.hasOwn(remaining, id)) remaining[id] = Math.max(0, remaining[id] - allowed);
    lineUsage[index] = roundQuantity(allowed);
    return roundMoney(Number(discount) * allowed / quantity);
  });
  return { lineDiscounts, lineUsage };
}

export function collectPromotionUsage(offerId, cart, lineDiscounts, lineUsage = []) {
  const products = new Map();
  cart.forEach((item, index) => {
    if (!(Number(lineDiscounts[index]) > 0)) return;
    const id = promotionProductId(item);
    const quantity = lineUsage[index] == null ? promotionStockQuantity(item) : Number(lineUsage[index]);
    if (id && Number.isFinite(quantity) && quantity > 0) products.set(id, roundQuantity((products.get(id) || 0) + quantity));
  });
  return { offerId, products: [...products].map(([productId, quantity]) => ({ productId, quantity })) };
}
