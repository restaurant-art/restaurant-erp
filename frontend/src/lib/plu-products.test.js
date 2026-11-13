import assert from "node:assert/strict";
import test from "node:test";
import { addProductToPlu, listPluProducts, nextProductPlu } from "./plu-products.js";

const products = [
  { id: "p2", name: "Rice", sku: "002", pluEnabled: true, plu: "12", category: "Dry goods" },
  { id: "p1", name: "Apple", sku: "001", pluEnabled: true, plu: "2", category: "Produce", weightMachineEnabled: true },
  { id: "p3", name: "Tea", sku: "003", pluEnabled: false, plu: "", category: "Beverages" },
  { id: "batch", parentProductId: "p1", name: "Apple - batch", pluEnabled: true, plu: "2" },
];

test("PLU product list contains enabled parent products without batch duplicates", () => {
  assert.deepEqual(listPluProducts(products).map((item) => item.id), ["p1", "p2"]);
});

test("PLU product list searches product identity and classification fields", () => {
  assert.deepEqual(listPluProducts(products, "produce").map((item) => item.name), ["Apple"]);
  assert.deepEqual(listPluProducts(products, "12").map((item) => item.name), ["Rice"]);
});

test("adding a product to PLU prefers its numeric SKU and updates its batches", () => {
  const timestamp = "2026-10-22T10:00:00.000Z";
  const updated = addProductToPlu(products, "p3", timestamp);
  const product = updated.find((item) => item.id === "p3");
  assert.equal(product.pluEnabled, true);
  assert.equal(product.plu, "003");
  assert.equal(product.updatedAt, timestamp);
});

test("a duplicate or nonnumeric SKU receives the next free three-digit PLU", () => {
  const duplicateSkuItems = [
    { id: "one", sku: "001", pluEnabled: true, plu: "001" },
    { id: "two", sku: "001", pluEnabled: false, plu: "" },
    { id: "three", sku: "RICE", pluEnabled: false, plu: "" },
  ];
  assert.equal(nextProductPlu(duplicateSkuItems, "two"), "002");
  assert.equal(nextProductPlu(duplicateSkuItems, "three"), "002");
});
