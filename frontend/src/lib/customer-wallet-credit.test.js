import test from "node:test";
import assert from "node:assert/strict";
import { addCustomerWalletCredit, customerAccountBalances, customerAccountBalanceFor, isWalletCreditSettlement, reconcileCustomerWalletCredit, walletDepositAllocation } from "./customer-wallet-credit.js";
import { buildCustomerLedgerActivity } from "./customer-ledger.js";
import { customerWalletBalance } from "./customer-wallet.js";
import { buildLedgerAccountReport } from "./ledger-report.js";
import { buildFinanceReport } from "./finance-reports.js";

const customer = { id: "C1", name: "Asha", mobile: "9876543210" };
const contact = { customerKey: customer.mobile, customerName: customer.name, customerMobile: customer.mobile };
const sale = (patch = {}) => ({ id: "B1", orderNumber: "ORD-1", ...contact, total: 500, payment: "Credit", completedAt: "2026-10-26T09:00:00.000Z", ...patch });
const deposit = (patch = {}) => ({ id: "W1", ...contact, direction: "credit", amount: 1000, source: "Wallet deposit", method: "Cash", date: "2026-10-27", createdAt: "2026-10-27T10:00:00.000Z", ...patch });
const store = (patch = {}) => ({ customers: [customer], overrides: [], settlements: [], walletEntries: [], ...patch });
const account = (data, sales = [sale()], refunds = []) => customerAccountBalanceFor(customerAccountBalances(data, sales, refunds), customer);
const net = (rows) => Math.round(rows.reduce((sum, row) => sum + row.debit - row.credit, 0) * 100) / 100;

test("1000 deposit clears 500 credit and leaves 500 in the wallet with linked audit entries", () => {
  const original = store();
  const result = addCustomerWalletCredit(original, deposit(), [sale()]);
  const balance = account(result.store);
  assert.equal(balance.balance, 0);
  assert.equal(balance.walletBalance, 500);
  assert.equal(balance.settled, 500);
  assert.deepEqual(result.allocations, [{ customerKey: customer.mobile, amount: 500, creditBalance: 0, walletBalance: 500 }]);
  assert.equal(original.walletEntries.length, 0, "does not mutate the previous snapshot");
  assert.equal(result.store.walletEntries.find((entry) => entry.id === "W1").amount, 1000, "preserves the full receipt");
  const settlement = result.store.settlements[0];
  const debit = result.store.walletEntries.find((entry) => entry.id === settlement.walletDebitId);
  assert.equal(debit.settlementId, settlement.id);
  assert.equal(debit.amount, 500);
  assert.equal(debit.direction, "debit");
  assert.equal(settlement.method, "Wallet");
  assert.equal(isWalletCreditSettlement(settlement), true);
  assert.equal(settlement.reference, debit.reference);
  assert.equal(customerWalletBalance(result.store.walletEntries, customer.mobile), 500);
});

test("smaller, exact, and excess deposits pay no more than the credit due", () => {
  for (const [amount, due, wallet, settled] of [[200, 300, 0, 200], [500, 0, 0, 500], [700, 0, 200, 500]]) {
    const result = addCustomerWalletCredit(store(), deposit({ amount }), [sale()]);
    const balance = account(result.store);
    assert.equal(balance.balance, due);
    assert.equal(balance.walletBalance, wallet);
    assert.equal(balance.settled, settled);
    assert.equal(balance.balance - balance.walletBalance, 500 - amount);
  }
});

test("no credit means the full deposit remains available, without an unnecessary settlement", () => {
  const result = addCustomerWalletCredit(store(), deposit(), []);
  assert.equal(account(result.store, []).walletBalance, 1000);
  assert.equal(result.allocations.length, 0);
  assert.equal(result.store.settlements.length, 0);
  assert.equal(result.store.walletEntries.length, 1);
});

test("existing wallet funds, prior repayments, and decimal amounts are reconciled exactly", () => {
  const saved = store({ walletEntries: [deposit({ id: "W0", amount: 50.25 })], settlements: [{ id: "S0", ...contact, amount: 100.10, method: "UPI" }] });
  const sales = [sale({ total: 500.60 })];
  const result = addCustomerWalletCredit(saved, deposit({ amount: 1000 }), sales);
  const balance = account(result.store, sales);
  assert.equal(result.allocations[0].amount, 400.50);
  assert.equal(balance.walletBalance, 649.75);
  assert.equal(balance.balance, 0);
  assert.equal(balance.settled, 500.60);
  assert.deepEqual(walletDepositAllocation({ creditBalance: 400.50, walletBalance: 50.25, amount: 1000 }), { settled: 400.50, creditBalance: 0, walletBalance: 649.75 });
});

test("reloading and replaying the same deposit does not duplicate funds or settlements", () => {
  const first = addCustomerWalletCredit(store(), deposit(), [sale()]);
  const reload = JSON.parse(JSON.stringify(first.store));
  const next = addCustomerWalletCredit(reload, deposit(), [sale()]);
  assert.strictEqual(next.store, reload);
  assert.equal(next.allocations.length, 0);
  assert.deepEqual(next.store, first.store);
  assert.strictEqual(reconcileCustomerWalletCredit(next.store, [sale()]).store, next.store);
});

test("existing balances reconcile once and the same snapshot gives deterministic linked IDs", () => {
  const original = store({ walletEntries: [deposit()] });
  const first = reconcileCustomerWalletCredit(original, [sale()]);
  const onAnotherRegister = reconcileCustomerWalletCredit(JSON.parse(JSON.stringify(original)), [sale()]);
  assert.deepEqual(first, onAnotherRegister);
  assert.strictEqual(reconcileCustomerWalletCredit(first.store, [sale()]).store, first.store);
});

test("future credit purchases use the remaining wallet and later deposits clear the remaining due", () => {
  const first = addCustomerWalletCredit(store(), deposit(), [sale()]).store;
  const sales = [sale(), sale({ id: "B2", total: 700, completedAt: "2026-10-28T09:00:00Z" })];
  const second = reconcileCustomerWalletCredit(first, sales).store;
  assert.equal(account(second, sales).balance, 200);
  assert.equal(account(second, sales).walletBalance, 0);
  const third = addCustomerWalletCredit(second, deposit({ id: "W2", amount: 300 }), sales).store;
  assert.equal(account(third, sales).balance, 0);
  assert.equal(account(third, sales).walletBalance, 100);
  assert.equal(third.settlements.length, 3);
});

test("wallet change retained from a sale also clears existing credit", () => {
  const result = addCustomerWalletCredit(store(), deposit({ amount: 3, source: "Change retained", orderNumber: "ORD-2" }), [sale()]);
  assert.equal(account(result.store).balance, 497);
  assert.equal(account(result.store).walletBalance, 0);
});

test("customers sharing a name stay separate and an edited phone retains its account", () => {
  const other = { id: "C2", name: "Asha", mobile: "8888888888" };
  const sales = [sale(), sale({ id: "B2", customerKey: other.mobile, customerMobile: other.mobile, total: 250 })];
  const result = addCustomerWalletCredit(store({ customers: [customer, other] }), deposit(), sales);
  const otherBalance = customerAccountBalanceFor(customerAccountBalances(result.store, sales), other);
  assert.equal(otherBalance.balance, 250);
  assert.equal(otherBalance.walletBalance, 0);
  const edited = store({ overrides: [{ id: customer.mobile, values: ["Asha K", "+91 7777777777"] }] });
  const updated = addCustomerWalletCredit(edited, deposit({ customerKey: "7777777777", customerName: "Asha K", customerMobile: "7777777777" }), [sale()]);
  const balances = customerAccountBalances(updated.store, [sale()]);
  assert.equal(balances.length, 1);
  assert.equal(customerAccountBalanceFor(balances, "7777777777").balance, 0);
  assert.equal(customerAccountBalanceFor(balances, customer.mobile).walletBalance, 500);
});

test("cancelled movements and duplicate IDs do not affect the allocation", () => {
  const saved = store({
    settlements: [{ id: "S1", ...contact, amount: 500, status: "Reversed" }],
    walletEntries: [deposit({ id: "W0", amount: 900, status: "Cancelled" })],
  });
  const sales = [sale(), sale(), sale({ id: "B2", total: 300, status: "Draft" })];
  const result = addCustomerWalletCredit(saved, deposit(), sales);
  assert.equal(account(result.store, sales).balance, 0);
  assert.equal(account(result.store, sales).walletBalance, 500);
  assert.equal(result.allocations[0].amount, 500);
});

test("credit refunds and split credit portions reduce the amount to settle", () => {
  const sales = [sale({ payment: "Split", total: 700, creditAmount: null, splitPayments: [{ method: "Cash", amount: 200 }, { method: "Credit", amount: 500 }] })];
  const refunds = [{ id: "R1", billId: "B1", amount: 100, payment: "Credit", createdAt: "2026-10-26T12:00:00Z" }];
  const result = addCustomerWalletCredit(store(), deposit(), sales, refunds);
  assert.equal(result.allocations[0].amount, 400);
  assert.equal(account(result.store, sales, refunds).balance, 0);
  assert.equal(account(result.store, sales, refunds).walletBalance, 600);
});

test("invalid deposits leave the store untouched", () => {
  const saved = store();
  for (const transaction of [null, deposit({ id: "" }), deposit({ direction: "debit" }), deposit({ amount: -1 }), deposit({ amount: NaN }), deposit({ amount: 0 })]) {
    assert.strictEqual(addCustomerWalletCredit(saved, transaction, [sale()]).store, saved);
  }
});

test("ledger records the deposit and both adjustment legs without a second cash receipt", () => {
  const sales = [sale()];
  const result = addCustomerWalletCredit(store(), deposit(), sales);
  const receipts = [{ id: "CUSREC-W1", originId: "W1", ...contact, amount: 1000, status: "Received", creditAccount: "Customer wallet liability", debitAccount: "Cash", date: "2026-10-27" }];
  const activity = buildCustomerLedgerActivity({ ...result.store, salesLedger: sales, receipts });
  assert.deepEqual(activity.customerRows.map((row) => row.source), ["Credit sale", "Wallet deposit", "Wallet applied to credit", "Credit settled from wallet"]);
  assert.equal(net(activity.customerRows), -500, "the customer now has a 500 credit balance with the shop");
  assert.equal(activity.rows.filter((row) => row.account === "Cash").reduce((sum, row) => sum + row.debit, 0), 1000);
  assert.equal(activity.rows.filter((row) => row.account === "Wallet").length, 0, "an internal transfer creates no new funding account");
  assert.equal(result.store.settlements.filter((entry) => !isWalletCreditSettlement(entry)).length, 0, "Finance receipt backfill excludes the internal settlement");
  assert.ok(activity.handledReceiptIds.has("CUSREC-W1"));
  activity.journals.forEach((journal) => assert.equal(net(journal.lines), 0, journal.id));
  const statement = buildFinanceReport("Customer Statement", { customerLedgerRows: activity.customerRows });
  assert.equal(statement.records.length, 4);
  const report = buildLedgerAccountReport(activity.rows, { account: activity.masters[0].name });
  assert.equal(report.rows.at(-1).balance, -500);
  assert.deepEqual(buildCustomerLedgerActivity({ ...JSON.parse(JSON.stringify(result.store)), salesLedger: sales, receipts }).customerRows, activity.customerRows);
});

test("deposit previews cover partial and zero-due balances without negative funds", () => {
  assert.deepEqual(walletDepositAllocation({ creditBalance: 500, amount: 200 }), { settled: 200, creditBalance: 300, walletBalance: 0 });
  assert.deepEqual(walletDepositAllocation({ walletBalance: 50, amount: 1000 }), { settled: 0, creditBalance: 0, walletBalance: 1050 });
  assert.deepEqual(walletDepositAllocation({ creditBalance: 500, amount: -100 }), { settled: 0, creditBalance: 500, walletBalance: 0 });
});
