import assert from "node:assert/strict";
import test from "node:test";
import { barcodeModules, labelGrid, labelPosition, renderLabel, sheetLabels } from "./barcode-print-layout.js";

const settings = { paper: "thermal", orientation: "portrait", width: 50, height: 30, gap_x: 2, gap_y: 2,
  margin: 0, columns: 3, offset_x: 0, offset_y: 0, dpi: 203, font: 7, barcode_height: 8, barcode_width: 100,
  visible: { store: true, product: true, bars: true, number: true, mrp: true, price: true } };

test("encodes exact POS values in CODE128, EAN-13, EAN-8 and UPC", () => {
  const internal = barcodeModules({ barcode: "9212345678", format: "CODE128" });
  assert.match(internal, /^[01]+$/);
  assert.equal(internal.length, 90);
  for (const [barcode, format, length] of [["4006381333931", "EAN13", 95], ["96385074", "EAN8", 67], ["036000291452", "UPC", 95]]) {
    assert.equal(barcodeModules({ barcode, format }).length, length);
  }
  assert.throws(() => barcodeModules({ barcode: "4006381333930", format: "EAN13" }));
});

test("fits thermal rotation and exact A4 grid, including calibration", () => {
  const thermal = labelGrid(settings);
  assert.deepEqual([thermal.pageWidth, thermal.pageHeight, thermal.perPage], [50, 30, 1]);
  const rotate = labelGrid({ ...settings, orientation: "landscape" });
  assert.deepEqual([rotate.pageWidth, rotate.pageHeight, rotate.rotate], [30, 50, true]);
  const sheet = { ...settings, paper: "a4", margin: 4, offset_x: 1.5, columns: 3 };
  const grid = labelGrid(sheet);
  assert.equal(grid.perPage, 27);
  assert.deepEqual(labelPosition(4, sheet, grid), { left: 57.5, top: 36 });
  assert.throws(() => labelGrid({ ...sheet, columns: 5 }), /does not fit/);
  assert.equal([...sheetLabels([{ label: { quantity: 3 } }, { label: { quantity: 2 } }], 2)].length, 10);
});

test("keeps long names and mixed prices within label edges and rejects unreadable widths", () => {
  const text = [];
  globalThis.document = { createElement() {
    return { getContext() { return {
      fillRect() {}, measureText(value) { return { width: value.length * Number(/ ([0-9.]+)px/.exec(this.font)?.[1] || 10) / 2 }; },
      fillText(value, x, y) { text.push([value, x, y]); },
    }; }, toDataURL() { return "image"; } };
  } };
  try {
    const label = { store: "UV PRO", name: "A very long multilingual supermarket product name ".repeat(4),
      price: 99.95, mrp: 120.50, barcode: "9212345678", format: "CODE128" };
    assert.equal(renderLabel(label, settings), "image");
    assert(text.some(([line]) => line.includes("…")));
    assert(text.some(([line]) => line.includes("₹120.50") && line.includes("₹99.95")));
    assert.throws(() => renderLabel(label, { ...settings, width: 25, height: 15, barcode_height: 6 }), /too wide/);
  } finally {
    delete globalThis.document;
  }
});

test("the generated code resolves to the same Product Master SKU in ERP POS", async () => {
  const { buildProductSearchCatalog, filterPosCatalog } = await import("./pos-catalog.js");
  const product = { id: "INV-TEST", sku: "009", name: "Test item", status: "Active", sellable: true,
    barcode: "9212345678", unit: "piece", sellingPrice: 99 };
  const catalog = buildProductSearchCatalog([], [product]);
  assert.equal(catalog.find((entry) => entry.barcode === product.barcode).productMasterId, product.id);
  assert.equal(filterPosCatalog([], catalog, product.barcode).length, 1);
});

test("five-digit scans resolve the exact stock SKU while manufacturer barcodes still work", async () => {
  const { buildProductSearchCatalog, filterPosCatalog, findPosBarcodeMatch } = await import("./pos-catalog.js");
  const parent = { id: "RICE", name: "Rice", unit: "pack", status: "Active", sellable: true,
    barcode: "4006381333931", internalBarcode: "10000", sellingPrice: 99, mrp: 110,
    eanMrpOptions: [{ id: "alt", barcode: "036000291452", mrp: 105 }],
    alternateUnits: [{ id: "case", name: "case", conversion: 6 }] };
  const child = { ...parent, id: "RICE-BATCH", parentProductId: "RICE", variantLabel: "Batch 2", internalBarcode: "10001" };
  const catalog = buildProductSearchCatalog([], [parent, child]);
  assert.equal(findPosBarcodeMatch(catalog, "10000").id, "RICE");
  assert.equal(findPosBarcodeMatch(catalog, "10001").productMasterId, "RICE-BATCH");
  assert.equal(findPosBarcodeMatch(catalog, parent.barcode).productMasterId, "RICE");
  assert.equal(findPosBarcodeMatch(catalog, "036000291452").mrp, 105);
  assert.equal(catalog.filter((item) => item.internalBarcode === "10000").length, 1);
  assert.equal(filterPosCatalog([], catalog, "10001").length, 1);
  assert.match(barcodeModules({ barcode: "10000", format: "CODE128" }), /^[01]+$/);
});
