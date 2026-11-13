function text(value) {
  return String(value ?? "").trim();
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

function automaticStatus(value, postedStatuses) {
  const normalized = text(value).toLowerCase();
  if (postedStatuses.includes(normalized)) return "Posted";
  if (["cancelled", "canceled", "reversed", "inactive"].includes(normalized)) return "Review";
  return "Draft";
}

function automaticJournal({ source, sourceId, date, purpose, reference, note, debitAccount, creditAccount, value, status }) {
  const entryAmount = amount(value);
  const debit = text(debitAccount);
  const credit = text(creditAccount);
  if (!sourceId || !entryAmount || !debit || !credit) return null;
  const id = `AUTO-${source.toUpperCase().replaceAll(" ", "-")}-${sourceId}`;
  const description = text(note) || text(purpose) || source;
  return {
    id,
    automatic: true,
    source,
    sourceId,
    date: text(date),
    purpose: text(purpose) || source,
    reference: text(reference) || sourceId,
    note: description,
    status,
    debitAccount: debit,
    creditAccount: credit,
    amount: entryAmount,
    lines: [
      { id: `${id}-DEBIT`, account: debit, debit: entryAmount, credit: 0, description, side: "debit" },
      { id: `${id}-CREDIT`, account: credit, debit: 0, credit: entryAmount, description, side: "credit" },
    ],
  };
}

export function buildAutomaticFinanceJournals({ receipts = [], expenses = [], vendorPayments = [], bankAccounts = [] } = {}) {
  const entries = [
    ...receipts.map((record) => automaticJournal({
      source: "Receipt",
      sourceId: text(record.id),
      date: record.date,
      purpose: `${record.purpose || "Receipt"}${record.customer ? ` - ${record.customer}` : ""}`,
      reference: record.reference || record.id,
      note: record.note,
      debitAccount: record.debitAccount || record.method || "Cash",
      creditAccount: record.creditAccount || "Sales",
      value: record.amount,
      status: automaticStatus(record.status, ["received", "posted"]),
    })),
    ...expenses.map((record) => automaticJournal({
      source: "Expense",
      sourceId: text(record.id),
      date: record.date,
      purpose: record.category || "Expense",
      reference: record.reference || record.id,
      note: record.note,
      debitAccount: record.debitAccount || `Expense - ${record.category || "Other expense"}`,
      creditAccount: record.creditAccount || record.paidFrom || "Cash",
      value: record.amount,
      status: automaticStatus(record.status, ["posted", "paid"]),
    })),
    ...vendorPayments.map((record) => automaticJournal({
      source: "Vendor payment",
      sourceId: text(record.id),
      date: record.date,
      purpose: `${record.purpose || "Supplier settlement"}${record.vendor ? ` - ${record.vendor}` : ""}`,
      reference: record.reference || record.invoice || record.id,
      note: record.note,
      debitAccount: record.debitAccount || "Accounts payable",
      creditAccount: record.creditAccount || record.method || "Cash",
      value: record.amount,
      status: automaticStatus(record.status, ["paid", "partially paid", "posted"]),
    })),
    ...bankAccounts.map((record) => automaticJournal({
      source: "Opening balance",
      sourceId: text(record.id),
      date: record.createdAt?.slice(0, 10) || record.updatedAt?.slice(0, 10) || record.date,
      purpose: `Opening balance - ${record.accountName || record.bankName || "Bank account"}`,
      reference: record.id,
      note: record.bankName,
      debitAccount: record.accountName,
      creditAccount: "Owner capital",
      value: record.openingBalance,
      status: "Posted",
    })),
  ].filter(Boolean);

  return entries.sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")) || left.id.localeCompare(right.id));
}
