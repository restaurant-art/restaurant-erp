import assert from "node:assert/strict";
import test from "node:test";
import { nextAvailablePluNumber, normalizePluNumber } from "./item-plu.js";

test("PLU numbers are normalized to at least four digits", () => {
  assert.equal(normalizePluNumber("7"), "0007");
  assert.equal(normalizePluNumber("PLU-0012"), "0012");
  assert.equal(normalizePluNumber(""), "");
});

test("auto PLU uses the first available unique number", () => {
  const items = [
    { id: "a", pluNumber: "0001" },
    { id: "b", pluNumber: "0003" },
    { id: "c", pluNumber: "" },
  ];
  assert.equal(nextAvailablePluNumber(items), "0002");
});

test("editing an item keeps its PLU available to itself", () => {
  const items = [{ id: "a", pluNumber: "0001" }, { id: "b", pluNumber: "0002" }];
  assert.equal(nextAvailablePluNumber(items, "a"), "0001");
});
