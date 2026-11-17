import test from "node:test";
import assert from "node:assert/strict";
import { normalizePurchaseUnits, purchaseUnitOptions, purchaseUnitKey, resolvePurchaseQuantity, deliveryPurchaseUnit, withProductionMeasure, purchaseQuantityLabel } from "./purchase-units.js";
import { applyPurchaseToInventory, reversePurchaseInventory } from "./purchase-inventory.js";
import { buildFinanceReport } from "./finance-reports.js";
import { applyPurchaseOrderReceipt, purchaseOrderToPurchaseDraft } from "./purchase-orders.js";
import { savePurchaseDraftRecord } from "./purchase-drafts.js";

const sizes = [{ id: "50", name: "50 g pack", quantity: 50, unit: "g" }, { id: "100", name: "100 g pack", quantity: 100, unit: "g" }, { id: "1", name: "1 kg bag", quantity: 1, unit: "kg" }, { id: "5", name: "5 kg bag", quantity: 5, unit: "kg" }];
const product = { id: "chilli", name: "Chilli powder", unit: "kg", stock: 0, cost: 0, price: 0, purchaseUnits: sizes };
const line = (size, count, rate) => ({ itemId: product.id, quantity: count, unit: size.name, purchaseUnit: size, unitCost: rate, taxRate: 0 });

test("Product Master units automatically supply recipe quantities without delivery input", () => {
  for (const [unit, base, factor] of [["kg", "g", 1000], ["ltr", "ml", 1000], ["pack", "g", 150], ["box", "piece", 12]]) {
    const master = { ...product, unit, productionBaseUnit: base, productionUnitFactor: factor, purchaseUnits: [] };
    const receipt = { itemId: master.id, unit, quantity: 10, unitCost: 30 };
    assert.deepEqual(resolvePurchaseQuantity(master, receipt), { stockQuantity: 10, stockUnit: unit, stockFactor: 1, baseQuantity: 10 * factor, baseUnit: base });
    const choices = purchaseUnitOptions(master);
    assert.equal(choices[0].key, "stock");
    assert.equal(choices[0].purchaseUnit, null);
    assert.equal(choices.some((choice) => choice.key === "delivery"), true);
    const result = applyPurchaseToInventory([master], [receipt]);
    assert.equal(result.inventory[0].stock, 10);
    assert.equal(result.invoiceTotals.total, 300);
  }
});

test("a kg stock product can save a pack measured in g or kg", () => {
  const grams = { ...product, purchaseUnits: normalizePurchaseUnits([{ id: "product-pack", name: "pack", quantity: 500, unit: "g" }], product) };
  const gramPack = purchaseUnitOptions(grams).find((choice) => choice.key === "size:product-pack");
  assert.equal(gramPack.name, "pack · 500 g");
  assert.deepEqual(resolvePurchaseQuantity(grams, { unit: "pack", quantity: 4, purchaseUnit: gramPack.purchaseUnit }), {
    stockQuantity: 2, stockUnit: "kg", stockFactor: 0.5, baseQuantity: 2000, baseUnit: "g",
  });
  const kilograms = { ...product, purchaseUnits: normalizePurchaseUnits([{ id: "product-pack", name: "pack", quantity: 2, unit: "kg" }], product) };
  const kilogramPack = purchaseUnitOptions(kilograms).find((choice) => choice.key === "size:product-pack");
  assert.equal(resolvePurchaseQuantity(kilograms, { unit: "pack", quantity: 3, purchaseUnit: kilogramPack.purchaseUnit }).stockQuantity, 6);
});

test("different saved pack sizes keep their own quantities and costs", () => {
  const master = { ...product, unit: "pack", productionBaseUnit: "g", productionUnitFactor: 100, purchaseUnits: [{ id: "150", name: "150 g pack", quantity: 150, unit: "g" }] };
  const first = { itemId: master.id, unit: "pack", quantity: 10, unitCost: 20 };
  const second = line(purchaseUnitOptions(master).find((choice) => choice.key === "size:150").purchaseUnit, 10, 30);
  assert.equal(resolvePurchaseQuantity(master, first).baseQuantity, 1000);
  assert.equal(resolvePurchaseQuantity(master, second).baseQuantity, 1500);
  const result = applyPurchaseToInventory([master], [first, second]);
  assert.equal(result.inventory[0].stock, 25);
  assert.equal(result.inventory[0].cost, 20);
  assert.equal(result.invoiceTotals.total, 500);
  assert.equal(master.productionUnitFactor, 100);
});

test("variable pack contents are entered per purchase without a guessed product conversion", () => {
  const master = { ...product, unit: "pack", productionBaseUnit: "g", productionUnitFactor: "", purchaseUnits: [] };
  const delivery = purchaseUnitOptions(master).find((choice) => choice.key === "delivery");
  assert.equal(delivery.purchaseUnit.name, "pack");
  assert.equal(delivery.purchaseUnit.quantity, "");
  assert.equal(purchaseUnitOptions(master).some((choice) => choice.key === "stock"), false);
  assert.throws(() => resolvePurchaseQuantity(master, { itemId: master.id, unit: "pack", quantity: 10 }), /actual contents/);

  const first = { itemId: master.id, unit: "pack", quantity: 10, purchaseUnit: { ...delivery.purchaseUnit, quantity: 100 } };
  const second = { itemId: master.id, unit: "pack", quantity: 10, purchaseUnit: { ...delivery.purchaseUnit, quantity: 120 } };
  assert.equal(resolvePurchaseQuantity(master, first).baseQuantity, 1000);
  assert.equal(resolvePurchaseQuantity(master, second).baseQuantity, 1200);
  assert.equal(resolvePurchaseQuantity(master, second).stockQuantity, 10);
  assert.equal(master.productionUnitFactor, "");
});

test("purchase order import retains configured box count and price", () => {
  const master = { ...product, unit: "box", productionBaseUnit: "g", productionUnitFactor: 5000 };
  const order = { id: "po", vendor: "Supplier", lines: [{ itemId: master.id, unit: "box", quantity: 5, receivedQuantity: 2, unitCost: 1000 }] };
  const draft = purchaseOrderToPurchaseDraft(order, [master], () => "line");
  assert.equal(draft.lines[0].quantity, "3");
  assert.equal(draft.lines[0].unitCost, "1000.00");
  assert.deepEqual(draft.lines[0].purchaseUnit, { mode: "delivery", name: "box", quantity: 5000, unit: "g" });
  assert.equal(resolvePurchaseQuantity(master, draft.lines[0]).baseQuantity, 15000);
});

test("mixed chilli powder sizes and loose kg share stock and preserve invoice value", () => {
  const result = applyPurchaseToInventory([product], [line(sizes[0], 20, 10), line(sizes[1], 10, 20), line(sizes[2], 2, 200), line(sizes[3], 1, 1000), { itemId: product.id, unit: "kg", quantity: 1.5, unitCost: 200 }]);
  assert.equal(result.inventory[0].stock, 10.5);
  assert.equal(result.inventory[0].cost, 200);
  assert.equal(result.invoiceTotals.total, 2100);
  assert.equal(result.receivedLines[0].quantity, 20);
  assert.equal(result.receivedLines[0].stockQuantity, 1);
  assert.equal(result.receivedLines[0].unit, "50 g pack");
  assert.equal(result.inventory[0].lastPurchaseCost, 200);
  assert.equal(reversePurchaseInventory(result.inventory, result.receivedLines)[0].stock, 0);
});
test("discounted packages value stock per kg and retain cost conservation", () => {
  const result = applyPurchaseToInventory([product], [{ ...line(sizes[1], 10, 20), taxRate: 5 }], { invoiceAdjustments: { billDiscountBasis: "after_gst", billDiscountSplit: true, billDiscountType: "amount", billDiscountValue: "10" } });
  assert.equal(result.invoiceTotals.total, 200);
  assert.equal(result.inventory[0].stock, 1);
  assert.equal(result.inventory[0].cost, 200);
});
test("loose grams work for kg stock; old package stock can use measured sizes", () => {
  const gram = purchaseUnitOptions(product).find((entry) => entry.key === "loose:g");
  assert.equal(resolvePurchaseQuantity(product, { quantity: 1500, unit: "g", purchaseUnit: gram.purchaseUnit }).stockQuantity, 1.5);
  assert.equal(resolvePurchaseQuantity({ ...product, unit: "pack", productionBaseUnit: "g", productionUnitFactor: 100 }, line(sizes[3], 1, 1000)).stockQuantity, 50);
  assert.equal(purchaseUnitKey(product, { purchaseUnit: { unit: "g", quantity: "100", name: "100 g pack", id: "100" } }), "size:100");
});
test("size validation rejects incompatible, duplicate, stale and fractional count definitions", () => {
  assert.throws(() => normalizePurchaseUnits([{ ...sizes[0], unit: "ml" }], product), /compatible/);
  assert.throws(() => normalizePurchaseUnits([sizes[0], sizes[0]], product), /unique/);
  assert.throws(() => normalizePurchaseUnits([{ ...sizes[0], quantity: 0 }], product), /positive/);
  assert.throws(() => normalizePurchaseUnits([{ id: "x", name: "Small box", quantity: 1.5, unit: "piece" }], { unit: "piece" }), /whole pieces/);
  assert.throws(() => resolvePurchaseQuantity(product, line({ ...sizes[0], quantity: 500 }, 1, 10)), /changed or is missing/);
  assert.throws(() => resolvePurchaseQuantity(product, { quantity: 1, unit: "litre", purchaseUnit: { name: "litre", quantity: 1, unit: "litre" } }), /changed or is missing/);
});

test("stock and rate reports compare mixed packs in the stock unit", () => {
  const purchaseTransactions = [
    { type: "Purchase", itemId: "chilli", item: "Chilli powder", quantity: 10, unit: "100 g pack", unitCost: 20, stockQuantity: 1, stockUnit: "kg", stockNetUnitCost: 200, total: 200 },
    { type: "Purchase", itemId: "chilli", item: "Chilli powder", quantity: 1, unit: "5 kg bag", unitCost: 1000, stockQuantity: 5, stockUnit: "kg", stockNetUnitCost: 200, total: 1000 },
  ];
  const report = buildFinanceReport("Purchase Rate Analysis", { purchaseTransactions });
  assert.deepEqual(report.records[0].rawValues, ["Chilli powder", 6, 200, 200, 200, 200, "", "kg"]);
  assert.deepEqual(buildFinanceReport("Stock Ledger", { purchaseTransactions }).records.map((row) => row.rawValues[4]), [1, 5]);
});

test("actual pack weights belong to each delivery, not the product or previous invoice", () => {
  const originalProduct = structuredClone(product);
  const incoming = [100, 120, 150].map((weight) => line({ ...deliveryPurchaseUnit(product), quantity: weight }, 10, weight / 5));
  const firstDraft = savePurchaseDraftRecord([], { invoice: "TODAY", lines: [incoming[0]] }, "one");
  incoming[0].purchaseUnit.quantity = 200;
  assert.equal(firstDraft[0].entry.lines[0].purchaseUnit.quantity, 100);
  const result = applyPurchaseToInventory([product], [firstDraft[0].entry.lines[0], ...incoming.slice(1)]);
  assert.equal(result.inventory[0].stock, 3.7);
  assert.equal(result.inventory[0].cost, 200);
  assert.equal(result.invoiceTotals.total, 740);
  assert.deepEqual(result.receivedLines.map((receipt) => receipt.purchaseUnit.quantity), [100, 120, 150]);
  assert.deepEqual(product, originalProduct);
  assert.equal(deliveryPurchaseUnit(product).quantity, "");
  assert.equal(purchaseQuantityLabel(incoming[1]), "10 pack × 120 g");
  assert.throws(() => resolvePurchaseQuantity(product, line(deliveryPurchaseUnit(product), 10, 25)), /actual net quantity/);
  assert.throws(() => resolvePurchaseQuantity(product, line({ ...deliveryPurchaseUnit(product), quantity: 120, unit: "ml" }, 10, 25)), /compatible/);
});

test("legacy pack mapping is hydrated and an actual delivery overrides only that receipt", () => {
  const oldProduct = { ...product, unit: "pack", purchaseUnits: [] };
  const hydrated = withProductionMeasure(oldProduct, { items: [{ legacy_key: product.id, unit: "g", measures: { pack: "100" } }] });
  const receipt = line({ ...deliveryPurchaseUnit(hydrated), quantity: 150 }, 10, 30);
  assert.equal(resolvePurchaseQuantity(hydrated, receipt).baseQuantity, 1500);
  assert.equal(hydrated.productionUnitFactor, "100");
  assert.equal(oldProduct.productionUnitFactor, undefined);
  const noFixedSize = withProductionMeasure({ ...oldProduct, productionUnitFactor: 100 }, { items: [{ legacy_key: product.id, unit: "g", measures: {} }] });
  assert.equal(noFixedSize.productionUnitFactor, "");
});

test("purchase orders receive pack counts or converted weight according to their ordered unit", () => {
  const receipt = line({ ...deliveryPurchaseUnit(product), quantity: 150 }, 10, 30);
  for (const [unit, expected] of [["kg", 1.5], ["pack", 10], ["box", 10]]) {
    const orders = [{ id: "PO", lines: [{ itemId: product.id, unit, quantity: 20 }] }];
    const updated = applyPurchaseOrderReceipt(orders, "PO", [{ ...receipt, purchaseOrderLineIndex: 0 }]);
    assert.equal(updated[0].lines[0].receivedQuantity, expected);
  }
});
