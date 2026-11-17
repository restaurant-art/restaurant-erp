import test from "node:test";
import assert from "node:assert/strict";
import { createCloudPaymentInvoker, autoPrintPineBill, pineCloudEnabled } from "./pine-cloud.js";
import { collectTerminalPayments } from "./pine-labs.js";

const payment = { paymentKey: "BILL-1:0", billId: "BILL-1", storeId: "shop-1", method: "UPI", amountPaise: 1500, training: false };
const bill = { id: "BILL-1", storeId: "shop-1", pineLabsTransport: "cloud", payment: "UPI", paidAmount: 15, pineLabsRequired: true };
const printer = { enabled: true, type: "QZ Tray", name: "Essae PR-55", autoPrintUpi: true };

test("cloud uploads once then only polls status until approved", async () => {
  const paths = [], results = [{ status: "pending" }, { status: "pending" }, { status: "approved" }];
  const invoke = createCloudPaymentInvoker({ request: async path => { paths.push(path); return results.shift(); }, delay: async () => {} });
  assert.equal((await invoke("pay", payment)).status, "approved");
  assert.deepEqual(paths.map(path => path.split("/").at(-2)), ["pay", "recover", "recover"]);
});

test("timeout and unknown outcomes never resend payment", async () => {
  let calls = 0;
  const invoke = createCloudPaymentInvoker({ attempts: 2, delay: async () => {}, request: async () => { calls++; return { status: "pending" }; } });
  assert.equal((await invoke("recover", payment)).status, "pending");
  assert.equal(calls, 3);
  calls = 0;
  const unknown = createCloudPaymentInvoker({ request: async () => { calls++; return { status: "unknown" }; } });
  assert.equal((await unknown("pay", payment)).status, "unknown");
  assert.equal(calls, 1);
  await assert.rejects(unknown("pay", { ...payment, training: true }));
  assert.equal(calls, 1);
});

test("cloud checkout leaves card split components in their existing manual flow", async () => {
  const current = { ...bill, payment: "Split", splitPayments: [{ method: "Card", amount: 5 }, { method: "UPI", amount: 10 }] };
  const calls = [];
  await collectTerminalPayments({ bill: current, storeId: "shop-1", persist: () => {}, invoke: async (_, p) => {
    calls.push(p); return { ...p, status: "approved", transactionReference: "rrn", billingRef: "ref", approvalCode: "code" };
  } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].paymentKey, "BILL-1:1");
  assert.equal(calls[0].amountPaise, 1000);
});

test("auto print claims the verified saved bill before sending and records submission", async () => {
  const events = [];
  const result = await autoPrintPineBill({ bill, printer, job: async (store, data) => {
    assert.equal(store, "shop-1"); events.push(data.action); return { claimed: true, jobId: "job" };
  }, print: async ({ beforeSend }) => { assert.equal(await beforeSend(), true); events.push("paper"); } });
  assert.deepEqual(events, ["claim", "paper", "result"]);
  assert.equal(result, "submitted");
});

test("a duplicate print claim cannot print again", async () => {
  let sent = 0;
  const result = await autoPrintPineBill({ bill, printer, job: async () => ({ claimed: false }), print: async ({ beforeSend }) => {
    if (!await beforeSend()) return false;
    sent++;
  } });
  assert.equal(result, "already-attempted");
  assert.equal(sent, 0);
});

test("print preflight failure does not claim; post-send failure stays uncertain", async () => {
  const actions = [];
  const job = async (_, data) => { actions.push(data); return { claimed: true, jobId: "job" }; };
  await assert.rejects(autoPrintPineBill({ bill, printer, job, print: async () => { throw new Error("QZ offline"); } }), /Payment is saved/);
  assert.equal(actions.length, 0);
  await assert.rejects(autoPrintPineBill({ bill, printer, job, print: async ({ beforeSend }) => { await beforeSend(); throw new Error("socket lost"); } }), /Check whether the bill printed/);
  assert.deepEqual(actions.map(a => a.action), ["claim", "result"]);
  assert.equal(actions[1].status, "unknown");
});

test("lost print acknowledgement does not resend or mislabel the payment", async () => {
  let calls = 0;
  const result = await autoPrintPineBill({ bill, printer, job: async (_, data) => {
    if (data.action === "result") throw new Error("network");
    return { claimed: true, jobId: "job" };
  }, print: async ({ beforeSend }) => { await beforeSend(); calls++; } });
  assert.equal(result, "submitted-unacknowledged");
  assert.equal(calls, 1);
});

test("training, manual payments and disabled auto printing do not print", async () => {
  const print = async () => assert.fail("must not print");
  for (const entry of [{ ...bill, training: true }, { ...bill, pineLabsTransport: undefined }])
    assert.equal(await autoPrintPineBill({ bill: entry, printer, print }), "skipped");
  assert.equal(await autoPrintPineBill({ bill, printer: { ...printer, autoPrintUpi: false }, print }), "skipped");
  await assert.rejects(autoPrintPineBill({ bill, printer: { ...printer, enabled: false }, print }), /Connect/);
  assert.equal(pineCloudEnabled({ getItem: () => null }, "shop-1"), false);
});
