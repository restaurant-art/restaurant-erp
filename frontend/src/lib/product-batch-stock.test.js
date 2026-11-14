import test from "node:test";
import assert from "node:assert/strict";
import { productBatchStockFields } from "./product-batch-stock.js";
import { buildProductSearchCatalog } from "./pos-catalog.js";
import { orderStockLines } from "./production-transport.js";

const parent = { id: "chilli100", name: "Chilli 100g", unit: "packet", productionConsumption: true,
  productionBaseUnit: "g", productionUnitFactor: "100", productionContentUnit: "g",
  stock: 10, unopenedPacks: 10, looseStock: 0, totalBaseStock: 1000, productionManaged: true };

test("new batch inherits pack configuration but none of its parent's balances or ledger identity", () => {
  const fields = productBatchStockFields(parent);
  assert.equal(fields.productionConsumption, true);
  assert.equal(fields.productionUnitFactor, "100");
  assert.equal(fields.productionBaseUnit, "g");
  for (const key of ["id", "stock", "unopenedPacks", "looseStock", "totalBaseStock", "productionManaged"]) assert.equal(key in fields, false);
});

test("editing an existing batch preserves its explicit measurement and optional consumption choice", () => {
  const fields = productBatchStockFields(parent, { productionConsumption: false, productionUnitFactor: "120", productionBaseUnit: "g", unit: "box" });
  assert.equal(fields.productionConsumption, false);
  assert.equal(fields.productionUnitFactor, "120");
  assert.equal(fields.unit, "box");
  assert.equal(productBatchStockFields({ unit: "bottle" }).productionConsumption, false);
});

test("a child batch sale references its own master SKU and cannot consume its parent's stock", () => {
  const child = { ...productBatchStockFields(parent), id: "chilli-batch1", parentProductId: parent.id,
    variantLabel: "Batch 001", sku: "002", stock: 0 };
  const item = buildProductSearchCatalog([], [parent, child]).find((row) => row.stockBatch);
  const line = orderStockLines([{ ...item, qty: 1 }], [], true)[0];
  assert.equal(line.product_id, child.id);
  assert.notEqual(line.product_id, parent.id);
});

test("a legacy parent inherits its missing contents configuration from the Production link", () => {
  const legacy = { id: "old-chilli", unit: "packet", productionUnitFactor: "", productionBaseUnit: "" };
  const linked = { unit: "g", production_consumption: true, pack_size: "100", measures: { packet: "100" } };
  const fields = productBatchStockFields(legacy, {}, linked);
  assert.equal(fields.productionConsumption, true);
  assert.equal(fields.productionBaseUnit, "g");
  assert.equal(fields.productionUnitFactor, "100");
  assert.equal(fields.productionContentUnit, "g");
  const explicit = productBatchStockFields({ ...legacy, productionConsumption: false, productionUnitFactor: "120" }, {}, linked);
  assert.equal(explicit.productionConsumption, false);
  assert.equal(explicit.productionUnitFactor, "120");
  const standard = productBatchStockFields({ unit: "kg" }, {}, { unit: "g", production_consumption: true, measures: {} });
  assert.equal(standard.productionUnitFactor, 1000);
});
