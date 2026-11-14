import test from "node:test";
import assert from "node:assert/strict";
import { collectTerminalPayments, paymentPaise, terminalTenders, validateTerminalResult } from "./pine-labs.js";

const bill = () => ({ id: "BILL-1", payment: "Card", paidAmount: 15.25, total: 15.25, pineLabsRequired: true });
const approved = payment => ({ ...payment, status: "approved", billingRef: "U1234", transactionReference: "98765", approvalCode: "000123", CardNumber: "not-to-be-saved" });

test("rupees convert to exact positive integer paise", () => {
  assert.equal(paymentPaise(15.25), 1525);
  for (const value of [0, -1, Infinity, NaN, "", 1.001, 10000000]) assert.throws(() => paymentPaise(value));
});

test("only electronic split tenders are sent to the terminal", () => {
  assert.deepEqual(terminalTenders({ payment: "Split", splitPayments: [{ method: "Cash", amount: 10 }, { method: "Card", amount: 15 }, { method: "Credit", amount: 2 }] }), [{ method: "Card", amountPaise: 1500, index: 1 }]);
});

test("training never calls native payments", async () => {
  let calls = 0;
  await assert.rejects(collectTerminalPayments({ bill: bill(), storeId: "A", training: true, invoke: () => { calls++; } }), /Training/);
  await assert.rejects(collectTerminalPayments({ bill: { ...bill(), training: true }, invoke: () => { calls++; } }), /Training/);
  assert.equal(calls, 0);
});

test("payment is saved before dispatch and card data is not kept", async () => {
  let saved; const current = bill();
  await collectTerminalPayments({ bill: current, storeId: "A", persist: value => { saved = structuredClone(value); }, invoke: async (action, payment) => {
    assert.equal(action, "pay"); assert.equal(saved.terminalPayments[0].status, "pending");
    return approved(payment);
  } });
  assert.equal(current.paymentStatus, "Terminal confirmed");
  assert.equal(current.terminalPayments[0].amountPaise, 1525);
  assert.equal("CardNumber" in current.terminalPayments[0], false);
});

test("lost acknowledgement recovers the native result without issuing a second sale", async () => {
  const current = bill(); let saved; let charges = 0; let nativeResult;
  const persist = value => { saved = structuredClone(value); };
  await assert.rejects(collectTerminalPayments({ bill: current, storeId: "A", persist, invoke: async (action, payment) => {
    charges++; nativeResult = approved(payment); throw new Error("Activity restarted");
  } }), /restarted/);
  await collectTerminalPayments({ bill: saved, storeId: "A", persist, invoke: async action => {
    assert.equal(action, "recover"); return nativeResult;
  } });
  assert.equal(charges, 1); assert.equal(saved.paymentStatus, "Terminal confirmed");
});

test("a pending result blocks completion and recovery never silently switches to cash", async () => {
  const current = bill();
  await assert.rejects(collectTerminalPayments({ bill: current, storeId: "A", persist: () => {}, invoke: async (action, payment) => ({ ...payment, status: "pending" }) }), /pending/);
  assert.notEqual(current.paymentStatus, "Terminal confirmed");
  assert.equal(current.payment, "Card");
});

test("amount, store, bill, method and reference mismatches cannot settle a bill", () => {
  const payment = { paymentKey: "BILL-1:0", billId: "BILL-1", storeId: "A", method: "Card", amountPaise: 1525 };
  for (const change of [{ amountPaise: 1500 }, { storeId: "B" }, { billId: "BILL-2" }, { method: "UPI" }, { paymentKey: "other" }, { approvalCode: "" }, { transactionReference: "" }, { status: "unresolved" }]) {
    assert.throws(() => validateTerminalResult({ ...approved(payment), ...change }, payment));
  }
});

test("split recovery keeps approved tenders and checks only the unfinished tender", async () => {
  let saved; const current = { ...bill(), payment: "Split", splitPayments: [{ method: "Card", amount: 10 }, { method: "UPI", amount: 5.25 }] };
  const persist = value => { saved = structuredClone(value); };
  await assert.rejects(collectTerminalPayments({ bill: current, storeId: "A", persist, invoke: async (action, payment) => payment.method === "Card" ? approved(payment) : { ...payment, status: "pending" } }));
  let calls = 0;
  await collectTerminalPayments({ bill: saved, storeId: "A", persist, invoke: async (action, payment) => {
    calls++; assert.equal(action, "recover"); assert.equal(payment.method, "UPI"); return approved(payment);
  } });
  assert.equal(calls, 1);
});

test("a durable native not-started result permits the initial dispatch on recovery", async () => {
  const current = bill(); current.terminalPayments = { 0: { status: "pending" } }; const actions = [];
  await collectTerminalPayments({ bill: current, storeId: "A", persist: () => {}, invoke: async (action, payment) => {
    actions.push(action); return action === "recover" ? { status: "not_started" } : approved(payment);
  } });
  assert.deepEqual(actions, ["recover", "pay"]);
});
