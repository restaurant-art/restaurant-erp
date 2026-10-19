import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchaseSellingPrices } from "./purchase-selling-price.js";

test("purchase selling price updates the product and batches without changing cost or stock", () => {
  const inventory = [{ id: "rice", name: "Rice", sellingPrice: 100, cost: 60, stock: 10 },
    { id: "batch", parentProductId: "rice", sellingPrice: 100, cost: 65, stock: 2 },
    { id: "other", sellingPrice: 50 }];
  const result = applyPurchaseSellingPrices(inventory, [{ itemId: "batch", sellingPrice: "120.50" }]);
  assert.deepEqual(result, [{ ...inventory[0], sellingPrice: 120.5 }, { ...inventory[1], sellingPrice: 120.5 }, inventory[2]]);
  assert.equal(inventory[0].sellingPrice, 100);
});

test("blank selling price retains the existing price and explicit zero is allowed", () => {
  const inventory = [{ id: "rice", sellingPrice: 100 }];
  for (const value of ["", " ", null, undefined]) assert.equal(applyPurchaseSellingPrices(inventory, [{ itemId: "rice", sellingPrice: value }])[0].sellingPrice, 100);
  assert.equal(applyPurchaseSellingPrices(inventory, [{ itemId: "rice", sellingPrice: "0" }])[0].sellingPrice, 0);
  assert.equal(applyPurchaseSellingPrices([{ id: "new" }], [{ itemId: "new", sellingPrice: "99" }])[0].sellingPrice, 99);
});

test("invalid and conflicting selling prices cannot be posted", () => {
  const inventory = [{ id: "rice", name: "Rice" }];
  for (const value of ["-1", "not a number", "Infinity"]) assert.throws(() => applyPurchaseSellingPrices(inventory, [{ itemId: "rice", sellingPrice: value }]), /Selling price/);
  assert.throws(() => applyPurchaseSellingPrices(inventory, [{ itemId: "rice", sellingPrice: 100 }, { itemId: "rice", sellingPrice: 200 }]), /same selling price/);
});
