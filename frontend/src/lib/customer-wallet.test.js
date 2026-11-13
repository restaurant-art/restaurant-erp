import test from "node:test";
import assert from "node:assert/strict";
import { customerWalletBalance, createWalletEntry } from "./customer-wallet.js";

test("wallet balance combines retained change and redemptions", () => {
  const entries = [
    { customerKey: "1111111111", direction: "credit", amount: 3, source: "Change retained" },
    { customerKey: "1111111111", direction: "debit", amount: 3, source: "Wallet redemption" },
  ];
  assert.equal(customerWalletBalance(entries, "1111111111"), 0);
});

test("wallet balance supports top-ups, cents, and per-customer separation", () => {
  const entries = [
    { customerKey: "1111111111", direction: "credit", amount: 50 },
    { customerKey: "1111111111", direction: "debit", amount: 12.5 },
    { customerKey: "2222222222", direction: "credit", amount: 90 },
  ];
  assert.equal(customerWalletBalance(entries, "1111111111"), 37.5);
  assert.equal(customerWalletBalance(entries, "2222222222"), 90);
});

test("wallet balances never become negative and ignore invalid entries", () => {
  const entries = [
    { customerKey: "1111111111", direction: "debit", amount: 4 },
    { customerKey: "1111111111", direction: "credit", amount: "invalid" },
    { customerKey: "1111111111", direction: "credit", amount: -2 },
  ];
  assert.equal(customerWalletBalance(entries, "1111111111"), 0);
});

test("wallet ledger entry keeps a normalized customer identity and amount", () => {
  const entry = createWalletEntry({
    customer: { name: "Asha", mobile: "+91 98765 43210" },
    direction: "credit",
    amount: 3.129,
    source: "Change retained",
  });
  assert.equal(entry.customerKey, "9876543210");
  assert.equal(entry.customerMobile, "9876543210");
  assert.equal(entry.amount, 3.13);
});

test("cancelled wallet credits and reversed debits do not change available funds", () => {
  const entries = [
    { customerKey: "1111111111", direction: "credit", amount: 100 },
    { customerKey: "1111111111", direction: "credit", amount: 900, status: "Cancelled" },
    { customerKey: "1111111111", direction: "debit", amount: 50, status: "Reversed" },
  ];
  assert.equal(customerWalletBalance(entries, "1111111111"), 100);
});
