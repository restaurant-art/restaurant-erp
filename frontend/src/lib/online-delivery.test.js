import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import {
  allowedDeliveryStores,
  canAccessDeliveryStore,
  canManageDeliveryIntegration,
  canTransitionDeliveryOrder,
  normalizeSimulatorOrder,
  retryDelayMs,
  signSimulatorRequest,
  stockDeltasFor,
  verifySimulatorRequest,
} from "../../../supabase/functions/_shared/delivery-domain.js";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
if (!globalThis.btoa) globalThis.btoa = (value) => Buffer.from(value, "binary").toString("base64");
if (!globalThis.atob) globalThis.atob = (value) => Buffer.from(value, "base64").toString("binary");

test("test adapters normalize only valid Zomato and Swiggy simulator payloads", () => {
  const normalized = normalizeSimulatorOrder("zomato", {
    externalOrderId: "SIM-100", items: [{ providerItemId: "ITEM-1", name: "Biryani", quantity: 2, addons: ["Extra raita"] }], subtotal: 500,
  });
  assert.equal(normalized.provider, "zomato");
  assert.equal(normalized.items[0].quantity, 2);
  assert.equal(normalized.testMode, true);
  assert.equal(normalizeSimulatorOrder("swiggy", { externalOrderId: "SIM-S-1", items: [{ providerItemId: "ITEM-1", name: "Biryani", quantity: 1 }] }).provider, "swiggy");
  assert.throws(() => normalizeSimulatorOrder("zomato", { externalOrderId: "SIM-101", items: [{ providerItemId: "x", name: "Bad", quantity: -1 }] }));
  assert.throws(() => normalizeSimulatorOrder("unknown", {}));
});

test("delivery order lifecycle rejects invalid and terminal transitions", () => {
  assert.equal(canTransitionDeliveryOrder("new", "accepted"), true);
  assert.equal(canTransitionDeliveryOrder("accepted", "preparing"), true);
  assert.equal(canTransitionDeliveryOrder("preparing", "ready"), true);
  assert.equal(canTransitionDeliveryOrder("rejected", "accepted"), false);
  assert.equal(canTransitionDeliveryOrder("new", "ready"), false);
});

test("delivery API scope grants only assigned branches and administrator roles", () => {
  const allowed = allowedDeliveryStores({
    stores: [
      { id: "BRANCH-A", adminEmail: "owner@example.test", restaurantId: "R1" },
      { id: "BRANCH-B", adminEmail: "other@example.test", restaurantId: "R2" },
    ],
    email: "staff@example.test", assignedStore: "BRANCH-A", restaurantId: "R1",
  });
  assert.deepEqual(allowed, ["BRANCH-A"]);
  assert.equal(canAccessDeliveryStore("BRANCH-A", false, allowed), true);
  assert.equal(canAccessDeliveryStore("BRANCH-B", false, allowed), false);
  assert.equal(canAccessDeliveryStore("BRANCH-B", true, allowed), true);
  assert.equal(canManageDeliveryIntegration("restaurant_admin"), true);
  assert.equal(canManageDeliveryIntegration("waiter"), false);
});

test("stock deductions aggregate repeated menu items exactly once per normalized order", () => {
  assert.deepEqual(stockDeltasFor([
    { providerItemId: "A", quantity: 1 },
    { providerItemId: "A", quantity: 2 },
    { providerItemId: "B", quantity: 3 },
  ]), [{ providerItemId: "A", quantity: 3 }, { providerItemId: "B", quantity: 3 }]);
  assert.throws(() => stockDeltasFor([{ providerItemId: "A", quantity: 0 }]));
});

test("simulator webhook signature validates body and rejects tampering or stale timestamps", async () => {
  const secret = "ephemeral-test-secret";
  const body = JSON.stringify({ externalOrderId: "SIM-200" });
  const timestamp = String(Date.now());
  const signature = await signSimulatorRequest(body, timestamp, secret);
  assert.equal(await verifySimulatorRequest(body, timestamp, signature, secret), true);
  assert.equal(await verifySimulatorRequest(`${body} `, timestamp, signature, secret), false);
  assert.equal(await verifySimulatorRequest(body, String(Date.now() - 10 * 60 * 1000), signature, secret), false);
});

test("retry delays grow exponentially and cap at one hour", () => {
  assert.equal(retryDelayMs(1), 2_000);
  assert.equal(retryDelayMs(3), 8_000);
  assert.equal(retryDelayMs(10), 1_024_000);
  assert.equal(retryDelayMs(12), 3_600_000);
  assert.equal(retryDelayMs(50), 3_600_000);
});
