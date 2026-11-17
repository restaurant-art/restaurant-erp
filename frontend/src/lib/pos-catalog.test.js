import test from "node:test";
import assert from "node:assert/strict";
import { buildProductSearchCatalog, filterPosCatalog } from "./pos-catalog.js";
import { consolidateProductUnitCart } from "./product-units.js";

const menu = [{ id: "meal", name: "Rice bowl", category: "Meals", price: 180, fav: true }];
const products = [{ id: "rice", name: "Basmati rice", category: "Groceries", sku: "RICE-01", plu: "4011", barcode: "890123", additionalBarcodes: ["890456"], price: 90 }];
const searchable = [...menu, ...products];

test("browsing and clearing a search show only created menu items", () => {
  assert.deepEqual(filterPosCatalog(menu, searchable), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "   "), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "", "Favourites"), menu);
  assert.deepEqual(filterPosCatalog(menu, searchable, "", "Groceries"), []);
  assert.deepEqual(filterPosCatalog([], products), []);
});

test("POS search finds an enabled menu item by PLU number", () => {
  const menu = [{ id: "menu-1", name: "Masala Tea", category: "Beverages", price: 40, status: "Active", pluEnabled: true, pluNumber: "0007" }];
  assert.equal(filterPosCatalog(menu, buildProductSearchCatalog(menu, []), "0007")[0]?.id, "menu-1");
});

test("product master items can be found by name, SKU, PLU and any barcode across menu categories", () => {
  for (const query of ["BASMATI", "rice-01", "4011", "890123", "890456"]) {
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

test("disabled Product Master entries cannot return through a legacy menu or any selling-unit barcode", () => {
  const legacy = [{ id: "legacy", name: " Chilli powder ", status: "Active", price: 45 }];
  const inventory = [{ id: "chilli", name: "Chilli powder", status: "Inactive", sellingPrice: 50,
    unit: "packet", barcode: "111", eanMrpOptions: [{ id: "old-label", barcode: "222", mrp: 55 }],
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, sellingPrice: 450 }],
  }, { id: "chilli-batch", parentProductId: "chilli", status: "Active", variantLabel: "Lot A", stock: 10 }];
  const catalog = buildProductSearchCatalog(legacy, inventory);
  assert.deepEqual(catalog, []);
  for (const query of ["chilli", "111", "222", "box"]) assert.deepEqual(filterPosCatalog([], catalog, query), []);
  const restored = buildProductSearchCatalog(legacy, inventory.map((item) => item.id === "chilli" ? { ...item, status: "Active" } : item));
  assert.equal(restored.some((item) => item.id === "legacy"), false);
  assert.equal(filterPosCatalog([], restored, "111").length > 0, true);
  assert.equal(filterPosCatalog([], restored, "Lot A").length > 0, true);
});

test("an inactive batch stays unavailable after its parent is enabled", () => {
  const catalog = buildProductSearchCatalog([], [
    { id: "parent", name: "Soap", status: "Active", sellingPrice: 20 },
    { id: "inactive-batch", parentProductId: "parent", name: "Soap old", status: "Inactive", variantLabel: "Old", stock: 5 },
    { id: "active-batch", parentProductId: "parent", status: "Active", variantLabel: "Current", stock: 5 },
  ]);
  assert.equal(catalog.some((item) => item.productMasterId === "inactive-batch"), false);
  assert.equal(catalog.some((item) => item.productMasterId === "active-batch"), true);
});

test("purchase-only assets never appear in POS, including matching legacy menu entries or batches", () => {
  const assetMenuItem = { id: "menu-printer", name: "Receipt Printer", category: "Equipment", price: 12000 };
  const inventory = [
    { id: "asset-printer", name: "Receipt Printer", purchasable: true, sellable: false, stock: 1 },
    { id: "asset-batch", parentProductId: "asset-printer", variantLabel: "Batch 1", stock: 1 },
    { id: "rice", name: "Rice", purchasable: true, sellable: true, sellingPrice: 90 },
  ];
  const catalog = buildProductSearchCatalog([assetMenuItem], inventory);
  assert.equal(catalog.some((item) => item.name.includes("Receipt Printer")), false);
  assert.equal(filterPosCatalog([assetMenuItem], catalog, "printer").length, 0);
  assert.equal(filterPosCatalog([], catalog, "rice")[0]?.id, "rice");
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

test("POS keeps a separate retail value for every EAN and MRP batch", () => {
  const catalog = buildProductSearchCatalog([], [{
    id: "maggi",
    name: "MAGGI",
    barcode: "111",
    mrp: 10,
    sellingPrice: 10,
    eanMrpOptions: [{ id: "second", barcode: "222", mrp: 15 }],
  }]);

  assert.deepEqual(catalog.map((item) => [item.batchLabel, item.batchBarcode, item.mrp, item.price]), [
    ["Batch 1", "111", 10, 10],
    ["Batch 2", "222", 15, 15],
  ]);
  assert.equal(filterPosCatalog([], catalog, "222")[0].price, 15);
  const [selectedBatch] = consolidateProductUnitCart([{ ...catalog[1], qty: 1 }], catalog);
  assert.equal(selectedBatch.batchLabel, "Batch 2");
  assert.equal(selectedBatch.price, 15);
});

test("product unit conversions are searchable as separate POS selling units", () => {
  const catalog = buildProductSearchCatalog([], [{
    id: "soap", name: "Soap", unit: "piece", stock: 25, sellingPrice: 15,
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, mrp: 175, sellingPrice: 140 }],
  }]);
  assert.equal(catalog.length, 2);
  assert.equal(catalog[0].unitConversion, 1);
  assert.equal(catalog[1].name, "Soap · Box");
  assert.equal(catalog[1].mrp, 175);
  assert.equal(catalog[1].price, 140);
  assert.equal(filterPosCatalog([], catalog, "box")[0].salesUnit, "Box");
});
