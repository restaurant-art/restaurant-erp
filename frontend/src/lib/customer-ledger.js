import { customerRecordKey, normalizeCustomerMobile } from "./crm-customers.js";

const text = (value) => String(value ?? "").trim();
const money = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) / 100 : 0;
const positive = (value) => Math.max(0, money(value));
const posted = (entry) => !["cancelled", "canceled", "reversed", "draft", "void", "voided"].includes(text(entry.status).toLowerCase());
const identity = (entry) => text(entry.customerKey) || customerRecordKey(entry);
const hash = (value) => [...value].reduce((sum, char) => Math.imul(sum ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(36);

// Customer account IDs and account names remain stable: renaming a contact must
// not orphan historical journals or merge two customers who share a name.
export function ensureCustomerLedgers(ledgers = [], { customers = [], salesLedger = [], settlements = [], walletEntries = [], overrides = [] } = {}) {
  const result = [...ledgers];
  for (const record of [...customers, ...salesLedger, ...settlements, ...walletEntries]) {
    const originalKey = identity(record);
    if (!originalKey) continue;
    const override = overrides.find((entry) => entry.id === originalKey);
    const name = text(override?.values?.[0] ?? record.name ?? record.customerName) || "Customer";
    const mobile = normalizeCustomerMobile(override?.values?.[1] ?? record.mobile ?? record.customerMobile);
    const key = customerRecordKey({ name, mobile });
    const customerId = customers.includes(record) ? text(record.id) : text(record.customerId);
    const index = result.findIndex((ledger) => ledger.customerLedger && (
      (customerId && ledger.customerId === customerId)
      || [ledger.customerKey, ...(ledger.customerAliases || [])].some((alias) => alias === originalKey || alias === key)
    ));
    const existing = result[index];
    const aliases = [...new Set([...(existing?.customerAliases || []), existing?.customerKey, originalKey, key].filter(Boolean))];
    const next = {
      ...existing,
      id: existing?.id || `CUSLED-${hash(originalKey)}`,
      code: existing?.code || `CUS-${mobile || hash(originalKey)}`,
      name: existing?.name || `Customer - ${name}${mobile ? ` (${mobile})` : ""}`,
      type: "Asset", group: "Customer accounts", status: existing?.status || "Active",
      automatic: true, customerLedger: true,
      customerId: existing?.customerId || customerId,
      customerKey: existing?.customerKey || key,
      customerName: customers.includes(record) || !existing ? name : existing.customerName,
      customerMobile: customers.includes(record) || !existing ? mobile : existing.customerMobile,
      customerAliases: aliases,
    };
    if (index < 0) result.push(next);
    else result[index] = next;
  }
  return result;
}

export function customerLedgerFor(ledgers, customer) {
  const key = typeof customer === "string" ? customer : identity(customer);
  return ledgers.find((ledger) => ledger.customerLedger && [ledger.customerKey, ...(ledger.customerAliases || [])].includes(key));
}

export function customerCreditAmount(bill) {
  if (bill.creditAmount !== null && bill.creditAmount !== undefined && bill.creditAmount !== "" && Number.isFinite(Number(bill.creditAmount))) return positive(bill.creditAmount);
  if (bill.payment === "Credit") return positive(bill.total);
  return (bill.splitPayments || []).filter((entry) => entry.method === "Credit").reduce((sum, entry) => money(sum + positive(entry.amount)), 0);
}

// Derive postings from their original records, not from saved copies of a journal.
// This keeps both POS counters, Finance and reports live and idempotent.
export function buildCustomerLedgerActivity({ ledgerMasters = [], customers = [], salesLedger = [], settlements = [], walletEntries = [], overrides = [], receipts = [], refundLedger = [], manualLedgerRows = [] } = {}) {
  const masters = ensureCustomerLedgers(ledgerMasters, { customers, salesLedger, settlements, walletEntries, overrides });
  const journals = [];
  const sourceIds = new Set();
  const movementRecords = [...settlements, ...walletEntries];
  const handledReceiptIds = new Set(receipts.filter((receipt) => movementRecords.some((record) => record.id && (receipt.originId === record.id || receipt.id === `CUSREC-${record.id}`))).map((receipt) => receipt.id));
  const wallet = walletEntries.filter(posted);
  const addJournal = (record, ledger, source, id, lines) => {
    if (!ledger || !id || sourceIds.has(id)) return;
    const valid = lines.map((line) => ({ ...line, debit: positive(line.debit), credit: positive(line.credit) })).filter((line) => line.debit || line.credit);
    if (!valid.length) return;
    sourceIds.add(id);
    const reference = text(record.reference || record.orderNumber || record.id || id);
    journals.push({
      id: `AUTO-CUSTOMER-${id}`, sourceId: id, automatic: true, source, status: "Posted",
      date: text(record.date || record.completedAt || record.createdAt).slice(0, 10),
      occurredAt: text(record.completedAt || record.createdAt || record.date),
      reference, purpose: `${source} - ${ledger.customerName}`, note: text(record.reference || record.reason),
      customerKey: ledger.customerKey, customerName: ledger.customerName, customerMobile: ledger.customerMobile,
      amount: money(valid.reduce((sum, line) => sum + line.debit, 0)),
      debitAccount: valid.find((line) => line.debit)?.account || "",
      creditAccount: valid.find((line) => line.credit)?.account || "",
      lines: valid.map((line, index) => ({ id: `${id}-${index}`, description: source, ...line })),
    });
  };
  const transfer = (record, ledger, source, id, debit, credit, amount) => addJournal(record, ledger, source, id, [
    { account: debit, debit: amount }, { account: credit, credit: amount },
  ]);
  const copiedReceipt = (record) => receipts.find((entry) => entry.originId === record.id || entry.id === `CUSREC-${record.id}`);
  const movement = (record, source, debitCustomer) => {
    const ledger = customerLedgerFor(masters, record);
    const receipt = copiedReceipt(record);
    const method = receipt?.debitAccount || record.method || "Cash";
    transfer(record, ledger, source, `movement-${record.id || hash(JSON.stringify(record))}`, debitCustomer ? ledger?.name : method, debitCustomer ? method : ledger?.name, positive(record.amount));
    if (ledger && positive(record.amount) && receipt) handledReceiptIds.add(receipt.id);
  };

  for (const bill of salesLedger.filter(posted)) {
    const ledger = customerLedgerFor(masters, bill);
    if (!ledger || !positive(bill.total)) continue;
    const id = text(bill.id || bill.orderNumber);
    const total = positive(bill.total);
    const billWallet = wallet.filter((entry) => customerLedgerFor(masters, entry)?.id === ledger.id && entry.orderNumber && entry.orderNumber === bill.orderNumber && entry.direction === "debit" && entry.source === "Wallet redemption");
    const usedWallet = Math.min(total, positive(bill.walletRedemption ?? billWallet.reduce((sum, entry) => sum + positive(entry.amount), 0)));
    const credit = Math.min(total - usedWallet, customerCreditAmount(bill));
    const tax = Math.min(total, positive(bill.tax));
    addJournal(bill, ledger, "Sale", `sale-${id}`, [
      { account: ledger.name, debit: money(total - usedWallet), source: credit ? "Credit sale" : "Sale", description: `Bill ${bill.orderNumber || id}${credit ? ` · Credit due ${credit.toFixed(2)}` : ""}` },
      { account: ledger.name, debit: usedWallet, source: "Wallet redemption", description: `Wallet used for bill ${bill.orderNumber || id}` },
      { account: "Sales", credit: money(total - tax) },
      { account: "GST payable", credit: tax },
    ]);
    let remainingPaid = money(total - usedWallet - credit);
    const payments = bill.payment === "Split" ? bill.splitPayments || [] : [{ method: bill.payment || "Cash", amount: remainingPaid }];
    payments.forEach((payment, index) => {
      if (["Credit", "Wallet"].includes(payment.method)) return;
      const paid = Math.min(remainingPaid, positive(payment.amount));
      transfer(bill, ledger, `${payment.method || "Cash"} payment`, `payment-${id}-${index}`, payment.method || "Cash", ledger.name, paid);
      remainingPaid = money(remainingPaid - paid);
    });
    // Older records can have wallet deductions/change on the bill but no wallet
    // movement. Derive only the missing entry; never count both representations.
    const changeEntries = wallet.filter((entry) => customerLedgerFor(masters, entry)?.id === ledger.id && entry.orderNumber && entry.orderNumber === bill.orderNumber && entry.source === "Change retained" && entry.direction === "credit");
    if (!changeEntries.length && positive(bill.walletChangeCredit)) transfer(bill, ledger, "Change retained", `change-${id}`, "Cash", ledger.name, positive(bill.walletChangeCredit));
  }
  const settledWalletIds = new Set();
  for (const settlement of settlements.filter(posted)) {
    const ledger = customerLedgerFor(masters, settlement);
    const walletDebit = wallet.find((entry) => entry.id === settlement.walletDebitId && entry.settlementId === settlement.id && entry.direction === "debit" && positive(entry.amount) === positive(settlement.amount) && customerLedgerFor(masters, entry)?.id === ledger?.id);
    if (walletDebit && ledger) {
      addJournal(settlement, ledger, "Wallet credit settlement", `wallet-settlement-${settlement.id}`, [
        { account: ledger.name, debit: positive(settlement.amount), source: "Wallet applied to credit", description: "Wallet funds used to pay outstanding credit" },
        { account: ledger.name, credit: positive(settlement.amount), source: "Credit settled from wallet", description: "Automatic credit repayment from customer wallet" },
      ]);
      settledWalletIds.add(walletDebit.id);
    } else movement(settlement, "Credit settlement", false);
  }
  for (const entry of wallet) {
    if (!["credit", "debit"].includes(entry.direction)) continue;
    if (settledWalletIds.has(entry.id)) continue;
    const linkedSale = entry.direction === "debit" && entry.source === "Wallet redemption" && salesLedger.some((bill) => posted(bill) && bill.orderNumber && bill.orderNumber === entry.orderNumber && customerLedgerFor(masters, bill)?.id === customerLedgerFor(masters, entry)?.id);
    if (linkedSale) continue;
    movement(entry, entry.source || (entry.direction === "credit" ? "Wallet deposit" : "Wallet use"), entry.direction === "debit");
  }
  // Legacy/manual customer receipts without a source movement still belong to
  // the account. Name matching is permitted only for one unambiguous customer.
  for (const receipt of receipts.filter((entry) => ["Received", "Posted"].includes(entry.status))) {
    if (handledReceiptIds.has(receipt.id)) continue;
    const explicitLedger = masters.find((master) => master.customerLedger && master.name === receipt.creditAccount);
    if (!explicitLedger && !/receivable|wallet|customer credit/i.test(`${receipt.creditAccount} ${receipt.source} ${receipt.purpose}`)) continue;
    let ledger = explicitLedger || customerLedgerFor(masters, receipt);
    if (!ledger) {
      const matches = masters.filter((master) => master.customerLedger && master.customerName.toLowerCase() === text(receipt.customer).toLowerCase());
      if (matches.length === 1) ledger = matches[0];
    }
    if (!ledger) continue;
    transfer(receipt, ledger, receipt.purpose || "Customer receipt", `receipt-${receipt.id}`, receipt.debitAccount || receipt.method || "Cash", ledger.name, positive(receipt.amount));
    handledReceiptIds.add(receipt.id);
  }
  for (const refund of refundLedger.filter(posted)) {
    const bill = salesLedger.find((entry) => entry.id === refund.billId);
    const ledger = customerLedgerFor(masters, bill || refund);
    if (!ledger) continue;
    const refundAmount = positive(refund.amount);
    const refundTax = Math.min(refundAmount, positive(refund.taxAmount || refund.tax));
    addJournal(refund, ledger, "Sale refund", `refund-${refund.id}`, [
      { account: "Sales returns", debit: money(refundAmount - refundTax) },
      { account: "GST payable", debit: refundTax },
      { account: ledger.name, credit: refundAmount },
    ]);
    if (!["Credit", "Wallet"].includes(refund.payment)) transfer(refund, ledger, "Refund paid", `refund-payment-${refund.id}`, ledger.name, refund.payment || "Cash", positive(refund.amount));
  }
  journals.sort((left, right) => `${left.date}-${left.occurredAt}`.localeCompare(`${right.date}-${right.occurredAt}`)
    || Number(left.source === "Wallet credit settlement") - Number(right.source === "Wallet credit settlement"));
  const rows = journals.flatMap((journal) => journal.lines.map((line) => ({
    id: line.id, date: journal.date, account: line.account,
    party: `${journal.customerName}${journal.customerMobile ? ` (${journal.customerMobile})` : ""}`,
    customerKey: journal.customerKey, customerName: journal.customerName, customerMobile: journal.customerMobile,
    customerLedger: masters.some((master) => master.customerLedger && master.name === line.account),
    debit: line.debit, credit: line.credit, source: line.source || journal.source,
    reference: journal.reference, details: line.description || journal.purpose,
  })));
  const manualCustomerRows = manualLedgerRows.flatMap((row) => {
    const ledger = masters.find((master) => master.customerLedger && master.name === row.account);
    return ledger ? [{ ...row, customerLedger: true, customerKey: ledger.customerKey, customerName: ledger.customerName, customerMobile: ledger.customerMobile, party: `${ledger.customerName}${ledger.customerMobile ? ` (${ledger.customerMobile})` : ""}` }] : [];
  });
  return { masters, journals, rows, customerRows: [...rows.filter((row) => row.customerLedger), ...manualCustomerRows], handledReceiptIds };
}
