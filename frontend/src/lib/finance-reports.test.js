import test from "node:test";
import assert from "node:assert/strict";
import { buildFinanceReport, financeReportNames, summarizeFinanceReport } from "./finance-reports.js";

test("finance reports catalog includes all core reports without duplicates", () => {
  assert.equal(financeReportNames.length, 31);
  assert.equal(new Set(financeReportNames).size, financeReportNames.length);
  for (const name of ["Trial Balance", "Balance Sheet", "Profit & Loss", "Ledger Report", "Cash Flow Statement", "GST Sales Register", "Vendor Statement", "Stock Ledger"]) assert.ok(financeReportNames.includes(name));
});

test("every finance report has a real report schema and filter configuration", () => {
  for (const name of financeReportNames) {
    const report = buildFinanceReport(name, {});
    assert.ok(report.columns.length >= 3, `${name} must expose report columns`);
    assert.ok(Array.isArray(report.records), `${name} must expose report records`);
    assert.ok(Array.isArray(report.filterOptions), `${name} must expose report filters`);
    assert.notDeepEqual(report.columns, ["Date", "Details"], `${name} must not use the placeholder report`);
  }
});

test("trial balance groups ledger debits and credits and recalculates filtered totals", () => {
  const report = buildFinanceReport("Trial Balance", { ledgerRows: [
    { account: "Cash", debit: 1000, credit: 0 },
    { account: "Sales", debit: 0, credit: 1000 },
  ] });
  assert.equal(report.records.length, 2);
  assert.match(report.records[0].cells[1], /1,000/);
  const totals = summarizeFinanceReport(report, report.records.slice(0, 1));
  assert.match(totals[1], /1,000/);
  assert.match(totals[2], /0/);
});

test("profit and loss calculates net result from sales, refunds, and expenses", () => {
  const report = buildFinanceReport("Profit & Loss", {
    salesLedger: [{ total: 1000 }],
    refundLedger: [{ amount: 100 }],
    expenses: [{ date: "2026-10-21", category: "Rent", amount: 250, status: "Posted" }],
  });
  const result = report.records.find((entry) => entry.cells[1] === "Net profit / loss");
  assert.ok(result);
  assert.match(result.cells[2], /650/);
});

test("profit uses posted cost, refund GST, and one result in the footer", () => {
  const data = {
    salesLedger: [{ id: "sale", total: 54, tax: 2.57 }],
    refundLedger: [{ amount: 10.5, taxAmount: 0.5 }],
    expenses: [{ amount: 5, status: "Posted" }],
    requirePostedCosts: true,
    postedSaleCosts: { sale: { cost: "42.00000000", complete: true } },
  };
  const report = buildFinanceReport("Profit & Loss", data);
  assert.equal(report.records.at(-1).rawValues[2].toFixed(2), "-5.57");
  assert.equal(summarizeFinanceReport(report)[2], report.records.at(-1).cells[2]);
  const pending = buildFinanceReport("Profit & Loss", { ...data, postedSaleCosts: {} });
  assert.match(pending.records.at(-1).cells[1], /cost pending/);
  assert.equal(summarizeFinanceReport(pending)[2], "—");
});

test("finance report periods recalculate aggregated reports from source records", () => {
  const data = {
    salesLedger: [
      { date: "2026-09-30", total: 1000, payment: "Cash" },
      { date: "2026-10-20", total: 500, payment: "UPI" },
    ],
    refundLedger: [{ date: "2026-10-21", amount: 50 }],
    expenses: [
      { date: "2026-09-30", category: "Rent", amount: 200, status: "Posted" },
      { date: "2026-10-21", category: "Transport", amount: 100, status: "Posted" },
    ],
  };
  const period = { from: "2026-10-01", to: "2026-10-31" };
  const profitAndLoss = buildFinanceReport("Profit & Loss", data, period);
  assert.match(profitAndLoss.records.find((entry) => entry.cells[1] === "Net profit / loss").cells[2], /350/);
  const paymentMode = buildFinanceReport("Sales by Payment Mode", data, period);
  assert.deepEqual(paymentMode.records.map((entry) => entry.cells[0]), ["UPI"]);
  assert.match(paymentMode.records[0].cells[2], /500/);
});

test("trial balance uses the selected end date as an as-of report", () => {
  const report = buildFinanceReport("Trial Balance", { ledgerRows: [
    { date: "2026-09-01", account: "Cash", debit: 100, credit: 0 },
    { date: "2026-11-01", account: "Cash", debit: 200, credit: 0 },
  ] }, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(report.records.length, 1);
  assert.match(report.records[0].cells[1], /100/);
});

test("GST purchase register groups purchase lines into invoice totals", () => {
  const report = buildFinanceReport("GST Purchase Register", { purchaseTransactions: [
    { type: "Purchase", purchaseId: "P-1", invoice: "INV-1", supplier: "Vendor One", date: "2026-10-21", subtotal: 100, tax: 18, total: 118, quantity: 1 },
    { type: "Purchase", purchaseId: "P-1", invoice: "INV-1", supplier: "Vendor One", date: "2026-10-21", subtotal: 200, tax: 36, total: 236, quantity: 2 },
  ] });
  assert.equal(report.records.length, 1);
  assert.equal(report.records[0].cells[1], "Vendor One");
  assert.match(report.records[0].cells[5], /354/);
});
