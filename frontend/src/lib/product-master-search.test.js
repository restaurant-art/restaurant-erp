import assert from "node:assert/strict";
import test from "node:test";
import { hasProductMasterSearchQuery, searchProductMaster } from "./product-master-search.js";

const products = [
  { id: "2", name: "Whole Milk", sku: "010", barcode: "8901002", hsnCode: "0401", category: "Dairy" },
  { id: "1", name: "Basmati Rice", sku: "006", plu: "4006", barcode: "8901001", category: "Dry goods", eanMrpOptions: [{ barcode: "8901999", mrp: 220 }] },
  { id: "3", name: "Rice - Batch 001", sku: "007", parentProductId: "1" },
];

test("suggestions stay closed until a real product search is typed", () => {
  assert.equal(hasProductMasterSearchQuery(""), false);
  assert.equal(hasProductMasterSearchQuery("   "), false);
  assert.equal(hasProductMasterSearchQuery("atta"), true);
});

test("lists every master product alphabetically when the query is empty", () => {
  assert.deepEqual(searchProductMaster(products).map((product) => product.name), ["Basmati Rice", "Whole Milk"]);
});

test("searches product name, SKU, PLU, primary EAN, alternate EAN, and HSN", () => {
  assert.equal(searchProductMaster(products, "basmati")[0]?.id, "1");
  assert.equal(searchProductMaster(products, "006")[0]?.id, "1");
  assert.equal(searchProductMaster(products, "4006")[0]?.id, "1");
  assert.equal(searchProductMaster(products, "8901002")[0]?.id, "2");
  assert.equal(searchProductMaster(products, "8901999")[0]?.id, "1");
  assert.equal(searchProductMaster(products, "0401")[0]?.id, "2");
  assert.equal(searchProductMaster(products, "dry goods").length, 0);
});

test("excludes product batches and duplicate master identities", () => {
  const duplicate = { ...products[0] };
  assert.deepEqual(searchProductMaster([...products, duplicate], "milk").map((product) => product.id), ["2"]);
  assert.equal(searchProductMaster(products, "batch").length, 0);
});
