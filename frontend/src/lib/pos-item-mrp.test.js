import test from "node:test";
import assert from "node:assert/strict";
import { resolvePosItemMrp } from "./pos-item-mrp.js";

test("uses the selected batch MRP before the product MRP", () => {
  assert.equal(resolvePosItemMrp({ batchMrp: 120, mrp: 110, price: 90 }), 120);
});

test("uses product MRP for an ordinary POS item", () => {
  assert.equal(resolvePosItemMrp({ mrp: 75, retailPrice: 70, price: 65 }), 75);
});

test("falls back to retail or selling price for legacy menu items", () => {
  assert.equal(resolvePosItemMrp({ retailPrice: 55, price: 50 }), 55);
  assert.equal(resolvePosItemMrp({ price: 40 }), 40);
});

test("ignores invalid MRP values", () => {
  assert.equal(resolvePosItemMrp({ batchMrp: "", mrp: "invalid", price: 25 }), 25);
  assert.equal(resolvePosItemMrp({ mrp: -10 }), 0);
});
