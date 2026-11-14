import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateBulkRepack,
  calculateBulkRepackBatch,
  createBulkRepackTransaction,
  createRepackProduct,
  ean13CheckDigit,
  makeUniqueEan13,
  reverseBulkRepack,
} from "./bulk-repacking.js";

const bulkRice = {
  id: "rice-bulk",
  name: "Basmati Rice",
  unit: "kg",
  stock: 50,
  price: 100,
  cost: 105,
  mrp: 120,
  gstRate: 5,
  barcode: "8900000000000",
};

test("calculates repacking from bulk kilograms into fixed retail pack weights", () => {
  const plan = calculateBulkRepack(bulkRice, { packSize: "500", packUnit: "g", packCount: "100" });

  assert.deepEqual(plan, {
    packGrams: 500,
    totalGrams: 50000,
    sourceQuantityUsed: 50,
    sourceQuantityRemaining: 0,
    packCount: 100,
  });
});

test("supports a partial run and preserves decimal source stock", () => {
  const plan = calculateBulkRepack({ ...bulkRice, stock: 50 }, { packSize: "250", packUnit: "g", packCount: "6" });

  assert.equal(plan.sourceQuantityUsed, 1.5);
  assert.equal(plan.sourceQuantityRemaining, 48.5);
});

test("plans multiple source products and totals all repack weight and packs", () => {
  const flour = { id: "flour-bulk", name: "Wheat Flour", unit: "g", stock: 20000 };
  const plan = calculateBulkRepackBatch([
    { sourceId: bulkRice.id, packSize: "500", packUnit: "g", packCount: "10" },
    { sourceId: flour.id, packSize: "250", packUnit: "g", packCount: "8" },
  ], [bulkRice, flour]);

  assert.equal(plan.productCount, 2);
  assert.equal(plan.totalPacks, 18);
  assert.equal(plan.totalGrams, 7000);
  assert.deepEqual(plan.lines.map(({ plan: linePlan }) => linePlan.sourceQuantityUsed), [5, 2000]);
});

test("one bulk product can produce several distinct pack sizes in one run", () => {
  const sugar = { ...bulkRice, id: "sugar-bulk", name: "Sugar", stock: 16 };
  const plan = calculateBulkRepackBatch([
    { sourceId: sugar.id, packSize: 250, packUnit: "g", packCount: 4 },
    { sourceId: sugar.id, packSize: 500, packUnit: "g", packCount: 6 },
    { sourceId: sugar.id, packSize: 750, packUnit: "g", packCount: 4 },
  ], [sugar]);
  assert.equal(plan.productCount, 1);
  assert.equal(plan.variantCount, 3);
  assert.equal(plan.totalPacks, 14);
  assert.equal(plan.totalGrams, 7000);
  assert.deepEqual(plan.lines.map(({ plan: linePlan }) => linePlan.sourceQuantityRemaining), [15, 12, 9]);
  const outputs = [];
  for (const { source, plan: linePlan } of plan.lines) outputs.push(createRepackProduct(source, linePlan, { sellingPrice: 20, mrp: 25, products: [sugar, ...outputs] }));
  assert.equal(new Set(outputs.map((item) => item.barcode)).size, 3);
  assert.equal(new Set(outputs.map((item) => item.sku)).size, 3);
});

test("multi-product repack requires each source and rejects duplicate sizes or combined over-stock", () => {
  assert.throws(() => calculateBulkRepackBatch([{ sourceId: "", packSize: 500, packUnit: "g", packCount: 1 }], [bulkRice]), /Select a bulk product/);
  assert.throws(() => calculateBulkRepackBatch([
    { sourceId: bulkRice.id, packSize: 500, packUnit: "g", packCount: 1 },
    { sourceId: bulkRice.id, packSize: 0.5, packUnit: "kg", packCount: 1 },
  ], [bulkRice]), /already has a 500 g pack/);
  assert.throws(() => calculateBulkRepackBatch([
    { sourceId: bulkRice.id, packSize: 500, packUnit: "g", packCount: 101 },
  ], [bulkRice]), /Not enough Basmati Rice/);
  assert.throws(() => calculateBulkRepackBatch([
    { sourceId: bulkRice.id, packSize: 500, packUnit: "g", packCount: 80 },
    { sourceId: bulkRice.id, packSize: 750, packUnit: "g", packCount: 20 },
  ], [bulkRice]), /Not enough Basmati Rice/);
});

test("rejects runs that exceed available stock or use a fractional pack count", () => {
  assert.throws(
    () => calculateBulkRepack({ ...bulkRice, stock: 1 }, { packSize: "500", packUnit: "g", packCount: "3" }),
    /Not enough Basmati Rice/,
  );
  assert.throws(
    () => calculateBulkRepack(bulkRice, { packSize: "500", packUnit: "g", packCount: "2.5" }),
    /whole number of packs/,
  );
});

test("creates a sellable, barcode-ready POS product and a corresponding stock movement", () => {
  const plan = calculateBulkRepack(bulkRice, { packSize: "500", packUnit: "g", packCount: "10" });
  const product = createRepackProduct(bulkRice, plan, { sellingPrice: 65, mrp: 70, products: [bulkRice], id: "rice-500g" });
  const movement = createBulkRepackTransaction(bulkRice, product, plan, { id: "repack-1", date: "2026-10-26" });

  assert.equal(product.name, "Basmati Rice - 500 g pack");
  assert.equal(product.unit, "pcs");
  assert.equal(product.stock, 10);
  assert.equal(product.sellable, true);
  assert.equal(product.purchasable, false);
  assert.equal(product.barcode.length, 13);
  assert.equal(product.barcode.at(-1), ean13CheckDigit(product.barcode.slice(0, 12)));
  assert.equal(movement.sourceQuantity, 5);
  assert.equal(movement.outputItemId, product.id);
  assert.equal(movement.outputQuantity, 10);
});

test("generates a barcode that is unique against the current catalog", () => {
  const firstBarcode = makeUniqueEan13([], 1234567890);
  const secondBarcode = makeUniqueEan13([{ barcode: firstBarcode }], 1234567890);

  assert.notEqual(secondBarcode, firstBarcode);
  assert.equal(firstBarcode.at(-1), ean13CheckDigit(firstBarcode.slice(0, 12)));
});

const packedRice = { id: "rice-500g", name: "Basmati Rice - 500 g pack", repackedFromProductId: bulkRice.id, packSizeGrams: 500, stock: 10, unit: "pcs", barcode: "2000000000015" };

test("partial reversal returns the exact weight to bulk and records both stock changes without mutating inputs", () => {
  const source = { ...bulkRice, stock: 45 };
  const products = [source, { ...packedRice }, { id: "unrelated", stock: 7 }];
  const result = reverseBulkRepack(products, packedRice.id, "3", { id: "reverse-1", now: "2026-10-26T12:00:00.000Z" });
  assert.equal(result.products.find((item) => item.id === bulkRice.id).stock, 46.5);
  assert.equal(result.products.find((item) => item.id === packedRice.id).stock, 7);
  assert.equal(products[0].stock, 45);
  assert.equal(products[1].stock, 10);
  assert.equal(result.products[2], products[2]);
  assert.equal(result.transaction.type, "Bulk Repacking Reversal");
  assert.equal(result.transaction.sourceQuantity, 1.5);
  assert.equal(result.transaction.outputQuantity, 3);
  assert.equal(result.transaction.sourceItemId, bulkRice.id);
  assert.equal(result.transaction.outputItemId, packedRice.id);
});

test("full reversal restores depleted bulk stock and cannot be repeated after the packs are gone", () => {
  const result = reverseBulkRepack([{ ...bulkRice, stock: 0 }, packedRice], packedRice.id, 10);
  assert.equal(result.products[0].stock, 5);
  assert.equal(result.products[1].stock, 0);
  assert.throws(() => reverseBulkRepack(result.products, packedRice.id, 1), /Only 0 unsold packs/);
});

test("reversal uses current unsold stock and rejects fractional, zero, or excessive pack counts", () => {
  const products = [bulkRice, { ...packedRice, stock: 2 }];
  for (const count of [0, -1, 1.5, ""]) assert.throws(() => reverseBulkRepack(products, packedRice.id, count), /whole number/);
  assert.throws(() => reverseBulkRepack(products, packedRice.id, 3), /Only 2 unsold packs/);
});

test("reversal converts pack weights to the source unit and rejects missing or invalid source data", () => {
  const result = reverseBulkRepack([{ ...bulkRice, unit: "g", stock: 100 }, packedRice], packedRice.id, 2);
  assert.equal(result.products[0].stock, 1100);
  assert.equal(result.transaction.sourceUnit, "g");
  assert.throws(() => reverseBulkRepack([packedRice], packedRice.id, 1), /original bulk product/);
  assert.throws(() => reverseBulkRepack([bulkRice, { ...packedRice, packSizeGrams: 0 }], packedRice.id, 1), /valid pack weight/);
  assert.throws(() => reverseBulkRepack([bulkRice], bulkRice.id, 1), /Select a repacked product/);
});
