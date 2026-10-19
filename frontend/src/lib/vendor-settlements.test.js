import test from "node:test";
import assert from "node:assert/strict";
import { buildPurchasePayables, paymentMatchesPurchase, settlementSearch } from "./vendor-settlements.js";

test("payment details use purchase ID first and support legacy vendor/invoice links", () => {
  const purchase = { id: "PUR-1", supplier: "Vendor A", invoice: "INV-1" };
  assert.ok(paymentMatchesPurchase({ purchaseId: "PUR-1" }, purchase));
  assert.ok(paymentMatchesPurchase({ vendor: " vendor a ", invoice: "inv-1" }, purchase));
  assert.equal(paymentMatchesPurchase({ vendor: "Vendor B", invoice: "INV-1" }, purchase), false);
  assert.equal(paymentMatchesPurchase({ purchaseId: "PUR-2", vendor: "Vendor A", invoice: "INV-1" }, purchase), false);
});

test("settlement search finds vendor, invoice, payment method and reference", () => {
  const payment = { vendor: "QA Supplier", invoice: "INV-1", method: "UPI", reference: "REF-234", note: "First instalment" };
  for (const query of ["", "supplier", "inv-1", "upi ref-234", "instalment"]) assert.ok(settlementSearch(payment, query));
  assert.equal(settlementSearch(payment, "other vendor"), false);
});

test("posted purchase lines become one payable without creating a payment", () => {
  const transactions = [
    { type: "Purchase", purchaseId: "PUR-1", supplier: "Vendor A", invoice: "INV-1", total: 100, quantity: 2, date: "2026-10-16" },
    { type: "Purchase", purchaseId: "PUR-1", supplier: "Vendor A", invoice: "INV-1", total: 50, quantity: 1, date: "2026-10-16" },
    { type: "Purchase Return", purchaseId: "PUR-1", total: 20 },
    { type: "Purchase", status: "Cancelled", purchaseId: "PUR-2", total: 80 },
    { status: "Draft", entry: { invoice: "DRAFT-1", lines: [] } },
  ];
  const purchases = buildPurchasePayables(transactions, []);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].itemCount, 2);
  assert.equal(purchases[0].total, 150);
  assert.equal(purchases[0].paid, 0);
  assert.equal(purchases[0].balance, 150);
  assert.equal(purchases[0].settlementStatus, "Unpaid");
});

test("purchase balances combine linked and legacy payments and exclude pending or reversed payments", () => {
  const transactions = [{ type: "Purchase", purchaseId: "PUR-1", supplier: "Vendor A", invoice: "INV-1", total: 150 }];
  const payments = [
    { purchaseId: "PUR-1", amount: 40, status: "Paid" },
    { vendor: "vendor a", invoice: "inv-1", amount: 30, status: "Paid" },
    ...["Cancelled", "Reversed", "Pending"].map((status) => ({ purchaseId: "PUR-1", amount: 90, status })),
    { purchaseId: "OTHER", vendor: "Vendor A", invoice: "INV-1", amount: 90, status: "Paid" },
  ];
  const [partial] = buildPurchasePayables(transactions, payments);
  assert.equal(partial.paid, 70);
  assert.equal(partial.balance, 80);
  assert.equal(partial.settlementStatus, "Partially paid");
  const [settled] = buildPurchasePayables(transactions, [...payments, { purchaseId: "PUR-1", amount: 80, status: "Paid" }]);
  assert.equal(settled.balance, 0);
  assert.equal(settled.settlementStatus, "Paid");
  assert.equal(buildPurchasePayables([], payments).length, 0);
});
