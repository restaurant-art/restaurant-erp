import test from "node:test";
import assert from "node:assert/strict";
import { SHIFT_CASH_DENOMINATIONS, calculateCashDenominations, validateShiftClosingEntry, buildShiftClosingDetails } from "./shift-closing.js";

test("cash denomination list contains all requested coins and notes in order", () => {
  assert.deepEqual(SHIFT_CASH_DENOMINATIONS, [1, 2, 5, 10, 20, 50, 100, 200, 500]);
  assert.equal(Object.isFrozen(SHIFT_CASH_DENOMINATIONS), true);
});

test("cash counts calculate exactly and normalize every denomination without mutating input", () => {
  const input = Object.freeze({ 1: "3", 2: 4, 5: "2", 10: "1", 20: "2", 50: "3", 100: "4", 200: "5", 500: "6" });
  const result = calculateCashDenominations(input);
  assert.equal(result.valid, true);
  assert.equal(result.total, 4621);
  assert.deepEqual(result.counts, { 1: 3, 2: 4, 5: 2, 10: 1, 20: 2, 50: 3, 100: 4, 200: 5, 500: 6 });
  assert.equal(input[1], "3");
});

test("blank counts are zero while an explicitly entered zero confirms an empty till", () => {
  const result = calculateCashDenominations({ 1: "", 2: null, 5: undefined, 10: " ", 500: "0" });
  assert.equal(result.valid, true);
  assert.equal(result.total, 0);
  assert.ok(Object.values(result.counts).every(count => count === 0));
  for (const input of [undefined, {}, { 1: "", 500: " " }, { 1000: 4 }]) {
    assert.equal(calculateCashDenominations(input).valid, false);
  }
});

test("invalid note quantities, unsafe totals and malformed count collections are rejected", () => {
  for (const count of [-1, "-1", 1.5, "1.5", NaN, Infinity, "Infinity", true, {}, [], Symbol("count"), "oops", "0x10", "1e2", Number.MAX_SAFE_INTEGER]) {
    assert.equal(calculateCashDenominations({ 500: count }).valid, false, `Invalid count: ${String(count)}`);
  }
  for (const counts of [null, [], "5", 1, false]) assert.equal(calculateCashDenominations(counts).valid, false);
});

test("counts accept whole-valued decimal quantities and ignore non-denomination metadata", () => {
  const result = calculateCashDenominations({ 1: "2.0", 10: " 3 ", comment: "counted", 1000: 2 });
  assert.equal(result.valid, true);
  assert.equal(result.total, 32);
  assert.equal(Object.keys(result.counts).length, 9);
});

test("denominations mode is the default and requires explicit UPI and card declarations", () => {
  const result = validateShiftClosingEntry({ denominations: { 500: 2, 20: 3 }, upiTotal: "120.50", cardTotal: "20.25" });
  assert.equal(result.valid, true);
  assert.equal(result.cashCountMode, "denominations");
  assert.equal(result.cashAmount, 1060);
  assert.equal(result.upiAmount, 120.5);
  assert.equal(result.cardAmount, 20.25);
  assert.equal(result.cashDenominations[500], 2);
  assert.equal(result.cashDenominations[1], 0);
  assert.equal(result.error, "");
});

test("total mode accepts exact decimals and does not include stale denomination counts", () => {
  const result = validateShiftClosingEntry({ cashMode: "total", cashTotal: "1000.21", denominations: { 500: 99 }, upiTotal: 0, cardTotal: "0.00" });
  assert.equal(result.valid, true);
  assert.equal(result.cashAmount, 1000.21);
  assert.equal(result.cashCountMode, "total");
  assert.equal(result.cashDenominations, null);
});

test("changing to denomination mode ignores an old typed cash total", () => {
  const result = validateShiftClosingEntry({ cashMode: "denominations", denominations: { 5: 3 }, cashTotal: "9000", upiTotal: 0, cardTotal: 0 });
  assert.equal(result.valid, true);
  assert.equal(result.cashAmount, 15);
});

test("UPI and card blanks are saved as zero while cash still needs a count", () => {
  const base = { cashMode: "total", cashTotal: "0", upiTotal: "0", cardTotal: "0" };
  assert.equal(validateShiftClosingEntry(base).valid, true);
  assert.equal(validateShiftClosingEntry({ denominations: { 1: 0 }, upiTotal: 0, cardTotal: 0 }).valid, true);
  for (const missing of [undefined, null, "", "  "]) {
    const result = validateShiftClosingEntry({ ...base, cashTotal: missing });
    assert.equal(result.valid, false, `cashTotal: ${String(missing)}`);
    assert.match(result.error, /Enter the cash total/);
    for (const key of ["upiTotal", "cardTotal"]) {
      const emptyTender = validateShiftClosingEntry({ ...base, [key]: missing });
      assert.equal(emptyTender.valid, true, `${key}: ${String(missing)}`);
      assert.equal(emptyTender[key === "upiTotal" ? "upiAmount" : "cardAmount"], 0);
    }
  }
});

test("every money field rejects invalid, negative, over-precise or unsafe values", () => {
  const base = { cashMode: "total", cashTotal: 0, upiTotal: 0, cardTotal: 0 };
  for (const key of ["cashTotal", "upiTotal", "cardTotal"]) {
    for (const invalid of [-1, "-0.01", NaN, Infinity, "Infinity", "invalid", true, {}, [], "0x10", "1e2", "1.001", "1.000", 1.001, 0.000000001, Number.MAX_SAFE_INTEGER]) {
      assert.equal(validateShiftClosingEntry({ ...base, [key]: invalid }).valid, false, `${key}: ${String(invalid)}`);
    }
  }
});

test("valid decimals and harmless floating-point representation are preserved", () => {
  for (const [value, amount] of [[".50", 0.5], ["2.", 2], [" 0.01 ", 0.01], [0.29, 0.29], [0.1 + 0.2, 0.3], ["001.20", 1.2]]) {
    const result = validateShiftClosingEntry({ cashMode: "total", cashTotal: value, upiTotal: value, cardTotal: value });
    assert.equal(result.valid, true, String(value));
    assert.equal(result.cashAmount, amount);
    assert.equal(result.upiAmount, amount);
    assert.equal(result.cardAmount, amount);
  }
});

test("other payment declarations accept exact values and validate each amount", () => {
  const base = { cashMode: "total", cashTotal: 0, upiTotal: 0, cardTotal: 0 };
  const entry = validateShiftClosingEntry({ ...base, mealPassTotal: "120.50", couponTotal: "15", sodexoTotal: ".25", giftVoucherTotal: "50.00" });
  assert.equal(entry.valid, true);
  assert.deepEqual([entry.mealPassAmount, entry.couponAmount, entry.sodexoAmount, entry.giftVoucherAmount], [120.5, 15, 0.25, 50]);
  for (const key of ["mealPassTotal", "couponTotal", "sodexoTotal", "giftVoucherTotal"]) {
    for (const value of ["", "-1", "1.001", "oops"]) {
      assert.equal(validateShiftClosingEntry({ ...base, [key]: value }).valid, false, `${key}: ${value}`);
    }
  }
});

test("other payment totals are saved separately from the tracked payment variance", () => {
  const entry = validateShiftClosingEntry({ cashMode: "total", cashTotal: 10, upiTotal: 20, cardTotal: 30, mealPassTotal: "40.50", couponTotal: 50, sodexoTotal: 60, giftVoucherTotal: 70 });
  const details = buildShiftClosingDetails({ bills: [{ payment: "Cash", total: 10 }, { payment: "UPI", total: 20 }, { payment: "Card", total: 30 }], entry });
  assert.deepEqual([details.enteredClosingMealPass, details.enteredClosingCoupon, details.enteredClosingSodexo, details.enteredClosingGiftVoucher], [40.5, 50, 60, 70]);
  assert.equal(details.otherTenderDeclaredTotal, 220.5);
  assert.equal(details.enteredClosingTotal, 60);
  assert.equal(details.variance, 0);
});

test("blind declarations never depend on expected totals or report variances", () => {
  const declaration = { cashMode: "total", cashTotal: 1, upiTotal: 2, cardTotal: 3 };
  const result = validateShiftClosingEntry({ ...declaration, expectedCash: 9999, expectedUpi: 9999, expectedCard: 9999 });
  assert.deepEqual(result, validateShiftClosingEntry(declaration));
  assert.equal(result.valid, true);
  assert.equal(Object.keys(result).some(key => /expected|variance|difference|tally/i.test(key)), false);
});

test("invalid or absent cash entry is rejected without throwing", () => {
  assert.equal(validateShiftClosingEntry().valid, false);
  assert.equal(validateShiftClosingEntry({ cashMode: "unexpected", cashTotal: 0, upiTotal: 0, cardTotal: 0 }).valid, false);
  assert.equal(validateShiftClosingEntry({ denominations: { 1: -1 }, upiTotal: 0, cardTotal: 0 }).valid, false);
});

const totalEntry = (cashTotal = 0, upiTotal = 0, cardTotal = 0) => validateShiftClosingEntry({ cashMode: "total", cashTotal, upiTotal, cardTotal });

test("internal reconciliation includes opening cash and retains declared counting details", () => {
  const entry = validateShiftClosingEntry({ denominations: { 500: 3 }, upiTotal: "30.20", cardTotal: 40 });
  const details = buildShiftClosingDetails({ openingBalance: 1000, bills: [{ payment: "Cash", total: 500 }, { payment: "UPI", total: 30.2 }, { payment: "Card", total: 40 }], entry, note: "  Till handed over  " });
  assert.equal(details.expectedClosingCash, 1500);
  assert.equal(details.cashSales, 500);
  assert.equal(details.expectedClosingUpi, 30.2);
  assert.equal(details.expectedClosingCard, 40);
  assert.equal(details.enteredClosingCash, 1500);
  assert.equal(details.expectedClosingTotal, 1570.2);
  assert.equal(details.enteredClosingTotal, 1570.2);
  assert.deepEqual(details.paymentVariances, { Cash: 0, UPI: 0, Card: 0 });
  assert.equal(details.variance, 0);
  assert.equal(details.blindClosing, true);
  assert.equal(details.cashCountMode, "denominations");
  assert.deepEqual(details.cashDenominations, entry.cashDenominations);
  assert.notEqual(details.cashDenominations, entry.cashDenominations);
  assert.equal(details.closingNote, "Till handed over");
  assert.equal(details.varianceNote, details.closingNote);
});

test("retained cash change counts actual cash while cashReceived never changes UPI or card", () => {
  const details = buildShiftClosingDetails({
    bills: [
      { payment: "Cash", total: 97, paidAmount: 97, cashReceived: 100, walletChangeCredit: 3 },
      { payment: "UPI", total: 50, paidAmount: 40, walletRedemption: 10, cashReceived: 999 },
      { payment: "Card", total: 90, walletRedemption: 20, cashReceived: 999 },
      { payment: "Cash", total: 10, paidAmount: 0, walletRedemption: 10 },
      { payment: "Credit", total: 1000 },
      { payment: "Wallet", total: 1000 },
    ],
    entry: totalEntry(100, 40, 70),
  });
  assert.equal(details.cashSales, 100);
  assert.equal(details.upiSales, 40);
  assert.equal(details.cardSales, 70);
  assert.equal(details.expectedClosingTotal, 210);
  assert.equal(details.variance, 0);
});

test("all same-method split portions and refunds contribute to private reconciliation", () => {
  const details = buildShiftClosingDetails({
    openingBalance: 20,
    bills: [
      { payment: "Cash", total: 50, walletRedemption: 10 },
      { payment: "Split", total: 140, splitPayments: [{ method: "Cash", amount: 10 }, { method: "Cash", amount: 20 }, { method: "UPI", amount: 30 }, { method: "UPI", amount: 5 }, { method: "Card", amount: 50 }, { method: "Card", amount: 5 }, { method: "Credit", amount: 20 }] },
    ],
    refunds: [
      { payment: "Cash", amount: 4 },
      { payment: "UPI", amount: 3 },
      { payment: "Card", amount: 2 },
      { payment: "Split", splitPayments: [{ method: "Cash", amount: 1 }, { method: "Cash", amount: 2 }, { method: "UPI", amount: 4 }, { method: "UPI", amount: 5 }, { method: "Card", amount: 6 }, { method: "Card", amount: 7 }] },
    ],
    entry: totalEntry(83, 23, 40),
  });
  assert.equal(details.cashRefunds, 7);
  assert.equal(details.cashSales, 63);
  assert.equal(details.expectedClosingCash, 83);
  assert.equal(details.upiRefunds, 12);
  assert.equal(details.upiSales, 23);
  assert.equal(details.cardRefunds, 15);
  assert.equal(details.cardSales, 40);
  assert.equal(details.expectedClosingTotal, 146);
  assert.equal(details.variance, 0);
});

test("cancelled, reversed, draft and void source records do not affect saved reconciliation", () => {
  const excluded = ["Cancelled", "canceled", " REVERSED ", "Draft", "VOID", "voided"];
  const details = buildShiftClosingDetails({
    bills: [{ payment: "Cash", total: 10 }, ...excluded.map(status => ({ payment: "Cash", total: 1000, status }))],
    refunds: [{ payment: "Cash", amount: 2 }, ...excluded.map(status => ({ payment: "Cash", amount: 999, status }))],
    entry: totalEntry(8),
  });
  assert.equal(details.cashSales, 8);
  assert.equal(details.cashRefunds, 2);
  assert.equal(details.variance, 0);
});

test("zero denomination counts and positive or negative differences are accepted without notes", () => {
  const zeroEntry = validateShiftClosingEntry({ denominations: { 1: 0 }, upiTotal: 0, cardTotal: 0 });
  assert.equal(zeroEntry.valid, true);
  const zero = buildShiftClosingDetails({ entry: zeroEntry });
  assert.equal(zero.enteredClosingTotal, 0);
  assert.equal(zero.variance, 0);
  for (const [cash, variance] of [[0, -10], [15, 5]]) {
    const entry = totalEntry(cash);
    const details = buildShiftClosingDetails({ openingBalance: 10, entry });
    assert.equal(entry.valid, true);
    assert.equal(details.variance, variance);
    assert.equal(details.paymentVariances.Cash, variance);
    assert.equal(details.varianceNote, "");
    assert.equal(details.closingNote, "");
    assert.equal(details.cashDenominations, null);
  }
});

test("money calculations round cents and reject unvalidated declarations", () => {
  const details = buildShiftClosingDetails({
    openingBalance: 0.1,
    bills: [{ payment: "Cash", total: 0.2 }, { payment: "UPI", total: 1.005 }],
    refunds: [{ payment: "UPI", amount: 0.01 }],
    entry: totalEntry(0.3, 1),
  });
  assert.equal(details.expectedClosingCash, 0.3);
  assert.equal(details.expectedClosingUpi, 1);
  assert.equal(details.expectedClosingTotal, 1.3);
  assert.equal(details.variance, 0);
  assert.throws(() => buildShiftClosingDetails(), /valid closing declaration/);
  assert.throws(() => buildShiftClosingDetails({ entry: validateShiftClosingEntry() }), /valid closing declaration/);
});
