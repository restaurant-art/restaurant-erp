import test from "node:test";
import assert from "node:assert/strict";
import { inventoryPackTotals, retailPackAvailability } from "./pack-stock.js";
import { expandProductUnitCatalog, unitStockShortage } from "./product-units.js";
import { purchaseUnitOptions, resolvePurchaseQuantity } from "./purchase-units.js";
import { orderStockLines, createProductionTransport } from "./production-transport.js";
import { purchaseOrderToPurchaseDraft } from "./purchase-orders.js";
import { mergeShared } from "./shared-sync.js";

const product = { id: "chilli100", name: "Chilli 100g", unit: "packet", price: 25, mrp: 30,
  stock: 6.5, unopenedPacks: 6, looseStock: 50, packTracking: true,
  productionManaged: true, productionConsumption: true, productionBaseUnit: "g", productionUnitFactor: 100 };

test("Product Master totals distinguish whole packs from loose contents across batches", () => {
  const parent = { ...product, totalBaseStock: 650 };
  const batch = { ...parent, id: "batch", parentProductId: parent.id, unopenedPacks: 2, looseStock: 10, totalBaseStock: 210 };
  const otherSize = { ...parent, id: "chilli500", productionUnitFactor: 500, totalBaseStock: 5000 };
  assert.deepEqual(inventoryPackTotals(parent, [parent, batch, otherSize]), { unopened: 8, loose: 60, total: 860, unverified: false });
  assert.deepEqual(inventoryPackTotals(parent, [parent, { id: "old-batch", parentProductId: parent.id, stock: 2 }]),
    { unopened: 6, loose: 50, total: 650, unverified: true });
  assert.equal(inventoryPackTotals({ id: "rice", unit: "kg", stock: 10 }, []), null);
});

test("metadata sync never replays stale sealed or loose balances after consumption", () => {
  const base = [{ ...product, stock: 8, unopenedPacks: 8, looseStock: 0, totalBaseStock: 800 }];
  const local = [{ ...base[0], name: "Chilli powder 100g" }];
  const remote = [{ ...product, totalBaseStock: 650, stockLocations: [{ location: "Kitchen", unopened: 6, loose: 50, total: 650 }] }];
  assert.deepEqual(mergeShared(base, local, remote, "vestora-inventory-A"), [{ ...remote[0], name: local[0].name }]);
});

test("new product acknowledgement adopts the server's initial stock projection", () => {
  const local = [{ ...product, stock: 0, unopenedPacks: undefined, looseStock: undefined }];
  const remote = [{ ...local[0], unopenedPacks: 0, looseStock: 0, totalBaseStock: 0, stockLocations: [] }];
  assert.deepEqual(mergeShared([], local, remote, "vestora-inventory-A"), remote);
});

test("packed purchase snapshots net contents and derives 10 packets = 1000g", () => {
  const options = purchaseUnitOptions(product);
  assert.equal(options.length, 1);
  const line = { quantity: "10", unit: "packet", purchaseUnit: options[0].purchaseUnit };
  assert.equal(line.purchaseUnit.mode, "configured");
  assert.equal(resolvePurchaseQuantity(product, line).baseQuantity, 1000);
  assert.throws(() => resolvePurchaseQuantity(product, { ...line, quantity: "1.5" }), /whole number/);
  assert.throws(() => resolvePurchaseQuantity({ ...product, productionUnitFactor: 150 }, line), /size changed/);
});

test("purchase order conversion carries its pack size into the receipt draft", () => {
  const draft = purchaseOrderToPurchaseDraft({ id: "po", vendor: "vendor", lines: [{ itemId: product.id, unit: "packet", quantity: 10 }] }, [product], () => "line");
  assert.equal(draft.lines[0].purchaseUnit.mode, "configured");
  assert.equal(resolvePurchaseQuantity(product, draft.lines[0]).baseQuantity, 1000);
});

test("retail stock excludes loose contents and fractional selling units", () => {
  const catalog = expandProductUnitCatalog({ ...product, alternateUnits: [
    { id: "half", name: "half packet", conversion: 2, conversionMode: "base_contains_unit" },
    { id: "box", name: "box", conversion: 3 }] });
  assert.deepEqual(catalog.map((p) => p.unitConversion), [1, 3]);
  assert.equal(unitStockShortage([product], [{ ...catalog[0], qty: 7 }]).available, 6);
  assert.match(unitStockShortage([product], [{ ...catalog[0], qty: 0.5 }]).reason, /Whole/);
  assert.equal(unitStockShortage([product], [{ ...catalog[1], qty: 2 }]), null);
});

test("POS uses the master SKU and selected sales unit without changing price or GST", () => {
  const line = orderStockLines([{ ...product, id: "chilli100::unit::box", productMasterId: "chilli100", salesUnit: "box", qty: 2, price: 75, tax: 5 }], [], true)[0];
  assert.equal(line.product_id, "chilli100");
  assert.equal(line.sales_unit, "box");
  assert.equal(line.unit_price, "75");
  assert.equal(line.tax_rate, "5");
});

test("retail availability is location-specific, reserved-safe and size-specific", () => {
  const workspace = { enabled: true, items: [{ id: 1, legacy_key: product.id, pack_size: 100 }], stock: { balances: [
    { item: 1, location: 1, pack_size: 100, saleable_packs: 6 },
    { item: 1, location: 2, pack_size: 100, saleable_packs: 10 },
    { item: 1, location: 1, pack_size: 500, saleable_packs: 2 },
    { item: 1, location: 1, pack_size: null, saleable_packs: 0 },
  ] } };
  assert.equal(retailPackAvailability(product, workspace, "1"), 6);
  assert.equal(retailPackAvailability({ ...product, unitConversion: 3 }, workspace, 1), 2);
  assert.equal(retailPackAvailability(product, workspace, 3), 0);
});

test("an uncertain product save resumes the exact original payload and key", async () => {
  const saved = new Map(); const calls = [];
  const transport = createProductionTransport({ storage: { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) },
    newKey: () => "stable-key", send: async (...args) => { calls.push(args); if (calls.length === 1) throw new Error("Lost acknowledgement"); return { product }; } });
  await assert.rejects(transport.execute("A", "product", { product }, "product-master:chilli100"));
  const result = await transport.resume("A", "product-master:chilli100");
  assert.equal(result.product.id, product.id);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(saved.size, 0);
});
