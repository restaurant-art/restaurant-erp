import test from "node:test";
import assert from "node:assert/strict";
import { buildFilteredLedgerActivity, ledgerVendorOptions } from "./ledger-vendor-filter.js";

const rows = [
  { date: "2026-10-01", reference: "1", account: "Bank", debit: 1000, credit: 0 },
  { date: "2026-10-02", reference: "2", account: "Bank", vendor: "Vendor A", debit: 0, credit: 100 },
  { date: "2026-10-03", reference: "3", account: "Bank", vendor: "Vendor B", debit: 0, credit: 200 },
  { date: "2026-10-04", reference: "4", account: "Bank", vendor: "Vendor A", debit: 0, credit: 50 },
  { date: "2026-10-04", reference: "4", account: "Accounts payable", vendor: "Vendor A", debit: 50, credit: 0 },
];

test("vendor options include masters and historical payments without duplicate names", () => {
  assert.deepEqual(ledgerVendorOptions([{ name: "Vendor A" }, { name: "New vendor" }], [{ vendor: " vendor a " }, { vendor: "Old vendor" }]).map((item) => item.label), ["New vendor", "Old vendor", "Vendor A"]);
});
test("selected vendor keeps both accounting sides and excludes other vendors from balances", () => {
  const result = buildFilteredLedgerActivity(rows, { vendor: "vendor a", from: "2026-10-04" });
  assert.equal(result.ledgerRows.length, 2);
  assert.equal(result.ledgerRows[0].balance, -150);
  assert.equal(result.ledgerRows[1].balance, 50);
  assert.equal(rows[0].balance, undefined);
});
test("all vendors restores all activity and search still applies", () => {
  assert.equal(buildFilteredLedgerActivity(rows).ledgerRows.length, 5);
  assert.equal(buildFilteredLedgerActivity(rows).runningBalances.Bank, 650);
  assert.equal(buildFilteredLedgerActivity(rows, { vendor: "vendor a", query: "payable" }).ledgerRows.length, 1);
  assert.equal(buildFilteredLedgerActivity(rows, { vendor: "new vendor" }).ledgerRows.length, 0);
});
