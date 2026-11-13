import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePromotion, newPromotion } from './promotion-rules.js';
import { selectAutomaticOffer } from './pos-auto-offers.js';
import { customerPromotionUsage } from './promotion-customer-limits.js';

const time = new Date(2026, 9, 28, 12);
const rule = { ...newPromotion('flat'), id: 'offer', name: 'Sugar', status: 'Active', startTime: '00:00', endTime: '23:59', discountValue: '10', productIds: ['sugar'], customerMaxUses: '2', customerQuantityLimits: [{ productId: 'sugar', quantity: '2' }] };
const evaluate = (offer, cart, code, context) => evaluatePromotion(offer, cart, { ...context, couponEntry: code });

test('limits offer to the remaining customer quantity and leaves extra at normal price', () => {
  const prior = [{ customerMobile: '919876543210', offerUsage: [{ offerId: 'offer', products: [{ productId: 'sugar', quantity: 1 }] }] }];
  const cart = [{ id: 'sugar', price: 60, qty: 3, unit: 'kg' }];
  const result = selectAutomaticOffer([rule], cart, evaluate, { now: time, customerMobile: '9876543210', customerOfferHistory: prior });
  assert.equal(result.amount, 10);
  assert.deepEqual(result.lineDiscounts, [10]);
  assert.deepEqual(result.offerUsage[0].products, [{ productId: 'sugar', quantity: 1 }]);
});

test('requires customer mobile and prevents uses beyond the configured maximum', () => {
  const cart = [{ id: 'sugar', price: 60, qty: 1 }];
  assert.match(evaluatePromotion(rule, cart, { now: time }).error, /mobile/);
  const prior = [1, 2].map(() => ({ customerMobile: '9876543210', appliedOffer: { id: 'offer' }, items: [] }));
  assert.match(evaluatePromotion(rule, cart, { now: time, customerMobile: '9876543210', customerOfferHistory: prior }).error, /usage limit/);
});

test('unit conversion and separate customer histories use the product stock unit', () => {
  const offer = { ...rule, customerMaxUses: '', customerQuantityLimits: [{ productId: 'sugar', quantity: 1 }] };
  const cart = [{ id: 'sugar::unit::500g', productMasterId: 'sugar', price: 30, qty: 3, unitConversion: 0.5 }];
  const result = evaluatePromotion(offer, cart, { now: time, customerMobile: '9876543210', customerOfferHistory: [] });
  assert.equal(result.amount, 10);
  assert.deepEqual(result.lineUsage, [1]);
  const history = [{ customerMobile: '9999999999', offerUsage: [{ offerId: 'offer', products: [{ productId: 'sugar', quantity: 1 }] }] }];
  assert.deepEqual(customerPromotionUsage(offer, '9876543210', history), { uses: 0, quantities: {} });
});
