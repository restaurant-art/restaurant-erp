import test from "node:test";
import assert from "node:assert/strict";
import { pickQzPrinter } from "./qz-printer.js";

const printers = [
  "Microsoft Print to PDF",
  "EPSON4F2A9A (L3250 Series)",
  "POS-80C",
  "Essae PR-55",
  "OneNote (Desktop)",
];

test("keeps an explicitly configured installed printer", () => {
  assert.equal(pickQzPrinter(printers, "pos-80c", "Essae PR-55"), "POS-80C");
});

test("uses the physical Windows default when the saved printer is unavailable", () => {
  assert.equal(pickQzPrinter(printers, "Kitchen KOT Printer", "Essae PR-55"), "Essae PR-55");
});

test("does not silently select a virtual PDF printer", () => {
  assert.equal(pickQzPrinter(printers, "Missing printer", "Microsoft Print to PDF"), "POS-80C");
});

test("returns an empty name when QZ reports no printers", () => {
  assert.equal(pickQzPrinter([], "POS-80C", "POS-80C"), "");
});
