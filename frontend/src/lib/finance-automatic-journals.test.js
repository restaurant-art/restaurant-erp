import test from "node:test";
import assert from "node:assert/strict";
import { buildAutomaticFinanceJournals } from "./finance-automatic-journals.js";

test("finance transactions become balanced automatic journal entries", () => {
  const entries = buildAutomaticFinanceJournals({
    receipts: [{ id: "R1", date: "2026-10-21", customer: "Guest", purpose: "Food sales", amount: 500, debitAccount: "Cash", creditAccount: "Sales", status: "Received" }],
    expenses: [{ id: "E1", date: "2026-10-20", category: "Rent", amount: 200, paidFrom: "Cash", status: "Posted" }],
    vendorPayments: [{ id: "V1", date: "2026-10-19", vendor: "Fresh Foods", amount: 125, creditAccount: "UPI", status: "Partially paid" }],
    bankAccounts: [{ id: "B1", accountName: "Current account", bankName: "Bank", openingBalance: 1000, createdAt: "2026-10-18T10:00:00.000Z", status: "Active" }],
  });

  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((entry) => entry.source), ["Receipt", "Expense", "Vendor payment", "Opening balance"]);
  entries.forEach((entry) => {
    assert.equal(entry.automatic, true);
    assert.equal(entry.status, "Posted");
    assert.equal(entry.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0), entry.amount);
    assert.equal(entry.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0), entry.amount);
  });
  assert.deepEqual(entries.find((entry) => entry.source === "Expense").lines.map((line) => line.account), ["Expense - Rent", "Cash"]);
  assert.deepEqual(entries.find((entry) => entry.source === "Vendor payment").lines.map((line) => line.account), ["Accounts payable", "UPI"]);
  assert.deepEqual(entries.find((entry) => entry.source === "Opening balance").lines.map((line) => line.account), ["Current account", "Owner capital"]);
});

test("pending and reversed source records stay visible without posting, and empty amounts are ignored", () => {
  const entries = buildAutomaticFinanceJournals({
    receipts: [
      { id: "R-PENDING", date: "2026-10-21", amount: 100, status: "Pending" },
      { id: "R-REVERSED", date: "2026-10-20", amount: 50, status: "Reversed" },
    ],
    expenses: [{ id: "E-ZERO", date: "2026-10-19", category: "Rent", amount: 0, status: "Posted" }],
  });

  assert.deepEqual(entries.map((entry) => [entry.id, entry.status]), [
    ["AUTO-RECEIPT-R-PENDING", "Draft"],
    ["AUTO-RECEIPT-R-REVERSED", "Review"],
  ]);
});

test("automatic journal IDs remain stable so edits replace the displayed source entry", () => {
  const first = buildAutomaticFinanceJournals({ expenses: [{ id: "E1", date: "2026-10-21", category: "Rent", amount: 200, status: "Posted" }] });
  const edited = buildAutomaticFinanceJournals({ expenses: [{ id: "E1", date: "2026-10-21", category: "Rent", amount: 250, status: "Posted" }] });

  assert.equal(first[0].id, edited[0].id);
  assert.equal(edited[0].amount, 250);
});
