import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAutomaticOffer } from './pos-auto-offers.js';
import { evaluatePromotion, newPromotion } from './promotion-rules.js';
const cart = [{ id: 'pepsi', price: 40, qty: 1, tax: 40 }];
const offer = (id, value, extra = {}) => ({ ...newPromotion('percent'), id, name: id, status: 'Active', discountValue: String(value), startTime:'00:00',endTime:'23:59', ...extra });
const evaluate = (rule, items, code, context) => evaluatePromotion(rule, items, { now:new Date(2026,9,17,12), ...context, couponEntry: code });
test('automatically chooses best eligible discount without stacking', () => {
  const result = selectAutomaticOffer([offer('ten',10),offer('twenty',20)],cart,evaluate);
  assert.equal(result.amount,8);
  assert.equal(result.appliedOffer.id,'twenty');
  assert.deepEqual(result.lineDiscounts,[8]);
});
test('quantity changes and removal recalculate without stale amounts', () => {
  assert.equal(selectAutomaticOffer([offer('ten',10)], [{...cart[0],qty:2}],evaluate).amount,8);
  assert.equal(selectAutomaticOffer([offer('ten',10)],[],evaluate).appliedOffer,null);
});
test('inactive, coupon, unmatched products, minimum and day restrictions remain enforced', () => {
  const rules = [offer('paused',50,{status:'Paused'}),offer('coupon',50,{template:'coupon',couponCode:'SECRET'}),offer('other',50,{productIds:['other']}),offer('minimum',50,{minimumOrder:100}),offer('day',50,{runDays:['Monday']})];
  assert.equal(selectAutomaticOffer(rules,cart,evaluate,{now:'2026-10-17T12:00:00'}).amount,0);
});
test('legacy discounts receive per-line allocations; invalid results cannot poison totals', () => {
  const items = [...cart,{id:'other',price:60,qty:1}];
  assert.deepEqual(selectAutomaticOffer([offer('legacy',10)],items,()=>({amount:10})).lineDiscounts,[4,6]);
  assert.equal(selectAutomaticOffer([offer('bad',10)],cart,()=>({amount:NaN})).amount,0);
});

test('POS automatically starts and stops scheduled offers and falls back to eligible offers',()=>{
  const rules=[offer('regular',10),offer('timed',20,{status:'Scheduled',startTime:'10:00',endTime:'12:00'})];
  const at=hour=>selectAutomaticOffer(rules,cart,evaluate,{now:new Date(2026,9,17,hour)});
  assert.equal(at(9).appliedOffer.id,'regular');
  assert.equal(at(10).appliedOffer.id,'timed');
  assert.equal(at(12).appliedOffer.id,'regular');
  assert.equal(selectAutomaticOffer([offer('paused',20,{status:'Paused',startTime:'10:00',endTime:'12:00'})],cart,evaluate).amount,0);
});
