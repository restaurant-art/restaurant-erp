import test from "node:test";
import assert from "node:assert/strict";
import { buildInventoryProductList, filterInventoryProductList } from "./inventory-product-list.js";

function fixture() {
  return {
    inventory: [
      { id: "rice", name: "Basmathi rice", sku: "001", plu: "001", barcode: "8901", hsnCode: "123234", gstRate: 18,
        unit: "kg", stock: 999, price: 66.355, cost: 78.299, sellingPrice: 92, mrp: 99, reorder: 10,
        category: "Rice items", subcategory: "Rice", brand: "Basmathi", manufacturer: "Basmathi manufacture", wholesalePrice: 89,
        ecommercePrice: 93, cardPrice: 91, eanMrpOptions: [{ barcode: "8902", mrp: 100 }] },
      { id: "rice-batch", parentProductId: "rice", name: "Rice batch", sku: "002", unit: "kg", stock: 888 },
      { id: "masala", name: "Chicken masala", sku: "003", unit: "pack", stock: 999, price: 24.75, cost: 29.205, sellingPrice: 32.67,
        mrp: 35, reorder: 0, packTracking: true, productionBaseUnit: "g", productionUnitFactor: 250 },
    ],
    items: [
      { id: 1, legacy_key: "rice", name: "Basmathi rice", unit: "g", inventory_unit: "kg", inventory_factor: "1000", production_consumption: true },
      { id: 2, legacy_key: "rice-batch", name: "Rice batch", unit: "g", inventory_unit: "kg", inventory_factor: "1000", production_consumption: true },
      { id: 3, legacy_key: "masala", name: "Chicken masala", unit: "g", inventory_unit: "pack", inventory_factor: "250", pack_size: "250", production_consumption: true },
      { id: 4, legacy_key: "", name: "Cooked biriyani", unit: "g", production_consumption: true },
    ],
    stock: { balances: [
      { balance: 11, lot: 101, item: 1, location: 5, on_hand: "3000", loose_quantity: "3000", reference: "rice-a" },
      { balance: 12, lot: 102, item: 1, location: 5, on_hand: "7000", loose_quantity: "7000", reference: "rice-b" },
      { balance: 13, lot: 103, item: 2, location: 5, on_hand: "2000", loose_quantity: "2000", reference: "rice-child" },
      { balance: 14, lot: 104, item: 1, location: 6, on_hand: "9000", loose_quantity: "9000", reference: "kitchen-rice" },
      { balance: 15, lot: 105, item: 3, location: 5, on_hand: "1550", unopened_packs: 6, loose_quantity: "50", pack_size: "250", reference: "masala" },
    ] },
  };
}

test("one parent product row aggregates its lots and child stock without adding compatibility projections", () => {
  const data = fixture();
  const before = structuredClone(data);
  const rows = buildInventoryProductList(data, "5");
  assert.equal(rows.length, 2);
  const rice = rows.find((row) => row.id === "rice");
  assert.equal(rice.stock_quantity, 12);
  assert.equal(rice.net_stock_quantity, 12);
  assert.equal(rice.total_base_quantity, 12000);
  assert.equal(rice.stock_base_unit, "g");
  assert.deepEqual(rice.family_product_ids, ["rice", "rice-batch"]);
  assert.equal(rice.batch_count, 3); // two EAN/MRP combinations and one stock batch
  assert.equal(rice.stock_editable, true);
  assert.equal(rice.stock_status, "Watch");
  assert.deepEqual(data, before);
});

test("the selected location determines displayed stock, including zero at an empty location", () => {
  assert.equal(buildInventoryProductList(fixture(), 6).find((row) => row.id === "rice").stock_quantity, 9);
  assert.equal(buildInventoryProductList(fixture(), 7).find((row) => row.id === "rice").stock_quantity, 0);
});

test("packed products keep unopened packs, loose contents and negative debt separate", () => {
  const data = fixture();
  let masala = buildInventoryProductList(data, 5).find((row) => row.id === "masala");
  assert.equal(masala.pack_tracking, true);
  assert.equal(masala.stock_quantity, 6);
  assert.equal(masala.unopened_packs, 6);
  assert.equal(masala.loose_quantity, 50);
  assert.equal(masala.total_base_quantity, 1550);
  assert.equal(masala.stock_status, "Healthy");
  data.stock.balances.push({ balance: 16, lot: 106, item: 3, location: 5, on_hand: "-9000", loose_quantity: "0", reference: "__negative_stock__:5" });
  masala = buildInventoryProductList(data, 5).find((row) => row.id === "masala");
  assert.equal(masala.unopened_packs, 6);
  assert.equal(masala.loose_quantity, 50);
  assert.equal(masala.total_base_quantity, -7450);
  assert.equal(masala.stock_status, "Low stock");
  assert.deepEqual(filterInventoryProductList([masala], "", "Negative stock").map((row) => row.id), ["masala"]);
});

test("unlinked compatibility stock is counted once per family member and remains read-only", () => {
  const data = { inventory: [
    { id: "milk", name: "Milk", unit: "litre", stock: 3 },
    { id: "milk-b", parentProductId: "milk", name: "Milk batch", unit: "litre", stock: 2 },
  ], items: [], stock: { balances: [] } };
  const [milk] = buildInventoryProductList(data, 5);
  assert.equal(milk.stock_quantity, 5);
  assert.equal(milk.total_base_quantity, 5000);
  assert.equal(milk.stock_base_unit, "ml");
  assert.equal(milk.stock_editable, false);
  assert.equal(milk.unverified, true);
});

test("a historical receipt with another pack size is not labelled as current SKU packs", () => {
  const data = fixture();
  Object.assign(data.stock.balances.find((row) => row.item === 3), {
    on_hand: "250", unopened_packs: 2, loose_quantity: "50", pack_size: "100",
  });
  const masala = buildInventoryProductList(data, 5).find((row) => row.id === "masala");
  assert.equal(masala.unopened_packs, 0);
  assert.equal(masala.total_base_quantity, 250);
  assert.equal(masala.loose_quantity, 50);
  assert.equal(masala.unverified, true);
});

test("prices retain explicit zero values and optional blanks while margin uses saved cost", () => {
  const data = fixture();
  Object.assign(data.inventory[0], { price: 0, cost: 0, mrp: 0, sellingPrice: 0, wholesalePrice: 0, ecommercePrice: "", cardPrice: null, reorder: 0 });
  Object.assign(data.inventory[1], { price: 100, cost: 120, mrp: 200, sellingPrice: 180, reorder: 5 });
  const rice = buildInventoryProductList(data, 5).find((row) => row.id === "rice");
  for (const field of ["price", "cost", "mrp", "sellingPrice", "wholesalePrice", "reorder"]) assert.equal(rice[field], 0, field);
  assert.equal(rice.ecommercePrice, "");
  assert.equal(rice.cardPrice, "");
  assert.equal(rice.margin_amount, 0);
  assert.equal(rice.margin_percent, null);
  assert.equal(rice.markup_percent, null);
  const masala = buildInventoryProductList(data, 5).find((row) => row.id === "masala");
  assert.ok(Math.abs(masala.margin_amount - 3.465) < 0.000001);
  assert.ok(masala.margin_percent > 10);
});

test("missing master fields can read older batch values without replacing other metadata", () => {
  const data = fixture();
  Object.assign(data.inventory[0], { price: "", cost: null, sellingPrice: undefined, barcode: "" });
  Object.assign(data.inventory[1], { price: 40, cost: 47.2, sellingPrice: 60, barcode: "legacy-ean" });
  const rice = buildInventoryProductList(data, 5).find((row) => row.id === "rice");
  assert.equal(rice.price, 40);
  assert.equal(rice.cost, 47.2);
  assert.equal(rice.sellingPrice, 60);
  assert.equal(rice.barcode, "legacy-ean");
  assert.equal(rice.category, "Rice items");
  assert.equal(rice.hsnCode, "123234");
});

test("disabled items remain visible and search finds product codes, classifications and alternate EANs", () => {
  const data = fixture();
  data.inventory[0].status = "Inactive";
  const rows = buildInventoryProductList(data, 5);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].enabled, false);
  assert.deepEqual(filterInventoryProductList(rows, "", "All", "Disabled").map((row) => row.id), ["rice"]);
  for (const query of ["001", "8902", "123234", "rice basmathi", "manufacture"]) {
    assert.equal(filterInventoryProductList(rows, query).some((row) => row.id === "rice"), true, query);
  }
  assert.equal(filterInventoryProductList(rows, "", "Watch", "Enabled").length, 0);
});

test("standalone prepared outputs do not become Product Master table rows", () => {
  const data = fixture();
  assert.equal(buildInventoryProductList(data, 5).some((row) => row.name === "Cooked biriyani"), false);
});
