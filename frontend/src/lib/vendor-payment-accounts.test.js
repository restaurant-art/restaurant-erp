import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVendorPaymentFundingAccounts,
  normalizeVendorPaymentFundingAccount,
} from "./vendor-payment-accounts.js";

test("vendor payments offer cash, UPI, card, and active created bank accounts only", () => {
  const accounts = buildVendorPaymentFundingAccounts([
    { accountName: "HDFC Current", status: "Active" },
    { accountName: "ICICI Savings", status: "Inactive" },
    { accountName: "cash", status: "Active" },
    { accountName: "  Axis Bank  " },
  ]);

  assert.deepEqual(accounts, ["Cash", "UPI", "Card", "HDFC Current", "Axis Bank"]);
  assert.equal(accounts.includes("Bank"), false);
});

test("legacy or unavailable payment accounts fall back to cash", () => {
  const accounts = buildVendorPaymentFundingAccounts([{ accountName: "HDFC Current", status: "Active" }]);

  assert.equal(normalizeVendorPaymentFundingAccount("hdfc current", accounts), "HDFC Current");
  assert.equal(normalizeVendorPaymentFundingAccount("Bank", accounts), "Cash");
});
