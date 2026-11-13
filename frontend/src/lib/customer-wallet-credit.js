import { customerRecordKey } from "./crm-customers.js";
import { customerCreditAmount, customerLedgerFor, ensureCustomerLedgers } from "./customer-ledger.js";

const text = (value) => String(value ?? "").trim();
const paise = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * 100)) : 0;
const posted = (entry) => !["cancelled", "canceled", "reversed", "draft", "void", "voided"].includes(text(entry.status).toLowerCase());
const hash = (value) => [...value].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36);
const distinct = (entries) => [...new Map(entries.map((entry) => [entry.id || JSON.stringify(entry), entry])).values()];

export function isWalletCreditSettlement(entry) {
  return Boolean(entry.walletDebitId || entry.source === "Wallet credit settlement");
}

export function customerAccountBalances(customerStore, salesLedger = [], refundLedger = []) {
  const { customers = [], settlements = [], walletEntries = [], overrides = [] } = customerStore;
  const masters = ensureCustomerLedgers([], { customers, settlements, walletEntries, overrides, salesLedger });
  return masters.filter((ledger) => ledger.customerLedger).map((ledger) => {
    const matches = (entry) => customerLedgerFor(masters, entry)?.id === ledger.id;
    const sales = distinct(salesLedger).filter((entry) => posted(entry) && matches(entry));
    const payments = distinct(settlements).filter((entry) => posted(entry) && matches(entry));
    const wallet = distinct(walletEntries).filter((entry) => posted(entry) && matches(entry));
    const refunds = distinct(refundLedger).filter((entry) => posted(entry) && entry.payment === "Credit" && sales.some((bill) => bill.id === entry.billId));
    const creditSales = sales.reduce((sum, entry) => sum + paise(customerCreditAmount(entry)), 0);
    const settled = payments.reduce((sum, entry) => sum + paise(entry.amount), 0);
    const refunded = refunds.reduce((sum, entry) => sum + paise(entry.amount), 0);
    const walletPaise = wallet.reduce((sum, entry) => sum + (entry.direction === "credit" ? 1 : entry.direction === "debit" ? -1 : 0) * paise(entry.amount), 0);
    return {
      key: ledger.customerKey, aliases: ledger.customerAliases, name: ledger.customerName, mobile: ledger.customerMobile,
      creditSales: creditSales / 100, settled: settled / 100, creditRefunds: refunded / 100,
      balance: Math.max(0, creditSales - settled - refunded) / 100,
      walletBalance: Math.max(0, walletPaise) / 100,
      records: [...sales, ...payments, ...wallet, ...refunds],
    };
  });
}

export function customerAccountBalanceFor(accounts, customer) {
  const key = typeof customer === "string" ? customer : customer?.key || customerRecordKey(customer || {});
  return accounts.find((account) => account.key === key || (account.aliases || []).includes(key));
}

export function walletDepositAllocation({ creditBalance = 0, walletBalance = 0, amount = 0 } = {}) {
  const available = paise(walletBalance) + paise(amount);
  const settled = Math.min(paise(creditBalance), available);
  return { settled: settled / 100, creditBalance: (paise(creditBalance) - settled) / 100, walletBalance: (available - settled) / 100 };
}

// A wallet deduction and the matching credit repayment live in the same business
// snapshot, so POS and Finance cannot save just one half of the adjustment.
export function reconcileCustomerWalletCredit(customerStore, salesLedger = [], refundLedger = []) {
  const allocations = [];
  const walletEntries = [...(customerStore.walletEntries || [])];
  const settlements = [...(customerStore.settlements || [])];
  for (const account of customerAccountBalances(customerStore, salesLedger, refundLedger)) {
    const allocation = Math.min(paise(account.balance), paise(account.walletBalance));
    if (!allocation) continue;
    // Stable IDs and dates make reloads and the same reconciliation on another
    // register idempotent. Include amounts so later corrections remain auditable.
    const evidence = account.records.map((entry) => JSON.stringify([
      entry.id || "", entry.direction || "", entry.amount ?? entry.total ?? 0,
      entry.creditAmount ?? "", entry.walletDebitId || "", entry.status || "",
    ])).sort().join("|");
    const token = `${account.key}-${hash(evidence)}-${allocation}`;
    const settlementId = `SET-WAL-${token}`;
    const walletDebitId = `WAL-SET-${token}`;
    if (settlements.some((entry) => entry.id === settlementId) || walletEntries.some((entry) => entry.id === walletDebitId)) continue;
    const dates = account.records.map((entry) => text(entry.date || entry.completedAt || entry.createdAt).slice(0, 10)).filter(Boolean).sort();
    const timestamps = account.records.map((entry) => text(entry.completedAt || entry.createdAt || entry.date)).filter(Boolean).sort();
    const date = dates.at(-1) || new Date().toISOString().slice(0, 10);
    const shared = {
      customerKey: account.key, customerName: account.name, customerMobile: account.mobile,
      amount: allocation / 100, method: "Wallet", date, createdAt: timestamps.at(-1) || `${date}T12:00:00.000Z`,
      automatic: true, reference: `Wallet adjustment ${token}`,
    };
    settlements.unshift({ ...shared, id: settlementId, source: "Wallet credit settlement", walletDebitId });
    walletEntries.unshift({ ...shared, id: walletDebitId, direction: "debit", source: "Credit settlement", settlementId });
    allocations.push({ customerKey: account.key, amount: allocation / 100, creditBalance: (paise(account.balance) - allocation) / 100, walletBalance: (paise(account.walletBalance) - allocation) / 100 });
  }
  return {
    store: allocations.length ? { ...customerStore, settlements, walletEntries } : customerStore,
    allocations,
  };
}

export function addCustomerWalletCredit(customerStore, transaction, salesLedger = [], refundLedger = []) {
  if (!transaction?.id || transaction.direction !== "credit" || !paise(transaction.amount)) return { store: customerStore, allocations: [] };
  const entries = customerStore.walletEntries || [];
  const next = entries.some((entry) => entry.id === transaction.id) ? customerStore : { ...customerStore, walletEntries: [transaction, ...entries] };
  return reconcileCustomerWalletCredit(next, salesLedger, refundLedger);
}
