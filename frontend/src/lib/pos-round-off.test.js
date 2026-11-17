import test from "node:test";
import assert from "node:assert/strict";
import { calculatePosRoundOff } from "./pos-round-off.js";

test("keeps the exact bill total when round off is disabled", () => {
  assert.deepEqual(calculatePosRoundOff(55.49, false), {
    exactTotal: 55.49,
    payableTotal: 55.49,
    adjustment: 0,
  });
});

test("rounds down to the nearest rupee", () => {
  assert.deepEqual(calculatePosRoundOff(55.49, true), {
    exactTotal: 55.49,
    payableTotal: 55,
    adjustment: -0.49,
  });
});

test("rounds fifty paise up to the next rupee", () => {
  assert.deepEqual(calculatePosRoundOff(55.5, true), {
    exactTotal: 55.5,
    payableTotal: 56,
    adjustment: 0.5,
  });
});

test("normalizes invalid and negative totals", () => {
  assert.deepEqual(calculatePosRoundOff("not-a-number", true), {
    exactTotal: 0,
    payableTotal: 0,
    adjustment: 0,
  });
  assert.equal(calculatePosRoundOff(-10, true).payableTotal, 0);
});
