import test from "node:test";
import assert from "node:assert/strict";
import { installNumberInputWheelGuard } from "./number-input-wheel.js";

function fixture() {
  const registrations = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener, options) { registrations.set(type, { listener, options }); },
    removeEventListener(type, listener, capture) {
      assert.equal(registrations.get(type)?.listener, listener);
      assert.equal(capture, true);
      registrations.delete(type);
    },
  };
  const input = { tagName: "INPUT", type: "number", value: "125.50", readOnly: false, disabled: false, blur() { document.activeElement = null; } };
  const cleanup = installNumberInputWheelGuard(document);
  return { document, input, registrations, cleanup };
}

test("wheel releases a focused number field without changing its value or blocking page scroll", () => {
  const { document, input, registrations } = fixture();
  document.activeElement = input;
  const { listener, options } = registrations.get("wheel");
  assert.deepEqual(options, { capture: true, passive: true });
  listener({ target: input, preventDefault() { assert.fail("Page scroll must stay available"); } });
  assert.equal(document.activeElement, null);
  assert.equal(input.value, "125.50");
});

test("wheel outside the focused number field leaves focus and values alone", () => {
  const { document, input, registrations } = fixture();
  document.activeElement = input;
  registrations.get("wheel").listener({ target: { tagName: "DIV" } });
  registrations.get("wheel").listener({ target: { ...input } });
  assert.equal(document.activeElement, input);
  assert.equal(input.value, "125.50");
});

test("text, readonly and disabled inputs are not blurred", () => {
  for (const properties of [{ type: "text" }, { readOnly: true }, { disabled: true }]) {
    const { document, input, registrations } = fixture();
    Object.assign(input, properties);
    document.activeElement = input;
    registrations.get("wheel").listener({ target: input });
    assert.equal(document.activeElement, input);
  }
});

test("cleanup removes the capture listener and does not install keyboard handlers", () => {
  const { registrations, cleanup } = fixture();
  assert.deepEqual([...registrations.keys()], ["wheel"]);
  cleanup();
  assert.equal(registrations.size, 0);
});
