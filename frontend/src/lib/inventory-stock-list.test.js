import test from "node:test";
import assert from "node:assert/strict";
import { inventoryStockRows, decorateInventoryStockRows, filterInventoryStockRows, inventoryCountPhysical } from "./inventory-stock-list.js";

const fixture = () => ({
  items: [
    { id: 1, name: "Rice", unit: "g", inventory_unit: "kg", inventory_factor: "1000", production_consumption: false, legacy_key: "rice" },
    { id: 2, name: "Oil", unit: "ml", inventory_unit: "litre", inventory_factor: "1000", production_consumption: false, legacy_key: "oil" },
    { id: 3, name: "Kitchen chilli", unit: "g", inventory_unit: "packet", inventory_factor: "100", pack_size: "100", production_consumption: true, legacy_key: "chilli" },
    { id: 4, name: "Cooked output", unit: "g", production_consumption: true, legacy_key: "" },
  ],
  inventory: [{ id: "rice", name: "Rice", sku: "R-01", barcode: "890100" }, { id: "oil", sku: "O-02", barcode: "890200" }, { id: "chilli", name: "Kitchen chilli", sku: "C-03" }],
  stock: { balances: [
    { balance: 10, lot: 101, item: 1, location: 5, on_hand: "2500", value: "200", reference: "rice-batch", loose_quantity: "2500" },
    { balance: 11, lot: 102, item: 1, location: 6, on_hand: "9000", value: "720", reference: "other-location" },
    { balance: 12, lot: 103, item: 3, location: 5, on_hand: "150", value: "5", reference: "kitchen", pack_size: "100", unopened_packs: 1, loose_quantity: "50" },
    { balance: 13, lot: 104, item: 4, location: 5, on_hand: "300", value: "5", reference: "cooked" },
  ] },
});

test("the item list includes all linked Product Master products and excludes standalone outputs", () => {
  const rows = inventoryStockRows(fixture(), "5");
  assert.deepEqual(rows.map((row) => row.name), ["Kitchen chilli", "Oil", "Rice"]);
  const oil = rows.find((row) => row.item === 2);
  const rice = rows.find((row) => row.item === 1);
  assert.equal(oil.balance, "new:2");
  assert.equal(oil.quantity, "0");
  assert.equal(rice.quantity, "2500");
  assert.equal(rice.count_unit, "kg");
  assert.equal(rice.count_factor, "1000");
  assert.equal(rice.sku, "R-01");
  assert.equal(rice.barcode, "890100");
  assert.deepEqual(inventoryStockRows(fixture(), ""), []);
});

test("disabled products remain listed with their stock and disabled status", () => {
  const data = fixture();
  data.inventory[0].status = "Inactive";
  const rows = inventoryStockRows(data, 5);
  const rice = rows.find((row) => row.product_id === "rice");
  assert.equal(rows.length, 3);
  assert.equal(rice.enabled, false);
  assert.equal(rice.parent_disabled, false);
  assert.equal(rice.quantity, "2500");
  assert.equal(rice.product_id, "rice");
  assert.equal(data.inventory[0].status, "Inactive");
});

test("parent status affects batch eligibility without overwriting each batch's own status", () => {
  const data = fixture();
  data.inventory[0].status = "Inactive";
  data.inventory.push(
    { id: "rice-current", name: "Rice Current", parentProductId: "rice", status: "Active", unit: "kg" },
    { id: "rice-old", name: "Rice Old", parentProductId: "rice", status: "Inactive", unit: "kg" },
  );
  data.items.push(
    { id: 5, name: "Rice Current", legacy_key: "rice-current", unit: "g", inventory_unit: "kg", inventory_factor: "1000" },
    { id: 6, name: "Rice Old", legacy_key: "rice-old", unit: "g", inventory_unit: "kg", inventory_factor: "1000" },
  );
  const before = inventoryStockRows(data, 5);
  const current = before.find((row) => row.product_id === "rice-current");
  const old = before.find((row) => row.product_id === "rice-old");
  assert.equal(current.enabled, true);
  assert.equal(current.parent_disabled, true);
  assert.equal(old.enabled, false);
  assert.equal(old.parent_disabled, true);
  data.inventory[0].status = "Active";
  const after = inventoryStockRows(data, 5);
  assert.equal(after.find((row) => row.product_id === "rice-current").parent_disabled, false);
  assert.equal(after.find((row) => row.product_id === "rice-current").enabled, true);
  assert.equal(after.find((row) => row.product_id === "rice-old").parent_disabled, false);
  assert.equal(after.find((row) => row.product_id === "rice-old").enabled, false);
  assert.deepEqual(data.inventory.slice(-2).map((product) => product.status), ["Active", "Inactive"]);
});

test("locations stay separate and unknown locations show normal products with zero stock", () => {
  assert.equal(inventoryStockRows(fixture(), 6).find((row) => row.item === 1).quantity, "9000");
  const absent = inventoryStockRows(fixture(), 7);
  assert.equal(absent.every((row) => row.new && row.quantity === "0"), true);
});

test("a negative ledger balance gets a separate physical stock row", () => {
  const data = fixture();
  data.stock.balances = [{ balance: 20, lot: 201, item: 1, location: 5, on_hand: "-1000", value: 0, reference: "__negative_stock__:5" }];
  const rice = inventoryStockRows(data, 5).filter((row) => row.item === 1);
  assert.equal(rice.length, 2);
  assert.equal(rice[0].debt, true);
  assert.equal(rice[0].pack_size, "");
  assert.equal(rice[0].count_basis, "debt");
  assert.equal(rice[0].count_unit, "g");
  assert.equal(rice[0].count_factor, "1");
  assert.equal(rice[1].balance, "new:1");
  assert.equal(rice[1].new, true);
});

test("decorating a saved count preserves its recorded units and quantities", () => {
  const expected = [{ balance: 10, lot: 101, item: 1, quantity: "1234.500000", count_unit: "g", count_factor: "1", pack_size: "500", count_basis: "sealed", read_only_reason: "Prior classification required." }];
  const decorated = decorateInventoryStockRows(expected, fixture());
  assert.equal(decorated[0].name, "Rice");
  assert.equal(decorated[0].reference, "rice-batch");
  for (const key of Object.keys(expected[0])) assert.equal(decorated[0][key], expected[0][key]);
  assert.equal(expected[0].name, undefined);
});

test("search matches names, SKU and barcode without removing entered hidden counts", () => {
  const rows = inventoryStockRows(fixture(), 5);
  assert.deepEqual(filterInventoryStockRows(rows, "R-01").map((row) => row.name), ["Rice"]);
  assert.deepEqual(filterInventoryStockRows(rows, "890200").map((row) => row.name), ["Oil"]);
  assert.deepEqual(filterInventoryStockRows(rows, "riCE R-01").map((row) => row.name), ["Rice"]);
  const quantities = { 10: "0", "new:2": "2.5" };
  assert.equal(filterInventoryStockRows(rows, "oil").length, 1);
  assert.deepEqual(inventoryCountPhysical(rows, quantities), [
    { balance: "new:2", quantity: "2.5" }, { balance: 10, quantity: "0" },
  ]);
});

test("only explicitly entered quantities are submitted, including numeric zero", () => {
  const rows = [{ balance: 1 }, { balance: 2 }, { balance: 3 }, { balance: 4 }, { balance: 5 }];
  assert.deepEqual(inventoryCountPhysical(rows, { 1: 0, 2: "   ", 3: null, 4: " 2.5 ", injected: "99" }), [
    { balance: 1, quantity: 0 }, { balance: 4, quantity: "2.5" },
  ]);
});

test("older workspace metadata falls back to standard units and saved custom measures", () => {
  const data = fixture();
  delete data.items[0].inventory_unit;
  delete data.items[0].inventory_factor;
  data.inventory[0].unit = "kg";
  data.items[1] = { ...data.items[1], inventory_unit: "bottle", inventory_factor: undefined, measures: { bottle: "750" } };
  const rows = inventoryStockRows(data, 5);
  assert.equal(rows.find((row) => row.item === 1).count_factor, "1000");
  assert.equal(rows.find((row) => row.item === 2).count_factor, "750");
});

test("known missing or unsafe custom conversions are marked for configuration instead of assumed", () => {
  const data = fixture();
  data.items[0].inventory_factor = null;
  data.items[1] = { ...data.items[1], inventory_unit: "drum", inventory_factor: undefined };
  for (const row of inventoryStockRows(data, 5).filter((entry) => entry.item !== 3)) {
    assert.equal(row.needs_conversion, true);
    assert.equal(row.count_factor, null);
  }
  const saved = decorateInventoryStockRows([{ balance: "new:1", item: 1, quantity: "2000",
    count_unit: "kg", count_factor: null, base_unit: "g", configuration_error: "Configure this product unit." }], data)[0];
  assert.equal(saved.needs_conversion, true);
  assert.equal(saved.count_unit, "kg");
  assert.equal(saved.count_factor, null);
  assert.equal(saved.base_unit, "g");
});

test("verified packets show unopened packs separately from loose contents", () => {
  const row = inventoryStockRows(fixture(), 5).find((entry) => entry.item === 3);
  assert.equal(row.count_basis, "sealed");
  assert.equal(row.quantity, "150");
  assert.equal(row.sealed_packages, 1);
  assert.equal(row.loose_quantity, "50");
  assert.equal(row.count_unit, "packet");
  assert.equal(row.count_factor, "100");
});

test("unverified historical packet weight is read only and displayed in base units", () => {
  const data = fixture();
  data.stock.balances.find((row) => row.item === 3).pack_size = null;
  const row = inventoryStockRows(data, 5).find((entry) => entry.item === 3);
  assert.equal(row.count_basis, "unverified");
  assert.equal(row.count_unit, "g");
  assert.equal(row.count_factor, "1");
  assert.match(row.read_only_reason, /Production/);
});

test("unlinked Product Master records remain visible but cannot enter a count payload", () => {
  const data = fixture();
  data.inventory.push({ id: "soap", name: "Soap", sku: "S-04", unit: "piece", stock: "3" });
  const rows = inventoryStockRows(data, 5);
  const soap = rows.find((row) => row.product_id === "soap");
  assert.equal(soap.needs_link, true);
  assert.equal(soap.quantity, "3");
  assert.equal(soap.count_unit, "piece");
  assert.match(soap.read_only_reason, /Product Master/);
  assert.deepEqual(inventoryCountPhysical(rows, { [soap.balance]: "99" }), []);
});

test("orphaned legacy links outside the current Product Master are excluded", () => {
  const data = fixture();
  data.items.push({ id: 9, name: "Retired item", unit: "piece", inventory_unit: "piece", inventory_factor: "1", legacy_key: "retired" });
  data.stock.balances.push({ balance: 90, item: 9, lot: 901, location: 5, on_hand: "7", reference: "retired" });
  assert.equal(inventoryStockRows(data, 5).some((row) => row.item === 9), false);
});
