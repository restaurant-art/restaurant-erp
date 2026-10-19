import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateInclusiveBill } from './pos-bill-totals.js';
test('40 rupee selling price remains 40 including configured 40% GST', () => {
  assert.deepEqual(calculateInclusiveBill([{price:40,qty:1,tax:40}]), {subtotal:40,totalDiscount:0,taxableSubtotal:28.57,tax:11.43,cgst:5.72,sgst:5.71,total:40,taxInclusive:true});
});
test('offer rate includes GST and manual discount reduces inclusive amount', () => {
  const cart=[{price:40,qty:1,tax:40}];
  assert.equal(calculateInclusiveBill(cart,0,{amount:10,lineDiscounts:[10]}).total,30);
  assert.equal(calculateInclusiveBill(cart,0,{amount:10,lineDiscounts:[10]}).tax,8.57);
  assert.equal(calculateInclusiveBill(cart,2,{amount:10,lineDiscounts:[10]}).tax,8);
  assert.equal(calculateInclusiveBill(cart,2,{amount:10,lineDiscounts:[10]}).total,28);
});
test('mixed GST rates follow discounted lines and preserve paise', () => {
  const result=calculateInclusiveBill([{price:118,qty:1,tax:18},{price:105,qty:1,tax:5}],0,{amount:59,lineDiscounts:[59,0]});
  assert.equal(result.total,164); assert.equal(result.tax,14); assert.equal(result.taxableSubtotal,150);
  assert.equal(calculateInclusiveBill([{price:10.25,qty:3,tax:5}]).total,30.75);
});
test('empty, free and fully discounted bills have no tax', () => {
  for(const cart of [[],[{price:0,qty:1,tax:40}],[{price:40,qty:1,tax:0}]]) assert.equal(calculateInclusiveBill(cart).tax,0);
  assert.equal(calculateInclusiveBill([{price:40,qty:1,tax:40}],100).total,0);
  assert.equal(calculateInclusiveBill([{price:40,qty:1,tax:40}],100).tax,0);
});
