import { test } from "node:test";
import assert from "node:assert/strict";
import { billingMobile, embeddedSignupEvent, launchMetaSignup, validBillingMobile } from "./whatsapp-billing.js";

test("preserves country codes and never turns an overlong number into a valid shorter number", () => {
  assert.equal(billingMobile("+44 7700 900123"), "+447700900123");
  assert.equal(billingMobile("98765 43210"), "9876543210");
  assert.equal(validBillingMobile(billingMobile("919876543210")), false);
  assert.equal(validBillingMobile(billingMobile("+4477009001234567")), false);
  assert.equal(validBillingMobile(billingMobile("+1 (415) 555-2671")), true);
});

test("accepts embedded signup messages only from the Meta SDK origins", () => {
  const data = { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "123", phone_number_id: "456" } };
  assert.equal(embeddedSignupEvent({ origin: "https://www.facebook.com.example.test", data }), null);
  assert.equal(embeddedSignupEvent({ origin: "https://www.facebook.com", data: "bad JSON" }), null);
  assert.deepEqual(embeddedSignupEvent({ origin: "https://web.facebook.com", data: JSON.stringify(data) }), data);
});

test("requires both Meta authorization and the selected store sender", async () => {
  const fakeWindow = new EventTarget();
  fakeWindow.setTimeout = setTimeout;
  fakeWindow.clearTimeout = clearTimeout;
  globalThis.window = fakeWindow;
  const finish = () => fakeWindow.dispatchEvent(new MessageEvent("message", {
    origin: "https://www.facebook.com",
    data: { type: "WA_EMBEDDED_SIGNUP", event: "FINISH", data: { waba_id: "123", phone_number_id: "456" } },
  }));
  try {
    const result = launchMetaSignup({ login(callback, params) {
      assert.equal(params.response_type, "code");
      callback({ authResponse: { code: "test-code" } });
      finish();
    } }, "789");
    assert.deepEqual(await result, { code: "test-code", wabaId: "123", phoneId: "456", businessId: undefined });
  } finally {
    delete globalThis.window;
  }
});
