import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomerLedgerActivity, customerCreditAmount, customerLedgerFor, ensureCustomerLedgers } from "./customer-ledger.js";
import { buildLedgerAccountReport } from "./ledger-report.js";
import { buildFinanceReport } from "./finance-reports.js";

const customer = { id: "CUS-1", name: "Asha", mobile: "9876543210" };
const contact = { customerKey: customer.mobile, customerName: customer.name, customerMobile: customer.mobile };
const bill = (patch = {}) => ({ id: "B1", orderNumber: "ORD-1", ...contact, total: 97, tax: 4.62, payment: "Cash", completedAt: "2026-10-26T10:00:00.000Z", ...patch });
const wallet = (patch = {}) => ({ id: "W1", ...contact, amount: 100, direction: "credit", source: "Wallet deposit", method: "Cash", date: "2026-10-25", ...patch });
const rounded = (value) => Math.round(value * 100) / 100;
const net = (rows) => rounded(rows.reduce((sum, row) => sum + row.debit - row.credit, 0));
const assertBalanced = (activity) => activity.journals.forEach((journal) => assert.equal(net(journal.lines), 0, journal.id));

test("customer creation creates one ledger before any sale and backfilling is idempotent", () => {
  const saved = [{ id: "M1", name: "My bank", type: "Asset" }];
  const first = ensureCustomerLedgers(saved, { customers: [customer] });
  assert.equal(first.length, 2);
  assert.equal(customerLedgerFor(first, customer).customerLedger, true);
  assert.equal(customerLedgerFor(first, customer).status, "Active");
  assert.deepEqual(ensureCustomerLedgers(first, { customers: [customer], salesLedger: [bill()] }), first);
  assert.equal(saved.length, 1, "does not mutate the caller's masters");
});

test("customers with the same name stay separate; renames preserve the ledger and history", () => {
  const first = ensureCustomerLedgers([], { customers: [customer, { id: "CUS-2", name: "Asha", mobile: "9999999999" }] });
  const oldLedger = customerLedgerFor(first, customer);
  const updated = ensureCustomerLedgers(first, { customers: [{ ...customer, name: "Asha Kumar", mobile: "8888888888" }] });
  const ledger = customerLedgerFor(updated, "8888888888");
  assert.equal(updated.length, 2);
  assert.equal(ledger.id, oldLedger.id);
  assert.equal(ledger.name, oldLedger.name);
  assert.equal(ledger.customerName, "Asha Kumar");
  assert.equal(customerLedgerFor(updated, customer.mobile).id, ledger.id);
});

test("CRM contact overrides keep the old and edited mobile attached to one ledger", () => {
  const masters = ensureCustomerLedgers([], { customers: [customer], overrides: [{ id: customer.mobile, values: ["Asha K", "+91 8888888888"] }], salesLedger: [bill()] });
  assert.equal(masters.length, 1);
  assert.equal(customerLedgerFor(masters, customer.mobile).id, customerLedgerFor(masters, "8888888888").id);
});

test("credit sale and partial settlement appear once, with the correct debit balance", () => {
  const settlement = { id: "S1", ...contact, amount: 40, method: "UPI", date: "2026-10-26", createdAt: "2026-10-26T11:00:00Z" };
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ payment: "Credit", creditAmount: 97 })], settlements: [settlement], receipts: [{ id: "CUSREC-S1", originId: "S1", customer: "Asha", amount: 40, status: "Received", creditAccount: "Accounts receivable" }] });
  assert.equal(net(activity.customerRows), 57);
  assert.equal(activity.customerRows.length, 2);
  assert.ok(activity.handledReceiptIds.has("CUSREC-S1"));
  assert.deepEqual(activity.customerRows.map((row) => row.source), ["Credit sale", "Credit settlement"]);
  assertBalanced(activity);
});

test("ordinary cash purchases show both sale and payment, without leaving credit due", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill()] });
  assert.equal(activity.customerRows.length, 2);
  assert.equal(net(activity.customerRows), 0);
  assertBalanced(activity);
});

test("100 tendered for a 97 sale credits 3 retained change, not a second 100 receipt", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ cashReceived: 100, walletChangeCredit: 3 })], walletEntries: [wallet({ amount: 3, source: "Change retained", orderNumber: "ORD-1" })] });
  assert.equal(net(activity.customerRows), -3);
  assert.equal(activity.customerRows.filter((row) => row.source === "Change retained").length, 1);
  assert.equal(activity.rows.filter((row) => row.account === "Cash").reduce((sum, row) => sum + row.debit, 0), 100);
  assertBalanced(activity);
});

test("wallet deposit and redemption consume prepaid money without double counting bill and wallet record", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ payment: "Wallet", total: 30, walletRedemption: 30 })], walletEntries: [wallet(), wallet({ id: "W2", amount: 30, direction: "debit", source: "Wallet redemption", method: "Wallet", orderNumber: "ORD-1" })], receipts: [{ id: "CUSREC-W1", originId: "W1", amount: 100, status: "Received", creditAccount: "Customer wallet liability" }] });
  assert.equal(net(activity.customerRows), -70);
  assert.equal(activity.customerRows.filter((row) => row.source === "Wallet redemption").length, 1);
  assert.equal(activity.customerRows.filter((row) => row.source.endsWith("payment")).length, 0);
  assertBalanced(activity);
});

test("split cash, card, wallet and credit payments reconcile to credit due minus wallet funds", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ total: 150.55, payment: "Split", walletRedemption: 25, creditAmount: 45.55, splitPayments: [{ method: "Cash", amount: 50 }, { method: "Card", amount: 30 }, { method: "Credit", amount: 45.55 }] })], walletEntries: [wallet({ amount: 100 })] });
  assert.equal(net(activity.customerRows), -29.45, "45.55 credit due less 75 wallet available");
  assertBalanced(activity);
});

test("historical sales and wallet movement fallbacks work and null creditAmount does not hide credit", () => {
  assert.equal(customerCreditAmount(bill({ payment: "Credit", creditAmount: null })), 97);
  assert.equal(customerCreditAmount(bill({ payment: "Split", splitPayments: [{ method: "Credit", amount: 7.25 }] })), 7.25);
  const activity = buildCustomerLedgerActivity({ salesLedger: [bill({ walletChangeCredit: 3 })] });
  assert.equal(activity.masters.length, 1);
  assert.equal(net(activity.customerRows), -3);
  assertBalanced(activity);
});

test("cancelled movements, their receipt copies, and invalid amounts do not revive transactions", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ status: "Cancelled" })], walletEntries: [wallet({ status: "Reversed" }), wallet({ id: "W2", amount: -30 })], receipts: [{ id: "CUSREC-W1", originId: "W1", customer: "Asha", status: "Received", amount: 100, creditAccount: "Customer wallet liability" }] });
  assert.equal(activity.customerRows.length, 0);
  assert.ok(activity.handledReceiptIds.has("CUSREC-W1"));
});

test("manual customer receipts resolve only an unambiguous customer and keep other receipts untouched", () => {
  const receipt = { id: "R1", customer: "Asha", amount: 20, status: "Received", creditAccount: "Accounts receivable", method: "Card", date: "2026-10-26" };
  const activity = buildCustomerLedgerActivity({ customers: [customer], receipts: [receipt] });
  assert.equal(net(activity.customerRows), -20);
  assert.ok(activity.handledReceiptIds.has("R1"));
  const ambiguous = buildCustomerLedgerActivity({ customers: [customer, { name: "Asha", mobile: "9999999999" }], receipts: [receipt] });
  assert.equal(ambiguous.customerRows.length, 0);
  assert.equal(ambiguous.handledReceiptIds.size, 0);
  assertBalanced(activity);
});

test("refunds, customer statements and ledger running balances include complete activity", () => {
  const activity = buildCustomerLedgerActivity({ customers: [customer], salesLedger: [bill({ payment: "Credit" })], refundLedger: [{ id: "REF1", billId: "B1", amount: 10, taxAmount: 0.48, payment: "Credit", createdAt: "2026-10-26T11:00:00Z" }] });
  assert.equal(net(activity.customerRows), 87);
  const report = buildLedgerAccountReport(activity.rows, { account: activity.masters[0].name });
  assert.equal(report.rows.at(-1).balance, 87);
  const statement = buildFinanceReport("Customer Statement", { customerLedgerRows: activity.customerRows });
  assert.deepEqual(statement.columns.slice(-2), ["Debit", "Credit"]);
  assert.equal(statement.records.length, 2);
  assertBalanced(activity);
});

test("direct ledger receipts and posted manual adjustments appear in the customer statement", () => {
  const masters = ensureCustomerLedgers([], { customers: [customer] });
  const account = masters[0].name;
  const activity = buildCustomerLedgerActivity({ customers: [customer], ledgerMasters: masters,
    receipts: [{ id: "R1", creditAccount: account, debitAccount: "Bank", amount: 15.5, status: "Received", date: "2026-10-26" }],
    manualLedgerRows: [{ account, debit: 5.25, credit: 0, source: "Journal", reference: "J1", date: "2026-10-26" }, { account: "Bank", debit: 0, credit: 5.25 }],
  });
  assert.equal(net(activity.customerRows), -10.25);
  assert.equal(activity.customerRows.length, 2);
  assert.equal(activity.customerRows[1].customerKey, customer.mobile);
  assert.equal(activity.rows.length, 2, "manual journals are not duplicated in the general ledger projection");
  assert.ok(activity.handledReceiptIds.has("R1"));
  assertBalanced(activity);
});
