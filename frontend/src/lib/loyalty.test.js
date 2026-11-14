import test from 'node:test';
import assert from 'node:assert/strict';
import { loyaltyPointValue, normalizeLoyaltySettings, pointsForSale } from './loyalty.js';
import { buildCustomerRows, mergeCustomerEdits, normalizeCustomerStore } from './crm-customers.js';

test('earns points for complete purchase amounts and converts points to money', () => {
  const rule = { purchaseAmount: 100, points: 2, pointValue: 0.5 };
  assert.equal(pointsForSale(99.99, rule), 0);
  assert.equal(pointsForSale(100, rule), 2);
  assert.equal(pointsForSale(250, rule), 4);
  assert.equal(loyaltyPointValue(4, rule), 2);
  assert.equal(normalizeLoyaltySettings({ ...rule, points: 1.5 }), null);
  assert.equal(normalizeLoyaltySettings({ ...rule, pointValue: 0 }), null);
});

test('recorded points keep their original rule while old bills retain their legacy totals', () => {
  const bills = [{ customerName: 'Alex', customerMobile: '9876543210', total: 120 },
    { customerName: 'Alex', customerMobile: '9876543210', total: 250, loyaltyPointsEarned: 4 }];
  const rows = buildCustomerRows(bills);
  assert.equal(rows[0][2], '124');
  const edited = Object.assign([...rows[0]], { recordId: rows[0].recordId });
  edited[2] = '130';
  const overrides = mergeCustomerEdits([], rows, [edited]);
  assert.equal(buildCustomerRows([...bills, { customerName: 'Alex', customerMobile: '9876543210', total: 100, loyaltyPointsEarned: 2 }], overrides)[0][2], '132');
});

test('customer normalization retains loyalty settings with wallet and customer data', () => {
  const loyaltySettings = { purchaseAmount: 100, points: 1, pointValue: 0.5 };
  const store = normalizeCustomerStore({ loyaltySettings, walletEntries: [{ id: 'wallet', amount: 5 }] });
  assert.deepEqual(store.loyaltySettings, loyaltySettings);
  assert.equal(store.walletEntries.length, 1);
});
