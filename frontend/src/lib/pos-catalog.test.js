import test from "node:test";
import assert from "node:assert/strict";
import { buildProductSearchCatalog, filterPosCatalog } from "./pos-catalog.js";

const menu = [{ id: "meal", name: "Rice bowl", category: "Meals", price: 180, fav: true }];
const products = [{ id: "rice", name: "Basmati rice", category: "Groceries", sku: "RICE-01", barcode: "890123", additionalBarcodes: ["890456"], price: 90 }];
const searchable = [...menu, ...products];

test("browsing and clearing a search show only created menu items", () => {
  assert.deepEqual(filterPosCatalog(menu, searchable), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "   "), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "", "Favourites"), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "", "Groceries"), []);
  assert.deepEqual(filterPosCatalog([], products), []);
});

test("product master items can be found by name, SKU and any barcode across menu categories", () => {
  for (const query of ["BASMATI", "rice-01", "890123", "890456"]) {
    assert.deepEqual(filterPosCatalog(menu, searchable, query, "Meals"), products);
  }
  assert.deepEqual(filterPosCatalog(menu, searchable, "bowl"), menu);
  assert.deepEqual(filterPosCatalog([], products, "rice"), products);
  assert.deepEqual(filterPosCatalog(menu, searchable, "unmatched"), []);
});

test("inactive items stay hidden in browsing and search", () => {
  const inactive = { ...menu[0], status: "Inactive" };
  assert.deepEqual(filterPosCatalog([inactive], [inactive]), []);
  assert.deepEqual(filterPosCatalog([inactive], [inactive], "rice"), []);
});

test("table product search uses selling price, GST and alternate EANs, not purchase cost", () => {
  const inventory = [{ id: "rice", name: "Rice bag", sku: "RICE-01", price: 80, cost: 84, sellingPrice: 120, gstRate: 5, eanMrpOptions: [{ barcode: "890456" }] },
    { id: "batch", parentProductId: "rice", name: "Rice batch" }, { id: "inactive", name: "Hidden", status: "Inactive" }];
  const catalog = buildProductSearchCatalog(menu, inventory);
  const [product] = filterPosCatalog(menu, catalog, "890456", "Meals");
  assert.equal(product.id, "rice");
  assert.equal(product.price, 120);
  assert.equal(product.tax, 5);
  assert.equal(product.productMasterItem, true);
  assert.deepEqual(filterPosCatalog(menu, catalog), menu);
  assert.equal(catalog.length, 2);
  assert.equal(filterPosCatalog([], buildProductSearchCatalog([], inventory), "rice").length, 1);
});

test("matching menu and product names appear once with master pricing and menu presentation", () => {
  const catalog = buildProductSearchCatalog([{ ...menu[0], image: "meal.png", tax: 18 }], [{ id: "master", name: " Rice bowl ", sellingPrice: 150, gstRate: 0 }]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, "master");
  assert.equal(catalog[0].price, 150);
  assert.equal(catalog[0].tax, 0);
  assert.equal(catalog[0].image, "meal.png");
  assert.equal(catalog[0].category, "Meals");
});
