import test from "node:test";
import assert from "node:assert/strict";
import { allocatePurchaseAmount, calculatePurchaseInvoice } from "./purchase-invoice-adjustments.js";

const line = (subtotal, taxRate, discount = 0, quantity = 1) => ({ subtotal, taxRate, discount, quantity,
  taxableSubtotal: subtotal - discount, netUnitCost: (subtotal - discount) / quantity });

test("bill discount is after item discounts and before mixed-rate GST", () => {
  const result = calculatePurchaseInvoice([line(200, 5, 20, 2), line(100, 18)], {
    billDiscountType: "percent", billDiscountValue: 10, freightCharge: 50, freightGstRate: 18,
    otherCharges: 10, otherChargesGstRate: 5,
  }, { strict: true });
  assert.equal(result.totals.discount, 20);
  assert.equal(result.totals.billDiscount, 28);
  assert.equal(result.totals.itemTax, 24.3);
  assert.equal(result.totals.freightTax, 9);
  assert.equal(result.totals.otherChargesTax, 0.5);
  assert.equal(result.totals.total, 345.8);
  assert.equal(Number(result.lines.reduce((sum, item) => sum + item.total, 0).toFixed(2)), 345.8);
  assert.deepEqual(result.lines.map((item) => item.billDiscount), [18, 10]);
});

test("amount discounts and paise allocations reconcile exactly across multiple lines", () => {
  assert.deepEqual(allocatePurchaseAmount(0.05, [1, 1, 1]), [0.02, 0.02, 0.01]);
  const result = calculatePurchaseInvoice([line(1, 5), line(1, 18), line(1, 0)], {
    billDiscountValue: 0.05, freightCharge: 0.07, freightGstRate: 18,
  }, { strict: true });
  for (const [field, total] of [["billDiscount", 0.05], ["freightCharge", 0.07], ["freightTax", 0.01]]) {
    assert.equal(Number(result.lines.reduce((sum, item) => sum + item[field], 0).toFixed(2)), total);
  }
  assert.equal(Number(result.lines.reduce((sum, item) => sum + item.total, 0).toFixed(2)), result.totals.total);
});

test("zero adjustments preserve historical receiving cost rounding", () => {
  const result = calculatePurchaseInvoice([line(100, 5, 0, 3)], {});
  assert.equal(result.totals.total, 105);
  assert.equal(result.lines[0].netUnitCost, 100 / 3);
  assert.equal(result.lines[0].receivedUnitCost, 35);
  assert.equal(result.totals.billDiscount, 0);
});

test("full bill discount allows separately taxed freight and charges", () => {
  const result = calculatePurchaseInvoice([line(100, 18)], { billDiscountType: "percent", billDiscountValue: 100, freightCharge: 10, freightGstRate: 5 }, { strict: true });
  assert.equal(result.totals.itemTax, 0);
  assert.equal(result.totals.total, 10.5);
  assert.equal(result.lines[0].receivedUnitCost, 10.5);
});

test("invalid adjustments cannot be submitted and previews provide errors", () => {
  for (const adjustments of [{ billDiscountValue: 101 }, { billDiscountType: "percent", billDiscountValue: 101 },
    { freightCharge: -1 }, { otherCharges: "NaN" }, { freightGstRate: 101 }, { billDiscountType: "unknown" }]) {
    assert.throws(() => calculatePurchaseInvoice([line(100, 5)], adjustments, { strict: true }));
    assert.ok(calculatePurchaseInvoice([line(100, 5)], adjustments).errors.length);
  }
});

test("automatic rounding handles both directions and half-rupee totals after tax", () => {
  for (const [amount, rate, before, adjustment, total] of [[100.2, 5, 105.21, -0.21, 105], [100.6, 5, 105.63, 0.37, 106], [100.5, 0, 100.5, 0.5, 101]]) {
    const unrounded = calculatePurchaseInvoice([line(amount, rate)]);
    const result = calculatePurchaseInvoice([line(amount, rate)], { roundOffMode: "nearest" }, { strict: true });
    assert.equal(result.totals.beforeRoundOff, before);
    assert.equal(result.totals.roundOff, adjustment);
    assert.equal(result.totals.total, total);
    assert.equal(result.lines[0].total, total);
    assert.equal(result.lines[0].receivedUnitCost, unrounded.lines[0].receivedUnitCost);
    assert.equal(result.totals.tax, unrounded.totals.tax);
  }
});

test("manual round off reconciles multiple lines without changing their costs or GST", () => {
  const items = [line(100, 5), line(80, 18), line(20, 0)];
  const charges = { billDiscountValue: 10, freightCharge: 20, freightGstRate: 18 };
  const unrounded = calculatePurchaseInvoice(items, charges);
  for (const adjustment of [-0.49, 0.49]) {
    const result = calculatePurchaseInvoice(items, { ...charges, roundOffMode: "manual", roundOffValue: adjustment }, { strict: true });
    assert.equal(Number(result.lines.reduce((sum, item) => sum + item.roundOff, 0).toFixed(2)), adjustment);
    assert.equal(Number(result.lines.reduce((sum, item) => sum + item.total, 0).toFixed(2)), result.totals.total);
    assert.equal(result.totals.total, Number((unrounded.totals.total + adjustment).toFixed(2)));
    result.lines.forEach((item, index) => {
      assert.equal(item.receivedUnitCost, unrounded.lines[index].receivedUnitCost);
      assert.equal(item.netUnitCost, unrounded.lines[index].netUnitCost);
      assert.equal(item.tax, unrounded.lines[index].tax);
    });
  }
});

test("round off is optional and invalid values cannot be submitted", () => {
  assert.equal(calculatePurchaseInvoice([line(100.2, 5)]).totals.total, 105.21);
  assert.equal(calculatePurchaseInvoice([line(100.2, 5)], { roundOffMode: "none", roundOffValue: 0.5 }).totals.roundOff, 0);
  for (const adjustments of [{ roundOffMode: "unknown" }, { roundOffMode: "manual", roundOffValue: "NaN" }, { roundOffMode: "manual", roundOffValue: -106 }]) {
    assert.throws(() => calculatePurchaseInvoice([line(100, 5)], adjustments, { strict: true }));
    assert.ok(calculatePurchaseInvoice([line(100, 5)], adjustments).errors.length);
  }
});
