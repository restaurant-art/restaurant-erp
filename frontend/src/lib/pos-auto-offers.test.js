import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAutomaticOffer, selectCouponOffer } from './pos-auto-offers.js';
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
test('different products receive their own item offers in the same bill', () => {
  const items = [{ id: 'sugar', price: 60, qty: 1 }, { id: 'sugar-pack', price: 30, qty: 1 }];
  const flat = { ...newPromotion('flat'), id: 'flat', name: 'Flat off', status: 'Active', discountValue: '10', productIds: ['sugar'], startTime: '00:00', endTime: '23:59' };
  const percent = offer('pack offer', 15, { productIds: ['sugar-pack'] });
  const result = selectAutomaticOffer([flat, percent], items, evaluate);
  assert.equal(result.amount, 14.5);
  assert.deepEqual(result.lineDiscounts, [10, 4.5]);
  assert.deepEqual(result.appliedOffers.map(({ id, amount }) => [id, amount]), [['flat', 10], ['pack offer', 4.5]]);
});
test('item offers do not stack on the same product and basket offers remain alternatives', () => {
  const items = [{ id: 'a', price: 100, qty: 1 }, { id: 'b', price: 100, qty: 1 }];
  const rules = [offer('both', 10), offer('a20', 20, { productIds: ['a'] }), offer('a15', 15, { productIds: ['a'] })];
  const result = selectAutomaticOffer(rules, items, evaluate);
  assert.equal(result.amount, 30);
  assert.deepEqual(result.lineDiscounts, [20, 10]);
  const basket = { ...newPromotion('spend-flat'), id: 'basket', name: 'Basket', status: 'Active', discountValue: '40', minimumOrder: '100', startTime: '00:00', endTime: '23:59' };
  assert.equal(selectAutomaticOffer([...rules, basket], items, evaluate).appliedOffer.id, 'basket');
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

test('coupon codes apply the matching active promotion and allocate its discount to bill lines',()=>{
  const items = [...cart,{id:'tea',price:60,qty:1}];
  const rule = offer('welcome',10,{template:'coupon',type:'Coupon',couponCode:'WELCOME'});
  const result = selectCouponOffer([rule],items,evaluate,'  welcome  ',{now:new Date(2026,9,17,12)});
  assert.equal(result.amount,10);
  assert.equal(result.appliedOffer.coupon,true);
  assert.equal(result.appliedOffer.couponCode,'WELCOME');
  assert.equal(result.lineDiscounts.reduce((sum,value)=>sum+value,0),10);
  assert.equal(selectAutomaticOffer([rule],items,evaluate).amount,0);
});

test('coupon entry rejects unknown codes, empty bills, and coupons that are inactive or ineligible',()=>{
  const active = offer('welcome',10,{template:'coupon',type:'Coupon',couponCode:'WELCOME'});
  assert.match(selectCouponOffer([active],cart,evaluate,'NOPE').couponError,/No promotion uses/);
  assert.match(selectCouponOffer([active],[],evaluate,'WELCOME').couponError,/Add items/);
  const paused = {...active,status:'Paused'};
  assert.equal(selectCouponOffer([paused],cart,evaluate,'WELCOME').amount,0);
  assert.match(selectCouponOffer([paused],cart,evaluate,'WELCOME').couponError,/not active/);
  const minimum = {...active,minimumOrder:'100'};
  assert.equal(selectCouponOffer([minimum],cart,evaluate,'WELCOME').amount,0);
  assert.match(selectCouponOffer([minimum],cart,evaluate,'WELCOME').couponError,/Minimum merchandise spend/);
});

test('legacy coupon promotion records also work and multiple matching codes choose the best eligible offer',()=>{
  const legacy = {id:'legacy-coupon',name:'Legacy',type:'Coupon',couponCode:'SAVE',status:'Active',discountValue:'7'};
  const current = offer('current-coupon',12,{template:'coupon',type:'Coupon',couponCode:'SAVE'});
  const result = selectCouponOffer([legacy,current],cart,rule=>({amount:Number(rule.discountValue)}),'save');
  assert.equal(result.amount,12);
  assert.equal(result.appliedOffer.id,'current-coupon');
  const legacyOnly = selectCouponOffer([legacy],cart,rule=>({amount:Number(rule.discountValue)}),'SAVE');
  assert.equal(legacyOnly.amount,7);
  assert.deepEqual(legacyOnly.lineDiscounts,[7]);
});
