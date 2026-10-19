const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
const completedExpenseStatuses = new Set(["posted", "paid"]);
const completedVendorStatuses = new Set(["paid", "partially paid"]);

function isBankSettlementAccount(value) {
  const name = normalize(value);
  return /(^|\b)(bank|card|upi|online|wallet|cheque|net banking|bank transfer)(\b|$)/.test(name);
}

function paymentParts(record) {
  if (record?.payment === "Split") {
    return (record.splitPayments || []).map((part) => ({ account: part.method, amount: Number(part.amount || 0) }));
  }
  return [{ account: record?.payment, amount: Number(record?.total || 0) }];
}

export function buildBankAccountSummaries({
  banks = [], receipts = [], expenses = [], vendorPayments = [], journals = [], salesLedger = [], refundLedger = [],
} = {}) {
  const summaries = banks.map((bank) => ({
    ...bank,
    openingBalance: Number(bank.openingBalance || 0),
    moneyIn: 0,
    moneyOut: 0,
    currentBalance: Number(bank.openingBalance || 0),
    transactionCount: 0,
    transactions: [],
  }));
  const byName = new Map(summaries.map((bank) => [normalize(bank.accountName), bank]));
  const primary = summaries.find((bank) => bank.isPrimary && normalize(bank.status) !== "inactive")
    || summaries.find((bank) => normalize(bank.status) !== "inactive");
  const resolveBank = (account) => byName.get(normalize(account)) || (isBankSettlementAccount(account) ? primary : null);
  const add = (account, direction, amount, transaction) => {
    const bank = resolveBank(account);
    const numericAmount = Number(amount || 0);
    if (!bank || !Number.isFinite(numericAmount) || numericAmount <= 0) return;
    if (direction === "in") bank.moneyIn += numericAmount;
    else bank.moneyOut += numericAmount;
    bank.transactionCount += 1;
    bank.transactions.push({ ...transaction, accountName: bank.accountName, direction, amount: numericAmount });
  };

  receipts.filter((item) => normalize(item.status) === "received").forEach((item) => add(
    item.debitAccount || item.method,
    "in",
    item.amount,
    { date: item.date, source: "Receipt", reference: item.reference || item.id, details: `${item.purpose || "Receipt"}${item.customer ? ` - ${item.customer}` : ""}` },
  ));
  expenses.filter((item) => completedExpenseStatuses.has(normalize(item.status))).forEach((item) => add(
    item.creditAccount || item.paidFrom,
    "out",
    item.amount,
    { date: item.date, source: "Expense", reference: item.reference || item.id, details: item.category || item.note || "Expense" },
  ));
  vendorPayments.filter((item) => completedVendorStatuses.has(normalize(item.status))).forEach((item) => add(
    item.creditAccount || item.method,
    "out",
    item.amount,
    { date: item.date, source: "Vendor payment", reference: item.reference || item.invoice || item.id, details: `${item.vendor || "Vendor"}${item.invoice ? ` - ${item.invoice}` : ""}` },
  ));
  journals.filter((item) => normalize(item.status) === "posted").forEach((item) => {
    (item.lines || []).forEach((line) => {
      add(line.account, "in", line.debit, { date: item.date, source: "Journal", reference: item.reference || item.id, details: line.description || item.purpose || item.note || "Journal entry" });
      add(line.account, "out", line.credit, { date: item.date, source: "Journal", reference: item.reference || item.id, details: line.description || item.purpose || item.note || "Journal entry" });
    });
  });
  salesLedger.forEach((bill) => paymentParts(bill).forEach((part) => add(
    part.account,
    "in",
    part.amount,
    { date: String(bill.completedAt || bill.createdAt || bill.date || "").slice(0, 10), source: "POS sale", reference: bill.billNo || bill.orderNumber || bill.id, details: bill.orderType || "POS billing" },
  )));
  refundLedger.forEach((refund) => add(
    refund.payment,
    "out",
    refund.amount,
    { date: String(refund.createdAt || refund.date || "").slice(0, 10), source: "POS refund", reference: refund.billId || refund.id, details: refund.reason || "Customer refund" },
  ));

  return summaries.map((bank) => {
    const ordered = [...bank.transactions].sort((a, b) => `${a.date || ""}-${a.reference || ""}`.localeCompare(`${b.date || ""}-${b.reference || ""}`));
    let balance = bank.openingBalance;
    const transactions = ordered.map((transaction) => {
      balance += transaction.direction === "in" ? transaction.amount : -transaction.amount;
      return { ...transaction, balance };
    }).reverse();
    return {
      ...bank,
      moneyIn: Number(bank.moneyIn.toFixed(2)),
      moneyOut: Number(bank.moneyOut.toFixed(2)),
      currentBalance: Number((bank.openingBalance + bank.moneyIn - bank.moneyOut).toFixed(2)),
      transactions,
    };
  });
}
