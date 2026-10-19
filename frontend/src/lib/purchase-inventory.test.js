import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchaseToInventory, purchaseTotals, reversePurchaseInventory } from "./purchase-inventory.js";

test("reversing an approved purchase checks available stock before changing inventory", () => {
  const inventory = [{ id: "rice", name: "Rice", stock: 7, unit: "kg" }];
  const receipts = [{ itemId: "rice", quantity: 5 }];
  assert.equal(reversePurchaseInventory(inventory, receipts, "now")[0].stock, 2);
  assert.equal(inventory[0].stock, 7);
  assert.throws(() => reversePurchaseInventory([{ ...inventory[0], stock: 4 }], receipts), /only 4 kg on hand/);
  assert.throws(() => reversePurchaseInventory([], receipts), /no longer exists/);
});

test("purchase receipt adds stock and recalculates weighted unit cost", () => {
  const result = applyPurchaseToInventory([
    { id: "rice", name: "Rice", sku: "001", stock: 10, unit: "kg", cost: 50, reorder: 4 },
  ], [
    { itemId: "rice", quantity: 5, unit: "kg", unitCost: 80, taxRate: 5 },
  ], { timestamp: "2026-10-12T10:00:00.000Z" });

  assert.equal(result.inventory[0].stock, 15);
  assert.equal(result.inventory[0].cost, 61.3333);
  assert.equal(result.receivedLines[0].total, 420);
});

test("purchase receipt creates a new item at the received quantity", () => {
  const result = applyPurchaseToInventory([], [
    { itemId: "__new__", name: "Milk", sku: "002", hsnCode: "040120", gstRate: 5, department: "Food & Beverage", category: "Dairy", subcategory: "Milk & cream", quantity: 12, unit: "ltr", reorder: 4, unitCost: 55, taxRate: 5 },
  ], { timestamp: "2026-10-12T10:00:00.000Z", createId: () => "milk" });

  assert.deepEqual(result.inventory[0], {
    id: "milk", name: "Milk", sku: "002", hsnCode: "040120", gstRate: 5, department: "Food & Beverage", category: "Dairy", subcategory: "Milk & cream", stock: 12, unit: "ltr", reorder: 4, cost: 57.75,
    price: 55, lastPurchaseCost: 55, updatedAt: "2026-10-12T10:00:00.000Z", lastPurchaseAt: "2026-10-12T10:00:00.000Z",
  });
  assert.equal(result.receivedLines[0].created, true);
});

test("purchase totals include line tax", () => {
  assert.deepEqual(purchaseTotals([
    { quantity: 2, unitCost: 100, taxRate: 5 },
    { quantity: 1, unitCost: 50, taxRate: 12 },
  ]), { subtotal: 250, discount: 0, tax: 16, total: 266 });
});

test("purchase discount is applied before tax and included in invoice totals", () => {
  const line = { quantity: 2, unitCost: 100, discountPercent: 10, taxRate: 5 };
  const result = applyPurchaseToInventory([{ id: "rice", name: "Rice", sku: "001", stock: 0, unit: "kg", cost: 0 }], [{ ...line, itemId: "rice", unit: "kg" }], { timestamp: "2026-10-12T10:00:00.000Z" });

  assert.deepEqual(purchaseTotals([line]), { subtotal: 200, discount: 20, tax: 9, total: 189 });
  assert.equal(result.inventory[0].lastPurchaseCost, 90);
  assert.equal(result.inventory[0].price, 90);
  assert.equal(result.receivedLines[0].discount, 20);
  assert.equal(result.receivedLines[0].total, 189);
});

test("a purchase cannot create a duplicate SKU", () => {
  assert.throws(() => applyPurchaseToInventory([
    { id: "rice", name: "Rice", sku: "001", stock: 10, unit: "kg", cost: 50 },
  ], [
    { itemId: "__new__", name: "Flour", sku: "001", quantity: 1, unit: "kg", unitCost: 40 },
  ]), /already in use/);
});

test("a blank purchase rate is rejected instead of being valued at zero", () => {
  assert.throws(() => applyPurchaseToInventory([
    { id: "rice", name: "Rice", sku: "001", stock: 10, unit: "kg", cost: 50 },
  ], [
    { itemId: "rice", quantity: 2, unit: "kg", unitCost: "", taxRate: 0 },
  ]), /Enter a rate/);
});

test("a purchase discount must be between 0 and 100 percent", () => {
  assert.throws(() => applyPurchaseToInventory([], [
    { itemId: "rice", quantity: 1, unit: "kg", unitCost: 50, discountPercent: 101, taxRate: 5 },
  ]), /Discount must be between 0 and 100 percent/);
});

test("an existing product keeps its tax and classification after a purchase", () => {
  const product = { id: "rice", name: "Rice", sku: "001", hsnCode: "100630", gstRate: 5, department: "Food & Beverage", category: "Dry goods", subcategory: "Rice & grains", stock: 10, unit: "kg", cost: 50 };
  const result = applyPurchaseToInventory([product], [
    { itemId: "rice", quantity: 2, unit: "kg", unitCost: 60, taxRate: 5 },
  ]);

  assert.equal(result.inventory[0].hsnCode, product.hsnCode);
  assert.equal(result.inventory[0].gstRate, product.gstRate);
  assert.equal(result.inventory[0].department, product.department);
  assert.equal(result.inventory[0].subcategory, product.subcategory);
});

test("invalid HSN code is rejected for a purchase-created product", () => {
  assert.throws(() => applyPurchaseToInventory([], [
    { itemId: "__new__", name: "Flour", sku: "003", hsnCode: "12345", quantity: 1, unit: "kg", unitCost: 40 },
  ]), /HSN code/);
});

test("a purchase-created product cannot save a different GST rate from its invoice tax", () => {
  assert.throws(() => applyPurchaseToInventory([], [
    { itemId: "__new__", name: "Flour", sku: "003", gstRate: 5, quantity: 1, unit: "kg", unitCost: 40, taxRate: 12 },
  ]), /must match/);
});

