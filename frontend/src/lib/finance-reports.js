const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOnly = (value) => text(value).slice(0, 10);
const currency = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(number(value));
const dateMatchesPeriod = (value, period = {}) => {
  const date = dateOnly(value);
  if (!date) return true;
  const from = dateOnly(period.from);
  const to = dateOnly(period.to);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
};

export const financeReportGroups = [
  {
    title: "Financial reports",
    reports: [
      ["Trial Balance", "Summary of all ledger balances showing debits and credits", "scale"],
      ["Balance Sheet", "Assets, liabilities, and equity at a point in time", "balance"],
      ["Profit & Loss", "Revenue, expenses, and profit for the selected period", "trend"],
      ["Day Book", "Chronological register of all posted entries", "book"],
      ["Ledger Report", "Detailed transaction history for every ledger", "ledger"],
      ["Cash Flow Statement", "Cash inflows and outflows by activity", "cash"],
      ["Trade Payables & Receivables", "Vendor balances and customer receivables", "trade"],
      ["PDC Report", "Post-dated cheques pending and posted", "calendar"],
      ["Daily MIS Report", "Daily sales, receipts, expenses, and funds", "daily"],
      ["Monthly MIS Report", "Monthly trading and expense comparison", "monthly"],
      ["GSTR-1 Reconciliation Draft", "Recorded outward supplies before filing", "tax"],
      ["GSTR-3B Reconciliation Draft", "Output and input tax summary before filing", "tax"],
    ],
  },
  {
    title: "GST registers",
    reports: [
      ["GST Sales Register", "Invoice-wise outward supplies and tax", "tax"],
      ["GST Purchase Register", "Invoice-wise inward supplies and tax", "tax"],
      ["GST Gross Input Tax Register", "Recorded purchase tax before eligibility assessment", "tax"],
      ["GST Liability Summary", "Output tax, input tax, and net liability", "tax"],
      ["GST HSN Summary", "HSN-wise taxable value and tax", "tax"],
      ["GST Rate-wise Sales", "Sales turnover and tax split by GST rate", "tax"],
      ["GST Place of Supply", "Interstate and local outward supplies", "tax"],
      ["GST 0% Rate Supplies", "Zero-rated and exempt recorded supplies", "tax"],
      ["GST E-way Threshold Candidates", "Invoices above the configured review threshold", "truck"],
    ],
  },
  {
    title: "Statements & registers",
    reports: [
      ["Cash Book", "Cash-in-hand ledger with running movement", "bank"],
      ["Petty Cash Book", "Petty-cash ledger with running movement", "bank"],
      ["Bank Book", "Bank-account movements and balances", "bank"],
      ["Vendor Statement", "Vendor invoices, payments, and outstanding balance", "vendor"],
      ["Customer Statement", "Customer receipts, credit sales, and balances", "customer"],
      ["Expense Register", "Expense vouchers by date, category, and payment method", "expense"],
      ["Sales by Payment Mode", "Tender reconciliation by payment method", "payment"],
      ["Payment Transaction Register", "POS and non-POS money movements", "payment"],
      ["Stock Ledger", "Product quantity and value movements", "stock"],
      ["Purchase Rate Analysis", "Latest, minimum, maximum, and average purchase rates", "analysis"],
    ],
  },
];

export const financeReportNames = financeReportGroups.flatMap((group) => group.reports.map(([name]) => name));

function row(date, filter, values) {
  return { date: dateOnly(date), filter: text(filter) || "All", values };
}

function makeReport(columns, records, { moneyColumns = [], numberColumns = [], filterLabel = "Category", resultColumn } = {}) {
  const moneySet = new Set(moneyColumns);
  const numberSet = new Set(numberColumns);
  const formatted = records.map((record) => ({
    date: record.date,
    filter: record.filter,
    rawValues: record.values,
    cells: record.values.map((value, index) => moneySet.has(index) && value != null ? currency(value) : value ?? "—"),
  }));
  const report = {
    columns,
    records: formatted,
    filterLabel,
    filterOptions: [...new Set(formatted.map((record) => record.filter).filter((value) => value && value !== "All"))].sort((a, b) => a.localeCompare(b)),
    moneyColumns: [...moneySet],
    numberColumns: [...numberSet],
    resultColumn,
  };
  return { ...report, columnTotals: summarizeFinanceReport(report) };
}

export function summarizeFinanceReport(report, records = report.records) {
  const totals = { 0: "TOTAL" };
  for (const index of report.moneyColumns || []) {
    const result = report.resultColumn === index ? records.find((record) => record.filter === "Result") : null;
    totals[index] = result
      ? result.cells[index]
      : records.some((record) => record.rawValues?.[index] == null) && report.resultColumn === index
        ? "—" : currency(records.reduce((sum, record) => sum + number(record.rawValues?.[index]), 0));
  }
  for (const index of report.numberColumns || []) totals[index] = records.reduce((sum, record) => sum + number(record.rawValues?.[index]), 0).toLocaleString("en-IN");
  return totals;
}

export function saleDate(bill) {
  return dateOnly(bill.completedAt || bill.createdAt || bill.date);
}

export const postedSaleReference = (bill) => String(bill.tableOrderId || bill.id || "");

function salePayments(bill) {
  const split = Array.isArray(bill.splitPayments) ? bill.splitPayments : [];
  if (split.length) return split.map((payment) => ({ method: text(payment.method || payment.payment || "Other"), amount: number(payment.amount) }));
  return [{ method: text(bill.payment || "Other"), amount: number(bill.total) }];
}

function accountBalances(ledgerRows = []) {
  const balances = new Map();
  for (const entry of ledgerRows) {
    const account = text(entry.account);
    if (!account) continue;
    const current = balances.get(account) || { debit: 0, credit: 0 };
    current.debit += number(entry.debit);
    current.credit += number(entry.credit);
    balances.set(account, current);
  }
  return [...balances.entries()].map(([account, value]) => ({ account, ...value, balance: value.debit - value.credit }));
}

function purchaseInvoices(transactions = []) {
  const groups = new Map();
  for (const entry of transactions.filter((item) => item.type === "Purchase" && item.status !== "Cancelled")) {
    const id = text(entry.purchaseId || entry.invoice || entry.reference || entry.id);
    if (!id) continue;
    const current = groups.get(id) || { id, date: dateOnly(entry.date || entry.createdAt), supplier: text(entry.supplier), invoice: text(entry.invoice || entry.reference), taxable: 0, tax: 0, total: 0, invoiceTotal: null, quantity: 0 };
    current.taxable += number(entry.subtotal || (number(entry.total) - number(entry.tax)));
    current.tax += number(entry.tax || entry.itemTax);
    current.total += number(entry.total);
    if (Number.isFinite(Number(entry.invoiceSummary?.total))) current.invoiceTotal = number(entry.invoiceSummary.total);
    current.quantity += number(entry.quantity);
    groups.set(id, current);
  }
  return [...groups.values()].map((invoice) => ({ ...invoice, total: invoice.invoiceTotal ?? invoice.total }));
}

function salesItems(sales = []) {
  return sales.flatMap((bill) => (bill.items || []).map((item) => {
    const qty = number(item.qty || item.quantity || 1);
    const rate = number(item.gstRate ?? item.taxRate);
    const gross = number(item.total || item.lineTotal || item.price * qty);
    const taxable = rate > 0 ? gross / (1 + rate / 100) : gross;
    return { date: saleDate(bill), bill: text(bill.orderNumber || bill.id), name: text(item.name || item.item || "Item"), hsn: text(item.hsnCode || "Not recorded"), qty, rate, taxable, tax: gross - taxable, gross, place: text(bill.placeOfSupply || "Local / not recorded") };
  }));
}

function groupByPeriod(entries, period) {
  const groups = new Map();
  for (const entry of entries) {
    const date = dateOnly(entry.date);
    if (!date) continue;
    const key = period === "month" ? date.slice(0, 7) : date;
    const current = groups.get(key) || { key, sales: 0, receipts: 0, expenses: 0, vendor: 0, refunds: 0 };
    current[entry.kind] += number(entry.amount);
    groups.set(key, current);
  }
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function classifyBalanceAccount(account, ledgerMasters = []) {
  const master = ledgerMasters.find((ledger) => text(ledger.name).toLowerCase() === text(account).toLowerCase());
  if (master?.type) return master.type;
  const normalized = text(account).toLowerCase();
  if (/capital|equity|reserve|retained/.test(normalized)) return "Equity";
  if (/payable|loan|liabil|creditor|tax|gst/.test(normalized)) return "Liability";
  if (/cash|bank|receivable|stock|inventory|asset|advance|deposit/.test(normalized)) return "Asset";
  if (/sales|income|revenue/.test(normalized)) return "Income";
  if (/expense|rent|salary|wage|charges|cost/.test(normalized)) return "Expense";
  return "Asset";
}

export function buildFinanceReport(name, data = {}, period = {}) {
  const effectivePeriod = ["Trial Balance", "Balance Sheet"].includes(name) ? { from: "", to: period.to } : period;
  const sales = (data.salesLedger || []).filter((entry) => dateMatchesPeriod(saleDate(entry), effectivePeriod));
  const refunds = (data.refundLedger || []).filter((entry) => dateMatchesPeriod(entry.createdAt || entry.date, effectivePeriod));
  const receipts = (data.receipts || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const expenses = (data.expenses || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const vendorPayments = (data.vendorPayments || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const banks = (data.bankAccounts || []).filter((entry) => dateMatchesPeriod(entry.updatedAt || entry.date, effectivePeriod));
  const bankSummaries = data.bankSummaries || [];
  const ledgerRows = (data.ledgerRows || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const purchaseTransactions = (data.purchaseTransactions || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const purchases = purchaseInvoices(purchaseTransactions);
  const purchaseLines = purchaseTransactions.filter((entry) => entry.type === "Purchase" && entry.status !== "Cancelled");
  const payables = (data.payables || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod));
  const balances = accountBalances(ledgerRows);
  const items = salesItems(sales);
  const salesTotal = sales.reduce((sum, bill) => sum + number(bill.total), 0);
  const refundTotal = refunds.reduce((sum, refund) => sum + number(refund.amount), 0);
  const expenseTotal = expenses.filter((entry) => !["Cancelled", "Reversed"].includes(entry.status)).reduce((sum, entry) => sum + number(entry.amount), 0);
  const purchaseTax = purchases.reduce((sum, invoice) => sum + invoice.tax, 0);
  const salesTax = sales.reduce((sum, bill) => sum + number(bill.tax), 0) - refunds.reduce((sum, refund) => sum + number(refund.taxAmount ?? refund.tax), 0);
  const netSalesExTax = salesTotal - refundTotal - salesTax;
  const costRows = data.postedSaleCosts || {};
  const uncosted = data.requirePostedCosts && sales.some((bill) => !costRows[postedSaleReference(bill)]?.complete);
  const costOfSales = sales.reduce((sum, bill) => sum + number(costRows[postedSaleReference(bill)]?.cost), 0);
  const profit = uncosted ? null : netSalesExTax - costOfSales - expenseTotal;

  if (name === "Trial Balance") return makeReport(["Account", "Debit", "Credit", "Closing balance"], balances.map((entry) => row("", classifyBalanceAccount(entry.account, data.ledgerMasters), [entry.account, entry.debit, entry.credit, Math.abs(entry.balance)])), { moneyColumns: [1, 2, 3], filterLabel: "Account type" });

  if (name === "Balance Sheet") {
    const records = balances.filter((entry) => ["Asset", "Liability", "Equity"].includes(classifyBalanceAccount(entry.account, data.ledgerMasters))).map((entry) => {
      const type = classifyBalanceAccount(entry.account, data.ledgerMasters);
      const value = type === "Asset" ? entry.balance : -entry.balance;
      return row("", type, [type, entry.account, value]);
    });
    if (profit || uncosted) records.push(row("", "Equity", [
      "Equity", uncosted ? "Current period profit / loss · cost pending" : "Current period profit / loss", profit,
    ]));
    return makeReport(["Type", "Account", "Balance"], records, { moneyColumns: [2], filterLabel: "Account type" });
  }

  if (name === "Profit & Loss") {
    const records = [row("", "Income", ["Income", "Net sales excluding GST", netSalesExTax])];
    if (data.requirePostedCosts || costOfSales) records.push(row("", "Cost", [
      "Cost", uncosted ? "Cost of goods sold · cost pending" : "Cost of goods sold", uncosted ? null : -costOfSales,
    ]));
    for (const entry of expenses.filter((record) => !["Cancelled", "Reversed"].includes(record.status))) {
      records.push(row(entry.date, "Expense", ["Expense", entry.category || "Expense", -number(entry.amount)]));
    }
    records.push(row("", "Result", ["Result", uncosted ? "Net profit / loss · cost pending" : "Net profit / loss", profit]));
    return makeReport(["Section", "Particulars", "Amount"], records, { moneyColumns: [2], filterLabel: "Section", resultColumn: 2 });
  }

  if (["Day Book", "Ledger Report"].includes(name)) return makeReport(["Date", "Account", "Source", "Reference", "Details", "Debit", "Credit"], ledgerRows.map((entry) => row(entry.date, entry.source, [entry.date, entry.account, entry.source, entry.reference, entry.details, number(entry.debit), number(entry.credit)])), { moneyColumns: [5, 6], filterLabel: "Source" });

  if (name === "Cash Flow Statement") {
    const records = [];
    sales.forEach((bill) => salePayments(bill).filter((payment) => /cash|bank|upi|card/i.test(payment.method)).forEach((payment) => records.push(row(saleDate(bill), "Operating", [saleDate(bill), `POS ${payment.method}`, bill.orderNumber || bill.id, payment.amount, 0, payment.amount]))));
    receipts.filter((entry) => entry.status === "Received").forEach((entry) => records.push(row(entry.date, "Operating", [entry.date, "Receipt", entry.reference || entry.id, number(entry.amount), 0, number(entry.amount)])));
    expenses.filter((entry) => entry.status === "Posted").forEach((entry) => records.push(row(entry.date, "Operating", [entry.date, "Expense", entry.reference || entry.id, 0, number(entry.amount), -number(entry.amount)])));
    vendorPayments.filter((entry) => !["Cancelled", "Pending", "Reversed"].includes(entry.status)).forEach((entry) => records.push(row(entry.date, "Operating", [entry.date, "Vendor payment", entry.reference || entry.invoice || entry.id, 0, number(entry.amount), -number(entry.amount)])));
    return makeReport(["Date", "Activity", "Reference", "Inflow", "Outflow", "Net flow"], records, { moneyColumns: [3, 4, 5], filterLabel: "Activity type" });
  }

  if (name === "Trade Payables & Receivables") {
    const records = payables.map((entry) => row(entry.date, "Payable", ["Payable", entry.supplier, entry.invoice, number(entry.total), number(entry.returnCredit), number(entry.paid), number(entry.balance), entry.settlementStatus]));
    if (number(data.receivables)) records.push(row("", "Receivable", ["Receivable", "Credit customers", "POS credit sales", number(data.receivables), 0, 0, number(data.receivables), "Outstanding"]));
    return makeReport(["Type", "Party", "Reference", "Original amount", "Return credits", "Paid", "Outstanding", "Status"], records, { moneyColumns: [3, 4, 5, 6], filterLabel: "Type" });
  }

  if (name === "PDC Report") {
    const sources = [...receipts.map((entry) => ({ ...entry, party: entry.customer, direction: "Receivable" })), ...vendorPayments.map((entry) => ({ ...entry, party: entry.vendor, direction: "Payable" }))];
    const records = sources.filter((entry) => /pdc|cheque|check/i.test(`${entry.method} ${entry.reference} ${entry.note}`)).map((entry) => row(entry.date, entry.direction, [entry.date, entry.direction, entry.party, entry.reference || entry.id, number(entry.amount), entry.status]));
    return makeReport(["Date", "Type", "Party", "Cheque / reference", "Amount", "Status"], records, { moneyColumns: [4], filterLabel: "Type" });
  }

  if (["Daily MIS Report", "Monthly MIS Report"].includes(name)) {
    const entries = [
      ...sales.map((entry) => ({ date: saleDate(entry), kind: "sales", amount: entry.total })),
      ...refunds.map((entry) => ({ date: dateOnly(entry.createdAt || entry.date), kind: "refunds", amount: entry.amount })),
      ...receipts.map((entry) => ({ date: entry.date, kind: "receipts", amount: entry.amount })),
      ...expenses.map((entry) => ({ date: entry.date, kind: "expenses", amount: entry.amount })),
      ...vendorPayments.map((entry) => ({ date: entry.date, kind: "vendor", amount: entry.amount })),
    ];
    const groups = groupByPeriod(entries, name.startsWith("Monthly") ? "month" : "day");
    return makeReport([name.startsWith("Monthly") ? "Month" : "Date", "Sales", "Refunds", "Receipts", "Expenses", "Vendor paid", "Net movement"], groups.map((entry) => row(name.startsWith("Monthly") ? `${entry.key}-01` : entry.key, "MIS", [entry.key, entry.sales, entry.refunds, entry.receipts, entry.expenses, entry.vendor, entry.sales - entry.refunds + entry.receipts - entry.expenses - entry.vendor])), { moneyColumns: [1, 2, 3, 4, 5, 6], filterLabel: "Report" });
  }

  if (["GSTR-1 Reconciliation Draft", "GST Sales Register"].includes(name)) return makeReport(["Date", "Invoice", "Customer", "Taxable value", "CGST", "SGST", "Total GST", "Invoice total"], sales.map((bill) => row(saleDate(bill), bill.payment || "Other", [saleDate(bill), bill.orderNumber || bill.id, bill.customerName || "Walk-in", number(bill.taxableSubtotal || (number(bill.total) - number(bill.tax))), number(bill.cgst || number(bill.tax) / 2), number(bill.sgst || number(bill.tax) / 2), number(bill.tax), number(bill.total)])), { moneyColumns: [3, 4, 5, 6, 7], filterLabel: "Payment" });

  if (name === "GSTR-3B Reconciliation Draft" || name === "GST Liability Summary") return makeReport(["Section", "Taxable value", "CGST", "SGST", "Total tax"], [row("", "Output tax", ["Output tax on outward supplies", salesTotal - salesTax, salesTax / 2, salesTax / 2, salesTax]), row("", "Input tax", ["Recorded input tax on purchases", purchases.reduce((sum, entry) => sum + entry.taxable, 0), purchaseTax / 2, purchaseTax / 2, purchaseTax]), row("", "Net liability", ["Net GST payable", 0, (salesTax - purchaseTax) / 2, (salesTax - purchaseTax) / 2, salesTax - purchaseTax])], { moneyColumns: [1, 2, 3, 4], filterLabel: "Section" });

  if (name === "GST Purchase Register" || name === "GST Gross Input Tax Register") return makeReport(["Date", "Supplier", "Invoice", "Taxable value", "GST", "Invoice total"], purchases.map((invoice) => row(invoice.date, invoice.supplier, [invoice.date, invoice.supplier, invoice.invoice || invoice.id, invoice.taxable, invoice.tax, invoice.total])), { moneyColumns: [3, 4, 5], filterLabel: "Supplier" });

  if (name === "GST HSN Summary") {
    const groups = new Map();
    items.forEach((item) => { const key = `${item.hsn}|${item.rate}`; const current = groups.get(key) || { hsn: item.hsn, rate: item.rate, qty: 0, taxable: 0, tax: 0, total: 0 }; current.qty += item.qty; current.taxable += item.taxable; current.tax += item.tax; current.total += item.gross; groups.set(key, current); });
    return makeReport(["HSN", "GST rate", "Quantity", "Taxable value", "GST", "Total"], [...groups.values()].map((entry) => row("", `${entry.rate}%`, [entry.hsn, `${entry.rate}%`, entry.qty, entry.taxable, entry.tax, entry.total])), { moneyColumns: [3, 4, 5], numberColumns: [2], filterLabel: "GST rate" });
  }

  if (name === "GST Rate-wise Sales") {
    const groups = new Map();
    items.forEach((item) => { const current = groups.get(item.rate) || { rate: item.rate, taxable: 0, tax: 0, total: 0, qty: 0 }; current.qty += item.qty; current.taxable += item.taxable; current.tax += item.tax; current.total += item.gross; groups.set(item.rate, current); });
    return makeReport(["GST rate", "Quantity", "Taxable value", "CGST", "SGST", "Total"], [...groups.values()].map((entry) => row("", `${entry.rate}%`, [`${entry.rate}%`, entry.qty, entry.taxable, entry.tax / 2, entry.tax / 2, entry.total])), { moneyColumns: [2, 3, 4, 5], numberColumns: [1], filterLabel: "GST rate" });
  }

  if (name === "GST Place of Supply") {
    const groups = new Map();
    items.forEach((item) => { const current = groups.get(item.place) || { place: item.place, taxable: 0, tax: 0, total: 0 }; current.taxable += item.taxable; current.tax += item.tax; current.total += item.gross; groups.set(item.place, current); });
    return makeReport(["Place of supply", "Taxable value", "GST", "Invoice value"], [...groups.values()].map((entry) => row("", entry.place, [entry.place, entry.taxable, entry.tax, entry.total])), { moneyColumns: [1, 2, 3], filterLabel: "Place" });
  }

  if (name === "GST 0% Rate Supplies") return makeReport(["Date", "Invoice", "Item", "HSN", "Quantity", "Taxable value"], items.filter((item) => item.rate === 0).map((item) => row(item.date, item.name, [item.date, item.bill, item.name, item.hsn, item.qty, item.taxable])), { moneyColumns: [5], numberColumns: [4], filterLabel: "Item" });

  if (name === "GST E-way Threshold Candidates") {
    const threshold = number(data.eWayThreshold || 50000);
    const records = [...sales.filter((bill) => number(bill.total) >= threshold).map((bill) => row(saleDate(bill), "Sale", [saleDate(bill), "Sale", bill.orderNumber || bill.id, bill.customerName || "Walk-in", number(bill.total), "Review"])), ...purchases.filter((invoice) => invoice.total >= threshold).map((invoice) => row(invoice.date, "Purchase", [invoice.date, "Purchase", invoice.invoice || invoice.id, invoice.supplier, invoice.total, "Review"]))];
    return makeReport(["Date", "Type", "Reference", "Party", "Invoice value", "Status"], records, { moneyColumns: [4], filterLabel: "Type" });
  }

  if (name === "Cash Book" || name === "Petty Cash Book") {
    const accountMatcher = name === "Cash Book" ? /^cash$/i : /petty cash/i;
    const records = ledgerRows.filter((entry) => accountMatcher.test(text(entry.account))).map((entry) => row(entry.date, entry.source, [entry.date, entry.reference, entry.details, number(entry.debit), number(entry.credit), number(entry.debit) - number(entry.credit)]));
    return makeReport(["Date", "Reference", "Details", "Money in", "Money out", "Movement"], records, { moneyColumns: [3, 4, 5], filterLabel: "Source" });
  }

  if (name === "Bank Book") {
    const records = bankSummaries.flatMap((bank) => (bank.transactions || []).filter((entry) => dateMatchesPeriod(entry.date || entry.createdAt, effectivePeriod)).map((entry) => row(entry.date, bank.accountName, [entry.date, bank.accountName, entry.type || entry.source, entry.reference, number(entry.moneyIn || entry.debit), number(entry.moneyOut || entry.credit)])));
    if (!records.length) banks.forEach((bank) => records.push(row(bank.updatedAt || bank.date, bank.accountName, [dateOnly(bank.updatedAt || bank.date), bank.accountName, "Opening balance", bank.id, number(bank.openingBalance), 0])));
    return makeReport(["Date", "Bank account", "Activity", "Reference", "Money in", "Money out"], records, { moneyColumns: [4, 5], filterLabel: "Bank account" });
  }

  if (name === "Vendor Statement") return makeReport(["Date", "Vendor", "Invoice", "Bill amount", "Paid", "Outstanding", "Status"], payables.map((entry) => row(entry.date, entry.supplier, [entry.date, entry.supplier, entry.invoice, number(entry.total), number(entry.paid), number(entry.balance), entry.settlementStatus])), { moneyColumns: [3, 4, 5], filterLabel: "Vendor" });

  if (name === "Customer Statement") {
    if (Array.isArray(data.customerLedgerRows)) {
      const records = data.customerLedgerRows.filter((entry) => dateMatchesPeriod(entry.date, effectivePeriod)).map((entry) => row(entry.date, entry.party, [entry.date, entry.party, entry.reference, entry.source, entry.details, number(entry.debit), number(entry.credit)]));
      return makeReport(["Date", "Customer", "Reference", "Activity", "Details", "Debit", "Credit"], records, { moneyColumns: [5, 6], filterLabel: "Customer" });
    }
    const records = receipts.map((entry) => row(entry.date, entry.customer || "Customer", [entry.date, entry.customer || "Customer", entry.reference || entry.id, entry.purpose || "Receipt", number(entry.amount), entry.status]));
    sales.filter((bill) => /credit/i.test(text(bill.payment))).forEach((bill) => records.push(row(saleDate(bill), bill.customerName || "Credit customer", [saleDate(bill), bill.customerName || "Credit customer", bill.orderNumber || bill.id, "Credit sale", -number(bill.total), bill.paymentStatus || "Outstanding"])));
    return makeReport(["Date", "Customer", "Reference", "Activity", "Amount", "Status"], records, { moneyColumns: [4], filterLabel: "Customer" });
  }

  if (name === "Expense Register") return makeReport(["Date", "Category", "Paid from", "Reference", "Amount", "Status", "Notes"], expenses.map((entry) => row(entry.date, entry.category || "Expense", [entry.date, entry.category, entry.creditAccount || entry.paidFrom || "Cash", entry.reference || entry.id, number(entry.amount), entry.status, entry.note || ""])), { moneyColumns: [4], filterLabel: "Category" });

  if (name === "Sales by Payment Mode") {
    const groups = new Map();
    sales.forEach((bill) => salePayments(bill).forEach((payment) => { const current = groups.get(payment.method) || { method: payment.method, bills: 0, amount: 0 }; current.bills += 1; current.amount += payment.amount; groups.set(payment.method, current); }));
    return makeReport(["Payment mode", "Transactions", "Amount"], [...groups.values()].map((entry) => row("", entry.method, [entry.method, entry.bills, entry.amount])), { moneyColumns: [2], numberColumns: [1], filterLabel: "Payment mode" });
  }

  if (name === "Payment Transaction Register") {
    const records = [];
    sales.forEach((bill) => salePayments(bill).forEach((payment) => records.push(row(saleDate(bill), payment.method, [saleDate(bill), "POS sale", bill.orderNumber || bill.id, payment.method, payment.amount, "Money in"]))));
    receipts.forEach((entry) => records.push(row(entry.date, entry.debitAccount || entry.method || "Cash", [entry.date, "Receipt", entry.reference || entry.id, entry.debitAccount || entry.method || "Cash", number(entry.amount), "Money in"])));
    expenses.forEach((entry) => records.push(row(entry.date, entry.creditAccount || entry.paidFrom || "Cash", [entry.date, "Expense", entry.reference || entry.id, entry.creditAccount || entry.paidFrom || "Cash", -number(entry.amount), "Money out"])));
    vendorPayments.forEach((entry) => records.push(row(entry.date, entry.creditAccount || entry.method || "Bank", [entry.date, "Vendor payment", entry.reference || entry.invoice || entry.id, entry.creditAccount || entry.method || "Bank", -number(entry.amount), "Money out"])));
    return makeReport(["Date", "Source", "Reference", "Payment mode", "Amount", "Direction"], records, { moneyColumns: [4], filterLabel: "Payment mode" });
  }

  if (name === "Stock Ledger") {
    const records = purchaseLines.map((entry) => row(entry.date, entry.item || "Item", [entry.date, entry.item || "Item", "Purchase", entry.purchaseId || entry.invoice, number(entry.stockQuantity ?? entry.quantity), 0, number(entry.total), entry.stockUnit || entry.unit || ""]));
    sales.forEach((bill) => (bill.items || []).forEach((item) => records.push(row(saleDate(bill), item.name || "Item", [saleDate(bill), item.name || "Item", "Sale", bill.orderNumber || bill.id, 0, number(item.qty || item.quantity || 1), -number(item.total || item.price * number(item.qty || 1)), item.unit || ""]))));
    return makeReport(["Date", "Item", "Movement", "Reference", "Quantity in", "Quantity out", "Value movement", "Unit"], records, { moneyColumns: [6], numberColumns: [4, 5], filterLabel: "Item" });
  }

  if (name === "Purchase Rate Analysis") {
    const groups = new Map();
    purchaseLines.forEach((entry) => {
      const item = text(entry.item || entry.itemId || "Item");
      const unit = entry.stockUnit || entry.unit || "";
      const key = JSON.stringify([entry.itemId || item, unit]);
      const current = groups.get(key) || { item, unit, rates: [], quantity: 0, latest: 0, latestDate: "" };
      const rate = number(entry.stockNetUnitCost ?? entry.netUnitCost ?? entry.unitCost);
      current.rates.push(rate);
      current.quantity += number(entry.stockQuantity ?? entry.quantity);
      if (dateOnly(entry.date) >= current.latestDate) { current.latest = rate; current.latestDate = dateOnly(entry.date); }
      groups.set(key, current);
    });
    return makeReport(["Item", "Quantity purchased", "Minimum rate", "Maximum rate", "Average rate", "Latest rate", "Latest purchase", "Stock unit"], [...groups.values()].map((entry) => row(entry.latestDate, entry.item, [entry.item, entry.quantity, Math.min(...entry.rates), Math.max(...entry.rates), entry.rates.reduce((sum, rate) => sum + rate, 0) / entry.rates.length, entry.latest, entry.latestDate, entry.unit])), { moneyColumns: [2, 3, 4, 5], numberColumns: [1], filterLabel: "Item" });
  }

  return makeReport(["Date", "Details"], [], { filterLabel: "Category" });
}
