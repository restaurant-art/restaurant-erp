import test from "node:test";
import assert from "node:assert/strict";
import { matchesPurchaseItem, purchaseBatchFields, purchaseItemOptions } from "./purchase-batches.js";

test("both EAN/MRP batches appear and resolve to the real product ID", () => {
  const product = { id: "rice", name: "Rice", sku: "001", stock: 12, barcode: "111", mrp: 150,
    eanMrpOptions: [{ barcode: "222", mrp: 175 }] };
  const choices = purchaseItemOptions([product]);
  assert.equal(choices.length, 2);
  assert.deepEqual(choices.map((option) => option.displayName), ["Rice - Batch 1", "Rice - Batch 2"]);
  assert.notEqual(choices[0].key, choices[1].key);
  assert.ok(choices.every((option) => option.itemId === "rice" && option.sharedStock));
  assert.equal(choices.filter((option) => matchesPurchaseItem(option, "rice")).length, 2);
  assert.deepEqual(choices.filter((option) => matchesPurchaseItem(option, "rice batch 2")), [choices[1]]);
  assert.deepEqual(choices.filter((option) => matchesPurchaseItem(option, "222")), [choices[1]]);
  assert.deepEqual(purchaseBatchFields(choices[1]), { batchKey: choices[1].key, batchLabel: "Batch 2", batchBarcode: "222", batchMrp: 175 });
  assert.equal(product.stock, 12);
});

test("stock batches retain independent IDs and are searchable by parent name and SKU", () => {
  const choices = purchaseItemOptions([{ id: "rice", name: "Rice", sku: "MASTER" },
    { id: "b1", parentProductId: "rice", name: "Old batch name", variantLabel: "Batch 1", stock: 4 },
    { id: "b2", parentProductId: "rice", name: "Rice - Batch 2", variantLabel: "Batch 2", stock: 9 }]);
  assert.deepEqual(choices.slice(1).map((option) => option.itemId), ["b1", "b2"]);
  assert.equal(choices[1].displayName, "Rice - Batch 1");
  assert.equal(choices[2].displayName, "Rice - Batch 2");
  assert.ok(choices.every((option) => matchesPurchaseItem(option, "MASTER")));
  assert.ok(choices.every((option) => matchesPurchaseItem(option, "rice")));
  assert.equal(choices[2].stock, 9);
  assert.equal(choices[2].sharedStock, false);
});

test("single products keep their normal label and clearing removes previous batch metadata", () => {
  const [choice] = purchaseItemOptions([{ id: "rice", name: "Rice", barcode: "123", mrp: 0 }]);
  assert.equal(choice.key, "rice");
  assert.equal(choice.displayName, "Rice");
  assert.equal(purchaseBatchFields(choice).batchMrp, 0);
  assert.deepEqual(purchaseBatchFields(), { batchKey: "", batchLabel: "", batchBarcode: "", batchMrp: "" });
});

test("alternate EAN remains selectable when the primary EAN/MRP is empty", () => {
  const [choice] = purchaseItemOptions([{ id: "rice", name: "Rice", barcode: "", mrp: "",
    eanMrpOptions: [{ barcode: "alternate", mrp: 50 }] }]);
  assert.equal(choice.batchBarcode, "alternate");
  assert.equal(choice.batchMrp, 50);
  assert.ok(matchesPurchaseItem(choice, "alternate"));
});

test("same barcode with different MRPs yields distinct selectable batches", () => {
  const choices = purchaseItemOptions([{ id: "rice", name: "Rice", barcode: "123", mrp: 50,
    eanMrpOptions: [{ barcode: "123", mrp: 60 }] }]);
  assert.equal(choices.length, 2);
  assert.notEqual(choices[0].key, choices[1].key);
  assert.deepEqual(choices.map((choice) => choice.batchMrp), [50, 60]);
});
