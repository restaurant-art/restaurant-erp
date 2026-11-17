import test from "node:test";
import assert from "node:assert/strict";
import { applyUnitStockSale, buildUnitStockRequirements, consolidateProductUnitCart, expandProductUnitCartToBase, expandProductUnitCatalog, groupProductUnitCart, normalizeProductUnits, unitStockShortage } from "./product-units.js";

test("product units keep unique valid conversions outside the base unit", () => {
  assert.deepEqual(normalizeProductUnits([
    { id: "box", name: "Box", conversion: "10", mrp: "150", sellingPrice: "135" },
    { id: "duplicate", name: "box", conversion: 12 },
    { id: "base", name: "Piece", conversion: 1 },
    { id: "bad", name: "Case", conversion: 0 },
  ], "Piece"), [{ id: "box", name: "Box", conversion: 10, conversionMode: "unit_contains_base", mrp: 150, sellingPrice: 135 }]);
});

test("unit catalog exposes pieces and boxes against one master product", () => {
  const [piece, box] = expandProductUnitCatalog({ id: "tea", name: "Tea", unit: "Piece", stock: 25, price: 12, wholesalePrice: 10, alternateUnits: [{ id: "box", name: "Box", conversion: 10 }] });
  assert.equal(piece.salesUnit, "Piece");
  assert.equal(piece.unitConversion, 1);
  assert.equal(box.name, "Tea · Box");
  assert.equal(box.price, 120);
  assert.equal(box.wholesalePrice, 100);
  assert.equal(box.productMasterId, "tea");
});

test("a product without alternate units still tracks base stock", () => {
  const [piece] = expandProductUnitCatalog({ id: "tea", name: "Tea", unit: "Piece", stock: 2, price: 12 });
  assert.equal(piece.stockConversionTracked, true);
  assert.equal(piece.productMasterId, "tea");
  assert.equal(piece.unitConversion, 1);
});

test("unit catalog uses editable MRP and selling price for an alternate unit", () => {
  const [, box] = expandProductUnitCatalog({
    id: "tea", name: "Tea", unit: "Piece", stock: 25, price: 12, mrp: 15,
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, mrp: 145, sellingPrice: 125 }],
  });
  assert.equal(box.mrp, 145);
  assert.equal(box.price, 125);
  assert.equal(box.retailPrice, 125);
  assert.equal(box.sellingPrice, 125);
});

test("box and piece sales reduce the same base stock", () => {
  const cart = [
    { productMasterId: "tea", stockConversionTracked: true, unitConversion: 10, qty: 1 },
    { productMasterId: "tea", stockConversionTracked: true, unitConversion: 1, qty: 3 },
  ];
  assert.equal(buildUnitStockRequirements(cart).get("tea"), 13);
  assert.equal(unitStockShortage([{ id: "tea", name: "Tea", stock: 12, unit: "Piece" }], cart)?.required, 13);
  assert.equal(applyUnitStockSale([{ id: "tea", stock: 25 }], cart, "now")[0].stock, 12);
  assert.equal(applyUnitStockSale([{ id: "tea", stock: 12 }], cart, "now")[0].stock, -1);
});

test("ten billed pieces automatically become one box at the configured box price", () => {
  const catalog = expandProductUnitCatalog({
    id: "tea",
    name: "Tea",
    unit: "Piece",
    stock: 25,
    price: 10,
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, mrp: 100, sellingPrice: 95 }],
  });
  const pieces = { ...catalog[0], qty: 10, notes: "" };
  const converted = consolidateProductUnitCart([pieces], catalog);
  assert.equal(converted.length, 1);
  assert.equal(converted[0].salesUnit, "Box");
  assert.equal(converted[0].qty, 1);
  assert.equal(converted[0].price, 95);
  assert.equal(buildUnitStockRequirements(converted).get("tea"), 10);
});

test("eleven billed pieces use one box price plus one piece price", () => {
  const catalog = expandProductUnitCatalog({
    id: "tea",
    name: "Tea",
    unit: "Piece",
    price: 10,
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, sellingPrice: 95 }],
  });
  const converted = consolidateProductUnitCart([{ ...catalog[0], qty: 11 }], catalog);
  assert.deepEqual(converted.map((item) => [item.salesUnit, item.qty, item.price]), [["Box", 1, 95], ["Piece", 1, 10]]);
  assert.equal(converted.reduce((sum, item) => sum + item.qty * item.price, 0), 105);
});

test("a billed box can be changed back to its piece quantity and price", () => {
  const catalog = expandProductUnitCatalog({
    id: "tea",
    name: "Tea",
    unit: "Piece",
    price: 10,
    alternateUnits: [{ id: "box", name: "Box", conversion: 10, sellingPrice: 95 }],
  });
  const boxCart = [{ ...catalog[1], qty: 1 }];
  const pieces = expandProductUnitCartToBase(boxCart, catalog, "tea");
  assert.deepEqual(pieces.map((item) => [item.salesUnit, item.qty, item.price]), [["Piece", 10, 10]]);
  assert.equal(pieces[0].unitPricingLocked, "smallest");
  assert.equal(buildUnitStockRequirements(pieces).get("tea"), 10);
  assert.equal(pieces.reduce((sum, item) => sum + item.qty * item.price, 0), 100);

  const regrouped = groupProductUnitCart(pieces, catalog, "tea");
  assert.deepEqual(regrouped.map((item) => [item.salesUnit, item.qty, item.price]), [["Box", 1, 95]]);
});

test("a box master can sell individual pieces with their own MRP and selling price", () => {
  const catalog = expandProductUnitCatalog({
    id: "pens",
    name: "Pen box",
    unit: "Box",
    stock: 5,
    mrp: 120,
    price: 110,
    alternateUnits: [{
      id: "piece",
      name: "Piece",
      conversion: 12,
      conversionMode: "base_contains_unit",
      mrp: 10,
      sellingPrice: 9,
    }],
  });
  assert.deepEqual(catalog.map((item) => [item.salesUnit, item.unitConversion, item.mrp, item.price]), [
    ["Box", 1, 120, 110],
    ["Piece", 1 / 12, 10, 9],
  ]);
  assert.equal(buildUnitStockRequirements([{ ...catalog[1], qty: 1 }]).get("pens"), 1 / 12);
  assert.equal(applyUnitStockSale([{ id: "pens", stock: 5 }], [{ ...catalog[1], qty: 1 }])[0].stock, 5 - (1 / 12));
});

test("pieces from a box master automatically use the box price at a full box quantity", () => {
  const catalog = expandProductUnitCatalog({
    id: "pens",
    name: "Pen box",
    unit: "Box",
    mrp: 120,
    price: 110,
    alternateUnits: [{ id: "piece", name: "Piece", conversion: 12, conversionMode: "base_contains_unit", mrp: 10, sellingPrice: 9 }],
  });
  const twelvePieces = consolidateProductUnitCart([{ ...catalog[1], qty: 12 }], catalog);
  assert.deepEqual(twelvePieces.map((item) => [item.salesUnit, item.qty, item.price]), [["Box", 1, 110]]);
  assert.equal(buildUnitStockRequirements(twelvePieces).get("pens"), 1);

  const thirteenPieces = consolidateProductUnitCart([{ ...catalog[1], qty: 13 }], catalog);
  assert.deepEqual(thirteenPieces.map((item) => [item.salesUnit, item.qty, item.price]), [["Box", 1, 110], ["Piece", 1, 9]]);
});

test("a box from a box master can be explicitly expanded to piece pricing and regrouped", () => {
  const catalog = expandProductUnitCatalog({
    id: "pens",
    name: "Pen box",
    unit: "Box",
    price: 110,
    alternateUnits: [{ id: "piece", name: "Piece", conversion: 12, conversionMode: "base_contains_unit", sellingPrice: 9 }],
  });
  const pieces = expandProductUnitCartToBase([{ ...catalog[0], qty: 1 }], catalog, "pens");
  assert.deepEqual(pieces.map((item) => [item.salesUnit, item.qty, item.price]), [["Piece", 12, 9]]);
  assert.equal(buildUnitStockRequirements(pieces).get("pens"), 1);
  assert.deepEqual(groupProductUnitCart(pieces, catalog, "pens").map((item) => [item.salesUnit, item.qty, item.price]), [["Box", 1, 110]]);
});
