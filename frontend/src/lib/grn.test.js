import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transformWithEsbuild } from "vite";
import { createGrnRecord, deleteGrnRecord, nextGrnNumber, normalizeGrnLines, updateGrnRecord } from "./grn.js";

test("GRN numbers increment independently by receipt year", () => {
  const records = [{ grnNo: "GRN-2026-00002" }, { grnNo: "GRN-2025-00040" }, { grnNo: "GRN-2026-00001" }];
  assert.equal(nextGrnNumber(records, new Date(2026, 9, 26)), "GRN-2026-00003");
  assert.equal(nextGrnNumber(records, new Date(2027, 0, 1)), "GRN-2027-00001");
});

test("GRN lines omit blank and non-positive quantities", () => {
  assert.deepEqual(normalizeGrnLines([
    { itemTypeBrand: "Rice · Market", quantity: "50", unit: "kg" },
    { itemTypeBrand: "Oil", quantity: "0", unit: "L" },
    { itemTypeBrand: "", quantity: "4", unit: "pcs" },
  ]), [{ itemTypeBrand: "Rice · Market", quantity: 50, unit: "kg" }]);
});

test("generated GRN keeps typed supplier and invoice details and snapshots the logo format", () => {
  const grn = createGrnRecord({
    date: "2026-10-26", time: "14:30", supplierName: "Fresh Supplies", supplierPhone: "9876543210",
    supplierAddress: "Calicut", supplierGstin: "abcde1234f1z5", invoiceNo: "INV-42", invoiceDate: "2026-10-25",
    billAmount: "1250.50", vehicleNo: "KL-11-A-1234", remarks: "Received in good condition", paidDate: "2026-10-26",
    receiverName: "Aswin", items: [{ itemTypeBrand: "Basmati rice", quantity: "25", unit: "kg" }],
  }, [], { companyName: "The Market", showLogo: true, logoData: "data:image/png;base64,logo" }, { id: "test-grn", now: new Date("2026-10-26T09:00:00.000Z") });
  assert.equal(grn.grnNo, "GRN-2026-00001");
  assert.equal(grn.supplierGstin, "ABCDE1234F1Z5");
  assert.equal(grn.billAmount, 1250.5);
  assert.equal(grn.items[0].quantity, 25);
  assert.equal(grn.company.logoData, "data:image/png;base64,logo");
});

test("vendor and invoice details generate a GRN without item lines", () => {
  const grn = createGrnRecord({ date: "2026-10-26", supplierName: "Fresh Supplies", invoiceNo: "INV-43" }, [], {}, { id: "invoice-only-grn", now: new Date("2026-10-26T09:00:00.000Z") });
  assert.equal(grn.grnNo, "GRN-2026-00001");
  assert.equal(grn.supplierName, "Fresh Supplies");
  assert.equal(grn.invoiceNo, "INV-43");
  assert.deepEqual(grn.items, []);
});

test("GRN generation still requires supplier and invoice details", () => {
  assert.throws(() => createGrnRecord({ supplierName: "Fresh Supplies" }), /invoice number/i);
  assert.throws(() => createGrnRecord({ invoiceNo: "INV-44" }), /supplier name/i);
});

test("editing a GRN changes its details but keeps its number, identity, and print header", () => {
  const original = createGrnRecord({ date: "2026-10-27", supplierName: "Fresh Supplies", invoiceNo: "INV-45", billAmount: "125" }, [], { companyName: "Original Shop" }, { id: "fixed-id", now: new Date("2026-10-27T09:00:00.000Z") });
  const edited = updateGrnRecord(original, { ...original, supplierName: "Updated Supplies", invoiceNo: "INV-45B", billAmount: "150.50" }, { now: new Date("2026-10-27T10:00:00.000Z") });
  assert.equal(edited.id, original.id);
  assert.equal(edited.grnNo, original.grnNo);
  assert.equal(edited.createdAt, original.createdAt);
  assert.deepEqual(edited.company, original.company);
  assert.equal(edited.supplierName, "Updated Supplies");
  assert.equal(edited.invoiceNo, "INV-45B");
  assert.equal(edited.billAmount, 150.5);
  assert.equal(edited.updatedAt, "2026-10-27T10:00:00.000Z");
  assert.throws(() => updateGrnRecord(original, { ...original, date: "2027-01-01" }), /must remain in 2026/i);
});

test("deleted GRNs stay numbered so new receipts never reuse their number", () => {
  const original = createGrnRecord({ date: "2026-10-27", supplierName: "Fresh Supplies", invoiceNo: "INV-46" }, [], {}, { id: "fixed-id", now: new Date("2026-10-27T09:00:00.000Z") });
  const deleted = deleteGrnRecord(original, { now: new Date("2026-10-27T10:00:00.000Z") });
  assert.equal(deleted.deletedAt, "2026-10-27T10:00:00.000Z");
  assert.equal(deleted.grnNo, original.grnNo);
  assert.equal(nextGrnNumber([deleted], new Date(2026, 9, 27)), "GRN-2026-00002");
});

test("production-minified GRN generation creates an ID without undefined variables", async () => {
  const source = await readFile(new URL("./grn.js", import.meta.url), "utf8");
  const { code } = await transformWithEsbuild(source, "grn.js", { format: "esm", target: "es2018", minify: true });
  const minifiedModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  const record = minifiedModule.createGrnRecord({ date: "2026-10-27", supplierName: "Fresh Supplies", invoiceNo: "INV-45" });
  assert.ok(record.id);
  assert.equal(record.grnNo, "GRN-2026-00001");
});
