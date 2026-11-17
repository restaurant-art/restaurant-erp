import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptLineAmounts } from './receipt-offers.js';

test('receipt uses recorded item offer and preserves other line prices', () => {
  const bill = { items: [{ name: 'Coffee', qty: 2, price: 55 }, { name: 'Sugar', qty: 1, price: 60 }], lineDiscounts: [0, 10] };
  assert.deepEqual(receiptLineAmounts(bill, 0), { original: 110, discount: 0, total: 110 });
  assert.deepEqual(receiptLineAmounts(bill, 1), { original: 60, discount: 10, total: 50 });
  assert.deepEqual(receiptLineAmounts({ items: bill.items, discount: 10 }, 1), { original: 60, discount: 0, total: 60 });
});

test('receipt handles fractional amounts and caps invalid discounts', () => {
  const bill = { items: [{ qty: 3, price: 9.99 }], lineDiscounts: [0.5] };
  assert.equal(receiptLineAmounts(bill, 0).total, 29.47);
  bill.lineDiscounts = [100];
  assert.equal(receiptLineAmounts(bill, 0).total, 0);
});
