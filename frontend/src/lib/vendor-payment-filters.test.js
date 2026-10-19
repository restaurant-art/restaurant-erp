import test from "node:test";
import assert from "node:assert/strict";
import { matchesVendorPaymentScope, filterVendorPaymentHistory, withPaymentPurchaseNumbers } from "./vendor-payment-filters.js";

test("purchase numbers prefer saved links and resolve only unique vendor/invoice matches", () => {
  const purchases = [{ id: "PUR-1", supplier: "Vendor A", invoice: "INV-1" }, { id: "PUR-2", supplier: "Vendor B", invoice: "INV-1" }];
  const original = { vendor: " vendor a ", invoice: "inv-1" };
  const rows = withPaymentPurchaseNumbers([{ ...original, purchaseId: "PUR-saved" }, original, { vendor: "Vendor C", invoice: "INV-1" }, { vendor: "Vendor A" }], purchases);
  assert.deepEqual(rows.map((row) => row.purchaseNumber), ["PUR-saved", "PUR-1", "", ""]);
  assert.equal(original.purchaseNumber, undefined);
  assert.equal(filterVendorPaymentHistory(rows, { query: "PUR-1" }).length, 1);
  assert.equal(withPaymentPurchaseNumbers([original], [...purchases, { id: "PUR-3", supplier: "Vendor A", invoice: "INV-1" }])[0].purchaseNumber, "");
});

const payments = [
  { vendor: "Vendor A", invoice: "INV-1", date: "2026-10-16", status: "Paid", method: "Bank", amount: 100 },
  { vendor: "Vendor B", invoice: "INV-2", date: "2026-10-17", status: "Pending", method: "Cash", amount: 50 },
  { vendor: "Vendor A", invoice: "INV-3", date: "2026-10-17", status: "Cancelled", method: "UPI", amount: 75 },
];
test("vendor selector matches exact normalized vendor for bills and history", () => {
  assert.equal(filterVendorPaymentHistory(payments, { vendor: " vendor a " }).length, 2);
  assert.equal(matchesVendorPaymentScope({ supplier: "Vendor A", date: "2026-10-16" }, { vendor: "vendor a" }), true);
  assert.equal(filterVendorPaymentHistory(payments, { vendor: "vendor" }).length, 0);
});
test("all vendors and cleared filters restore every record", () => {
  assert.equal(filterVendorPaymentHistory(payments, { vendor: "", status: "All", method: "All" }).length, 3);
});
test("date, search, payment status and method can be combined", () => {
  assert.deepEqual(filterVendorPaymentHistory(payments, { vendor: "Vendor A", query: "INV-1", status: "Paid", method: "Bank", from: "2026-10-16", to: "2026-10-16" }), [payments[0]]);
  assert.equal(filterVendorPaymentHistory(payments, { vendor: "Vendor A", from: "2026-10-17", status: "Paid" }).length, 0);
});
test("payment-history filters do not hide bills or alter their settlement balances", () => {
  const bill = { supplier: "Vendor A", invoice: "INV-1", date: "2026-10-16", total: 100, paid: 40, balance: 60 };
  assert.equal(matchesVendorPaymentScope(bill, { vendor: "vendor a", method: "Cash", status: "Pending" }), true);
  assert.equal(bill.balance, 60);
});
