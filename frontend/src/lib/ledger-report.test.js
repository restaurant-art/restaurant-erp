import test from "node:test";
import assert from "node:assert/strict";
import { buildLedgerAccountReport, filterLedgerReportAccounts, ledgerReportAccountOptions, ledgerReportDatePreset } from "./ledger-report.js";

test("ledger account options combine active masters and transaction accounts", () => {
  const options = ledgerReportAccountOptions([{ account: "Cash" }, { account: "Bank" }], [{ name: "Sales", status: "Active" }, { name: "Old", status: "Inactive" }, { name: "cash", status: "Active" }]);
  assert.deepEqual(options, ["Bank", "Cash", "Sales"]);
});

test("ledger account search filters options without changing their display names", () => {
  const accounts = ["Accounts payable", "Bank", "Cash", "GST input", "Sales"];
  assert.deepEqual(filterLedgerReportAccounts(accounts, "acc"), ["Accounts payable"]);
  assert.deepEqual(filterLedgerReportAccounts(accounts, "s"), ["Accounts payable", "Cash", "GST input", "Sales"]);
  assert.deepEqual(filterLedgerReportAccounts(accounts, "  BANK "), ["Bank"]);
  assert.deepEqual(filterLedgerReportAccounts(accounts, ""), accounts);
});

test("ledger report applies account, date, direction, party, type, and amount filters", () => {
  const rows = [
    { date: "2026-09-30", account: "Cash", debit: 100, credit: 0, source: "Opening balance", details: "Opening" },
    { date: "2026-10-02", account: "Cash", debit: 500, credit: 0, source: "Receipt", party: "Alpha", reference: "R-1" },
    { date: "2026-10-03", account: "Cash", debit: 0, credit: 200, source: "Expense", party: "Alpha", reference: "E-1" },
    { date: "2026-10-04", account: "Bank", debit: 900, credit: 0, source: "Receipt", party: "Alpha" },
  ];
  const report = buildLedgerAccountReport(rows, { account: "Cash", from: "2026-10-01", to: "2026-10-31", party: "alpha", transactionType: "Receipt", direction: "Debit", minimum: "400", maximum: "600" });
  assert.equal(report.openingBalance, 100);
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].reference, "R-1");
  assert.equal(report.closingBalance, 600);
});

test("ledger report date presets support previous month and Indian financial year", () => {
  assert.deepEqual(ledgerReportDatePreset("Previous month", new Date("2026-10-21T12:00:00")), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(ledgerReportDatePreset("Financial year to date", new Date("2026-02-15T12:00:00")), { from: "2025-04-01", to: "2026-02-15" });
});
