export const promotionTemplates = [
  { id: 'percent', title: '% off items', group: 'Price & basket', icon: 'percent', description: 'Take a percentage off selected products.', example: '10% off your chosen items' },
  { id: 'flat', title: 'Flat amount off items', group: 'Price & basket', icon: 'money', description: 'Reduce the price of each eligible unit.', example: '₹20 off each eligible unit' },
  { id: 'product-discounts', title: 'Product-wise offer rates', group: 'Price & basket', icon: 'sliders', description: 'Set a different offer selling rate for every selected product.', example: '₹55 item at ₹45 · ₹100 item at ₹80' },
  { id: 'spend-percent', title: 'Spend & save %', group: 'Price & basket', icon: 'cart', description: 'Reward a minimum basket spend with a percentage.', example: 'Spend ₹1,000, save 10%' },
  { id: 'spend-flat', title: 'Spend & save amount', group: 'Price & basket', icon: 'money', description: 'Give a fixed saving above a basket threshold.', example: 'Spend ₹1,000, save ₹100' },
  { id: 'fixed-quantity', title: 'Fixed quantity offer', group: 'Buy more, save more', icon: 'box', description: 'Discount a limited quantity after a minimum purchase.', example: 'Buy 5 units; 2 get 20% off' },
  { id: 'bogo', title: 'BOGO · same products', group: 'Buy more, save more', icon: 'gift', description: 'Buy and reward items from the same selection.', example: 'Buy 2, get 1 free' },
  { id: 'buy-get', title: 'Buy X, get Y', group: 'Buy more, save more', icon: 'gift', description: 'Buy one selection and reward a different selection.', example: 'Buy coffee, get a snack free' },
  { id: 'bundle', title: 'Bundle offer', group: 'Buy more, save more', icon: 'box', description: 'Combine specified quantities into a discounted bundle.', example: '2 drinks + 1 snack, save ₹50' },
  { id: 'tier', title: 'Quantity tiers', group: 'Buy more, save more', icon: 'layers', description: 'Increase savings as customers buy more of an item.', example: 'Buy 3: 5% off · Buy 6: 10% off' },
  { id: 'shipping', title: 'Free delivery over X', group: 'Customer & occasion', icon: 'truck', description: 'Waive a delivery charge item above a minimum spend.', example: 'Free delivery on baskets over ₹500' },
  { id: 'first', title: 'First purchase offer', group: 'Customer & occasion', icon: 'user', description: 'Welcome a customer on their first recorded purchase.', example: 'First purchase: 10% off' },
  { id: 'happy', title: 'Happy hour', group: 'Customer & occasion', icon: 'clock', description: 'Offer savings during a daily time window.', example: '4–7 PM: 20% off' },
  { id: 'coupon', title: 'Coupon code', group: 'Customer & occasion', icon: 'ticket', description: 'Unlock a discount with a code at checkout.', example: 'WELCOME100 · ₹100 off' },
  { id: 'custom', title: 'Custom promotion', group: 'Your own rules', icon: 'sliders', description: 'Combine product, quantity and spend conditions.', example: 'Choose conditions and a reward' },
];
export const promotionDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const num = value => Number(value || 0);
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const phone = value => String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
export function newPromotion(template = 'percent') {
  return { ruleVersion: 2, scheduleVersion: 1, template, name: '', type: promotionTemplates.find(t => t.id === template)?.title || 'Promotion', status: 'Active', productIds: [], rewardProductIds: [], productDiscounts: [], discountMode: ['flat', 'spend-flat', 'bundle', 'coupon', 'product-discounts'].includes(template) ? 'amount' : 'percent', discountValue: ['bogo', 'buy-get'].includes(template) ? '100' : '', minimumOrder: '', minimumQuantity: '1', buyQuantity: '1', rewardQuantity: '1', quantityCap: '1', bundleLines: [], tiers: [{ quantity: '3', percent: '5' }, { quantity: '6', percent: '10' }], runDays: [...promotionDays], startTime: template === 'happy' ? '16:00' : '', endTime: template === 'happy' ? '19:00' : '', startDate: '', endDate: '', couponCode: '' };
}
export function editablePromotion(offer) {
  if (offer.ruleVersion === 2) return { ...newPromotion(offer.template), ...offer, scheduleVersion: 1, ...(offer.scheduleVersion !== 1 && offer.template !== 'happy' ? { startTime: '', endTime: '' } : {}) };
  const template = ({ 'Time based': 'happy', Percentage: 'percent', BOGO: 'buy-get', Combo: 'bundle', Coupon: 'coupon' })[offer.type] || 'percent';
  let runDays = promotionDays.filter(day => String(offer.days || '').toLowerCase().includes(day.slice(0,3).toLowerCase()));
  if (/monday\s*-\s*friday/i.test(offer.days)) runDays = promotionDays.slice(0,5);
  if (!runDays.length || /every day/i.test(offer.days)) runDays = [...promotionDays];
  return { ...newPromotion(template), ...offer, ruleVersion: 2, scheduleVersion: 1, template, discountValue: ['bogo', 'buy-get'].includes(template) ? '100' : String(offer.discountValue ?? String(offer.discount || '').match(/\d+(?:\.\d+)?/)?.[0] ?? ''), productIds: offer.buyProductId ? [offer.buyProductId] : [], rewardProductIds: offer.freeProductId ? [offer.freeProductId] : [], bundleLines: (offer.comboProductIds || []).map(itemId => ({ itemId, quantity: '1' })), runDays };
}

const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');
function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const [year, month, day] = value.split('-').map(Number), date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
export function promotionScheduleError(offer) {
  if ((offer.scheduleVersion === 1 || offer.template === 'happy') && (!validTime(offer.startTime) || !validTime(offer.endTime) || offer.startTime === offer.endTime)) return 'Choose valid, different start and end times.';
  if ((offer.startDate && !validDate(offer.startDate)) || (offer.endDate && !validDate(offer.endDate))) return 'Choose valid start and end dates.';
  if (offer.startDate && offer.endDate && offer.endDate < offer.startDate) return 'End date cannot be before the start date.';
  return '';
}
export function promotionScheduleLabel(offer) {
  const timed = offer.scheduleVersion === 1 || offer.template === 'happy';
  const time = timed ? `${offer.startTime || 'Choose start'} – ${offer.endTime || 'Choose end'}${offer.endTime < offer.startTime ? ' (+1 day)' : ''}` : offer.window || 'All day';
  const dates = offer.startDate || offer.endDate ? `${offer.startDate || 'Any date'} → ${offer.endDate || 'No end date'}` : '';
  return { time, dates };
}
export function promotionAvailability(offer, value = new Date()) {
  if (offer.status !== 'Active' && !(offer.status === 'Scheduled' && offer.scheduleVersion === 1)) return 'This offer is not active.';
  const invalid = promotionScheduleError(offer); if (invalid) return invalid;
  const now = new Date(value); if (!Number.isFinite(now.getTime())) return 'Could not check the offer time.';
  const anchor = new Date(now);
  if (offer.scheduleVersion === 1 || offer.template === 'happy') {
    const minute = time => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
    const start = minute(offer.startTime), end = minute(offer.endTime), current = now.getHours()*60+now.getMinutes();
    if (!(start < end ? current >= start && current < end : current >= start || current < end)) return 'This offer is outside its active time.';
    // An overnight window belongs to the weekday/date on which it starts.
    if (start > end && current < end) anchor.setDate(anchor.getDate() - 1);
  }
  const date = `${anchor.getFullYear()}-${String(anchor.getMonth()+1).padStart(2,'0')}-${String(anchor.getDate()).padStart(2,'0')}`;
  if (offer.startDate && date < offer.startDate) return 'This offer has not started yet.';
  if (offer.endDate && date > offer.endDate) return 'This offer has ended.';
  if (!offer.runDays?.includes(anchor.toLocaleDateString('en-US', { weekday: 'long' }))) return 'This offer is not scheduled for today.';
  return '';
}
export function promotionSummary(offer) {
  const saving = offer.discountMode === 'amount' ? `₹${num(offer.discountValue)} off` : `${num(offer.discountValue)}% off`;
  if (offer.template === 'product-discounts') return `${offer.productDiscounts?.length || 0} products with individual offer rates`;
  if (['bogo', 'buy-get'].includes(offer.template)) return `Buy ${offer.buyQuantity}, get ${offer.rewardQuantity} at ${num(offer.discountValue)}% off`;
  if (offer.template === 'shipping') return `Free delivery on merchandise of ₹${num(offer.minimumOrder)} or more`;
  if (offer.template === 'tier') return (offer.tiers || []).map(t => `${t.quantity}+ units: ${t.percent}% off`).join(' · ');
  if (offer.template === 'bundle') return `${saving} per complete bundle`;
  if (offer.template === 'fixed-quantity') return `Buy ${offer.minimumQuantity}+; ${saving} on up to ${offer.quantityCap} units`;
  return `${saving}${offer.template === 'flat' ? ' per unit' : ''}${num(offer.minimumOrder) ? ` above ₹${num(offer.minimumOrder)}` : ''}${offer.template === 'first' ? ' on first purchase' : ''}${offer.template === 'coupon' ? ` · ${offer.couponCode}` : ''}`;
}
export function validatePromotion(offer) {
  if (!offer.name?.trim()) return 'Enter an offer name.';
  if (!promotionTemplates.some(t => t.id === offer.template)) return 'Choose a promotion type.';
  if (!offer.runDays?.length) return 'Choose at least one active day.';
  if (!['Draft','Active','Scheduled','Paused'].includes(offer.status)) return 'Choose a valid status.';
  if (!Number.isFinite(num(offer.minimumOrder)) || num(offer.minimumOrder) < 0) return 'Minimum spend must be zero or greater.';
  if (!['shipping', 'tier', 'product-discounts'].includes(offer.template) && (!(num(offer.discountValue) > 0) || !Number.isFinite(num(offer.discountValue)) || (offer.discountMode !== 'amount' && num(offer.discountValue) > 100))) return 'Enter a positive discount; percentages cannot exceed 100.';
  if (['spend-percent','spend-flat','shipping'].includes(offer.template) && !(num(offer.minimumOrder) > 0)) return 'Enter a minimum spend greater than zero.';
  for (const field of ['minimumQuantity','buyQuantity','rewardQuantity','quantityCap']) if (!(num(offer[field]) > 0) || !Number.isFinite(num(offer[field]))) return 'Quantities must be greater than zero.';
  if (['bogo','buy-get'].includes(offer.template) && (![offer.buyQuantity,offer.rewardQuantity].every(v => Number.isInteger(num(v))))) return 'Buy and reward quantities must be whole units.';
  if (['bogo','buy-get'].includes(offer.template) && !offer.productIds?.length) return 'Select the products customers must buy.';
  if (offer.template === 'buy-get' && (!offer.rewardProductIds?.length || offer.rewardProductIds.some(id => offer.productIds.includes(id)))) return 'Choose a separate selection of reward products.';
  if (offer.template === 'shipping' && offer.productIds?.length !== 1) return 'Select one delivery charge product.';
  if (offer.template === 'bundle' && (offer.bundleLines?.length < 2 || !offer.bundleLines?.every(l => l.itemId && Number.isFinite(num(l.quantity)) && num(l.quantity) > 0))) return 'Choose at least two bundle products with valid quantities.';
  if (offer.template === 'product-discounts' && (!offer.productDiscounts?.length || !offer.productDiscounts.every(line => line.itemId && String(line.offerPrice ?? '').trim() !== '' && Number.isFinite(Number(line.offerPrice)) && Number(line.offerPrice) >= 0) || new Set(offer.productDiscounts.map(line => String(line.itemId))).size !== offer.productDiscounts.length)) return 'Choose products and enter a valid offer rate for each one.';
  if (offer.template === 'tier' && (!offer.tiers?.length || !offer.tiers.every(t => num(t.quantity) > 0 && Number.isFinite(num(t.quantity)) && num(t.percent) > 0 && num(t.percent) <= 100) || new Set(offer.tiers.map(t => num(t.quantity))).size !== offer.tiers.length)) return 'Enter unique positive quantity thresholds and discounts between 0 and 100.';
  if (offer.template === 'coupon' && !offer.couponCode?.trim()) return 'Enter a coupon code.';
  const scheduleError = promotionScheduleError(offer); if (scheduleError) return scheduleError;
  return '';
}

// Returns a discount per cart line, so tax can follow the discounted products.
export function evaluatePromotion(offer, cart, context = {}) {
  const fail = error => ({ amount: 0, lineDiscounts: cart.map(() => 0), error });
  const invalid = validatePromotion(offer);
  if (invalid) return fail(invalid);
  const availability = promotionAvailability(offer, context.now ?? new Date());
  if (availability) return fail(availability);
  const lines = cart.map((item, i) => ({ i, id: String(item.id), qty: Math.max(0,num(item.qty)), price: Math.max(0,num(item.price)) }));
  if (lines.some(l => !Number.isFinite(l.qty) || !Number.isFinite(l.price))) return fail('Check the item quantities and prices.');
  const total = list => list.reduce((s,l) => s+l.qty*l.price,0);
  const quantity = list => list.reduce((s,l) => s+l.qty,0);
  const selected = ids => lines.filter(l => ids.map(String).includes(l.id));
  const eligible = offer.productIds.length ? selected(offer.productIds) : lines;
  const merchandiseTotal = offer.template === 'shipping' ? total(lines.filter(l => !offer.productIds.map(String).includes(l.id))) : total(lines);
  if (merchandiseTotal < num(offer.minimumOrder)) return fail(`Minimum merchandise spend is ₹${num(offer.minimumOrder)}.`);
  const discounts = lines.map(() => 0);
  const spread = (list, amount) => {
    const base = total(list), capped = Math.min(base,Math.max(0,amount));
    let left = round(capped);
    list.forEach((l,index) => { const part = Math.min(left, round(l.qty*l.price), index === list.length-1 ? left : round(base ? capped*l.qty*l.price/base : 0)); discounts[l.i] += part; left = round(left-part); });
  };
  const cheapest = (list, count) => {
    let remaining = count;
    return [...list].sort((a,b) => a.price-b.price).map(l => { const qty = Math.min(l.qty,remaining); remaining -= qty; return { ...l, qty }; }).filter(l => l.qty > 0);
  };
  const reward = list => offer.discountMode === 'amount' ? num(offer.discountValue) : total(list)*num(offer.discountValue)/100;
  if (offer.template === 'first') {
    const mobile = phone(context.customerMobile);
    if (!/^\d{10}$/.test(mobile) || !Array.isArray(context.orderHistory)) return fail('Enter a customer mobile number to check purchase history.');
    if (context.orderHistory.some(b => phone(b.customerMobile) === mobile && !['Void','Voided','Cancelled'].includes(b.status))) return fail('This customer already has a recorded purchase.');
  }
  if (offer.template === 'coupon' && String(context.couponEntry || '').trim().toUpperCase() !== offer.couponCode.trim().toUpperCase()) return fail('Enter the correct coupon code.');
  if (['bogo','buy-get'].includes(offer.template)) {
    const buy = num(offer.buyQuantity), get = num(offer.rewardQuantity);
    const groups = Math.floor(quantity(eligible) / (offer.template === 'bogo' ? buy+get : buy));
    const rewards = offer.template === 'bogo' ? eligible : selected(offer.rewardProductIds);
    const discounted = cheapest(rewards, Math.min(groups*get, quantity(rewards)));
    if (!groups || !discounted.length) return fail('Add the required buy and reward quantities to the bill.');
    spread(discounted, total(discounted)*num(offer.discountValue)/100);
  } else if (offer.template === 'bundle') {
    const groups = Math.floor(Math.min(...offer.bundleLines.map(l => quantity(selected([l.itemId]))/num(l.quantity))));
    if (groups < 1) return fail('Add every bundle product in the required quantity.');
    const bundle = offer.bundleLines.flatMap(l => cheapest(selected([l.itemId]), groups*num(l.quantity)));
    spread(bundle, offer.discountMode === 'amount' ? num(offer.discountValue)*groups : reward(bundle));
  } else if (offer.template === 'tier') {
    for (const id of new Set(eligible.map(l => l.id))) {
      const pool = eligible.filter(l => l.id === id);
      const tier = [...offer.tiers].sort((a,b)=>num(b.quantity)-num(a.quantity)).find(t => quantity(pool) >= num(t.quantity));
      if (tier) spread(pool,total(pool)*num(tier.percent)/100);
    }
  } else if (offer.template === 'shipping') {
    if (!['Delivery','Online'].includes(context.orderType)) return fail('Free delivery applies to Delivery or Online bills.');
    spread(eligible,total(eligible));
  } else if (offer.template === 'fixed-quantity') {
    if (quantity(eligible) < num(offer.minimumQuantity)) return fail(`Add at least ${offer.minimumQuantity} eligible units.`);
    const limited = cheapest(eligible,num(offer.quantityCap));
    spread(limited,reward(limited));
  } else if (offer.template === 'product-discounts') {
    for (const line of lines) {
      const rule = offer.productDiscounts.find(entry => String(entry.itemId) === line.id);
      if (rule) discounts[line.i] = round(Math.max(0, line.price - Number(rule.offerPrice)) * line.qty);
    }
  } else if (offer.template === 'flat') {
    eligible.forEach(l => { discounts[l.i] = round(Math.min(l.price,num(offer.discountValue))*l.qty); });
  } else {
    if (offer.template === 'custom' && quantity(eligible) < num(offer.minimumQuantity)) return fail(`Add at least ${offer.minimumQuantity} eligible units.`);
    const target = ['spend-percent','spend-flat'].includes(offer.template) ? lines : eligible;
    spread(target,reward(target));
  }
  const lineDiscounts = discounts.map((v,i) => Math.max(0,Math.min(round(v),round(lines[i].qty*lines[i].price))));
  const amount = round(lineDiscounts.reduce((s,v)=>s+v,0));
  return amount ? { amount, lineDiscounts } : fail('The bill does not meet this offer’s conditions.');
}
