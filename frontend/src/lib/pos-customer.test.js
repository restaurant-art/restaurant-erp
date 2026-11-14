import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBillCustomer } from './pos-customer.js';

test('accepts customer details and trims name without changing mobile', () => {
  assert.deepEqual(validateBillCustomer({ name: '  Test Customer  ', mobile: '9000000000' }), { customer: { name: 'Test Customer', mobile: '9000000000' }, errors: {}, valid: true });
});
test('allows name-only or mobile-only details for a non-credit bill', () => {
  assert.equal(validateBillCustomer({ name: 'Test Customer' }).valid, true);
  assert.equal(validateBillCustomer({ mobile: '9000000000' }).valid, true);
});
test('does not add an empty customer or a one-character name', () => {
  assert.ok(validateBillCustomer({ name: '   ', mobile: '' }).errors.name);
  assert.ok(validateBillCustomer({ name: 'A' }).errors.name);
});
test('rejects invalid mobile numbers instead of attaching them to the bill', () => {
  for (const mobile of ['12345', '90000000000', '90000abcde']) assert.ok(validateBillCustomer({ name: 'Test Customer', mobile }).errors.mobile);
});
test('keeps the full Indian customer number when pasted with a country code', () => {
  for (const mobile of ['+91 98765 43210', '919876543210', '98765-43210']) {
    const result = validateBillCustomer({ mobile });
    assert.equal(result.valid, true);
    assert.equal(result.customer.mobile, '9876543210');
  }
  assert.ok(validateBillCustomer({ mobile: '+1 202 555 0123' }).errors.mobile);
});
