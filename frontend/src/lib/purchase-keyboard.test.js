import test from "node:test";
import assert from "node:assert/strict";
import { handlePurchaseArrowNavigation } from "./purchase-keyboard.js";

function fixture() {
  let focused;
  const rows = [0, 1].map(() => ({ fields: [], querySelectorAll() { return this.fields; }, matches(selector) { return selector === ".purchase-order-line"; } }));
  for (const row of rows) row.fields = [0, 1, 2].map((column) => ({
    type: column === 0 ? "text" : "number", tagName: "INPUT", value: "", selectionStart: null,
    matches: () => true, getClientRects: () => [{}], getAttribute: () => "false",
    closest: () => row, focus() { focused = this; },
  }));
  const form = { querySelectorAll: (selector) => selector === ".purchase-order-line" ? rows : rows.flatMap((row) => row.fields) };
  const press = (target, key) => {
    const event = { target, key, currentTarget: form, preventDefault() { this.defaultPrevented = true; } };
    handlePurchaseArrowNavigation(event, { rowSelector: ".purchase-order-line", gridSelector: ".purchase-order-line" });
    return event;
  };
  return { rows, press, focused: () => focused };
}
test("left and right arrows move between editable purchase-order cells", () => {
  const f = fixture();
  assert.equal(f.press(f.rows[0].fields[1], "ArrowRight").defaultPrevented, true);
  assert.equal(f.focused(), f.rows[0].fields[2]);
  f.press(f.rows[0].fields[1], "ArrowLeft");
  assert.equal(f.focused(), f.rows[0].fields[0]);
});
test("vertical arrows preserve the column across purchase-order rows", () => {
  const f = fixture();
  f.press(f.rows[0].fields[1], "ArrowDown");
  assert.equal(f.focused(), f.rows[1].fields[1]);
  f.press(f.rows[1].fields[1], "ArrowUp");
  assert.equal(f.focused(), f.rows[0].fields[1]);
});
test("open suggestion lists and text editing retain their own arrow keys", () => {
  const f = fixture();
  const input = f.rows[0].fields[0];
  input.getAttribute = () => "true";
  assert.equal(f.press(input, "ArrowDown").defaultPrevented, undefined);
  input.getAttribute = () => "false";
  input.value = "Rice"; input.selectionStart = 2; input.selectionEnd = 2;
  assert.equal(f.press(input, "ArrowLeft").defaultPrevented, undefined);
  assert.equal(f.press(input, "ArrowRight").defaultPrevented, undefined);
});
