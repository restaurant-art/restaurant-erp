import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeStorage, createTrainingSession, readPracticeValue, requestTrainingOtp, verifyTrainingOtp } from "./pos-training.js";
import { applyUnitStockSale } from "./product-units.js";

function fixture() {
  const source = {
    "vestora-inventory-1": [{ id: "rice", name: "Rice", stock: 50, unit: "kg" }],
    "vestora-sales-ledger": [{ id: "LIVE-BILL", storeId: "1", creditAmount: 500 }, { id: "OTHER-STORE", storeId: "2" }],
    "vestora-refund-ledger": [],
    "vestora-customer-details-1": { customers: [{ name: "Practice customer", mobile: "9999999999" }], walletEntries: [], settlements: [], overrides: [] },
    "vestora-offers-1": [{ id: "offer", discount: 10 }],
    "vestora-offline-orders": [{ id: "LIVE-QUEUED" }],
  };
  const serialized = new Map(Object.entries(source).map(([key, value]) => [key, JSON.stringify(value)]));
  const initial = [...serialized];
  let reads = 0;
  const liveStorage = {
    getItem(key) { reads += 1; return serialized.get(key) ?? null; },
    setItem() { assert.fail("A practice action attempted a LIVE WRITE"); },
    removeItem() { assert.fail("A practice action attempted a LIVE DELETE"); },
  };
  const session = createTrainingSession({ liveStorage, store: { id: "1", name: "Shop" }, cashier: { id: "cashier", name: "Trainee" }, items: [{ id: "coffee", name: "Coffee", price: 55 }], foodStock: [{ item: "Coffee", available: 20 }], pendingTableOrders: [{ id: "table-order", status: "Ready for billing" }] });
  return { session, source, serialized, initial, getReads: () => reads };
}

test("practice storage is detached, synchronous and never falls through to live storage", () => {
  const seed = { products: [{ stock: 50 }] };
  const adapter = createPracticeStorage(seed);
  seed.products[0].stock = 0;
  assert.equal(readPracticeValue(adapter.storage, "products")[0].stock, 50);
  let notifications = 0;
  const unsubscribe = adapter.subscribe(() => notifications++);
  adapter.storage.setItem("products", JSON.stringify([{ stock: 40 }]));
  assert.equal(notifications, 1);
  assert.equal(adapter.storage.getItem("missing-live-key"), null);
  unsubscribe();
  adapter.storage.removeItem("products");
  assert.equal(notifications, 1);
});

test("training requires a server-sent and server-verified WhatsApp OTP", async () => {
  const cashier = { email: "cashier@example.test" };
  await assert.rejects(requestTrainingOtp(cashier, "", () => assert.fail()), /Select a cashier/);
  await assert.rejects(requestTrainingOtp(cashier, "1", async () => { throw new Error("Offline"); }), /Offline/);
  const challenge = await requestTrainingOtp(cashier, "1", async (resource, options) => {
    assert.equal(resource, "training-otp/request");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { email: cashier.email, storeId: "1" });
    return { challengeId: "challenge-1", maskedPhone: "+91 ••••••1234" };
  });
  assert.equal(challenge.challengeId, "challenge-1");
  await assert.rejects(verifyTrainingOtp(cashier, "1", challenge.challengeId, "123", () => assert.fail()), /6-digit/);
  await assert.rejects(verifyTrainingOtp(cashier, "1", challenge.challengeId, "123456", async () => ({ cashier: { email: "other@example.test", storeId: "1" } })), /verification failed/);
  const result = await verifyTrainingOtp(cashier, "1", challenge.challengeId, "123456", async (resource, options) => {
    assert.equal(resource, "training-otp/verify");
    assert.deepEqual(JSON.parse(options.body), { email: cashier.email, storeId: "1", challengeId: "challenge-1", code: "123456" });
    return { cashier: { ...cashier, id: "verified", storeId: "1" } };
  });
  assert.equal(result.id, "verified");
});

test("snapshot includes all catalog and account inputs, but no offline queue or other store's bills", () => {
  const { session, source } = fixture();
  const storage = session.adapter.storage;
  assert.equal(session.items.length, 1);
  assert.equal(readPracticeValue(storage, "vestora-inventory-1").length, 1);
  assert.equal(readPracticeValue(storage, "vestora-offers-1").length, 1);
  assert.deepEqual(readPracticeValue(storage, "vestora-sales-ledger").map((row) => row.id), ["LIVE-BILL"]);
  assert.equal(storage.getItem("vestora-offline-orders"), null);
  source["vestora-customer-details-1"].customers[0].name = "Changed live";
  assert.equal(readPracticeValue(storage, "vestora-customer-details-1").customers[0].name, "Practice customer");
});

for (const payment of ["Cash", "UPI", "Card", "Credit", "Split", "Wallet"]) {
  test(`${payment} billing, stock, accounts, refunds and shifts do not read or write live state after entry`, () => {
    const { session, serialized, initial, getReads } = fixture();
    const { storage } = session.adapter;
    const readsAtEntry = getReads();
    const shift = readPracticeValue(storage, "training-current-shift");
    const bill = session.actions.sale({ id: "TRAIN-BILL-1", payment, total: 100, items: [{ name: "Rice", qty: 2 }], creditAmount: payment === "Credit" ? 100 : 0 });
    assert.equal(bill.training, true);
    assert.equal(bill.paymentStatus, "Simulated");
    assert.equal(bill.shiftId, shift.id);
    const stock = readPracticeValue(storage, "vestora-inventory-1");
    const sold = applyUnitStockSale(stock, [{ productMasterId: "rice", qty: 2, unitConversion: 1, stockConversionTracked: true }]);
    storage.setItem("vestora-inventory-1", JSON.stringify(sold));
    assert.equal(readPracticeValue(storage, "vestora-inventory-1")[0].stock, 48);
    for (const key of ["vestora-customer-details-1", "vestora-finance-receipts-1"]) {
      storage.setItem(key, JSON.stringify({ training: true, walletEntries: [{ amount: 1000 }], settlements: [{ amount: 500 }] }));
    }
    session.actions.foodStock((rows) => rows.map((row) => ({ ...row, available: row.available - 1 })));
    assert.equal(readPracticeValue(storage, "vestora-food-stock-1")[0].available, 19);
    session.actions.refund({ billId: bill.id, payment, amount: 25 });
    session.actions.voidItem({ name: "Rice", price: 10, qty: 1 }, "Retail");
    session.actions.tablePaid({ id: "table-order" }, bill);
    assert.equal(readPracticeValue(storage, "vestora-table-orders")[0].status, "Paid");
    session.actions.closeShift(75, { note: "practice closing" });
    assert.equal(storage.getItem("training-current-shift"), "null");
    assert.equal(readPracticeValue(storage, "vestora-shift-history-1")[0].training, true);
    assert.equal(getReads(), readsAtEntry);
    assert.deepEqual([...serialized], initial);
  });
}

test("live bills cannot be refunded during practice", () => {
  const { session } = fixture();
  assert.throws(() => session.actions.refund({ billId: "LIVE-BILL", amount: 100 }), /Only practice bills/);
});

test("exit destroys all practice data and stale storage writers cannot recreate it", () => {
  const { session, serialized, initial } = fixture();
  const { storage } = session.adapter;
  session.actions.sale({ id: "TRAIN-BILL", total: 50 });
  session.adapter.dispose();
  storage.setItem("vestora-sales-ledger", "[1]");
  assert.equal(storage.getItem("vestora-sales-ledger"), null);
  assert.equal(storage.getItem("vestora-inventory-1"), null);
  assert.deepEqual([...serialized], initial);
});
