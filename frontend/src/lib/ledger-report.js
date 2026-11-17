const text = (value) => String(value ?? "").trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const dateOnly = (value) => text(value).slice(0, 10);
const localDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function ledgerReportAccountOptions(rows = [], masters = []) {
  const values = [
    ...masters.filter((master) => master.status !== "Inactive").map((master) => master.name),
    ...rows.map((entry) => entry.account),
  ].map(text).filter(Boolean);
  return [...new Map(values.map((value) => [value.toLowerCase(), value])).values()].sort((a, b) => a.localeCompare(b));
}

export function filterLedgerReportAccounts(accounts = [], query = "") {
  const needle = text(query).toLowerCase();
  if (!needle) return accounts;
  return accounts.filter((account) => text(account).toLowerCase().includes(needle));
}

export function ledgerReportDatePreset(preset, referenceDate = new Date()) {
  const reference = new Date(referenceDate);
  reference.setHours(12, 0, 0, 0);
  const to = new Date(reference);
  let from = new Date(reference);
  if (preset === "This month") from = new Date(reference.getFullYear(), reference.getMonth(), 1, 12);
  if (preset === "Previous month") {
    from = new Date(reference.getFullYear(), reference.getMonth() - 1, 1, 12);
    to.setFullYear(reference.getFullYear(), reference.getMonth(), 0);
  }
  if (preset === "Financial year to date") {
    const year = reference.getMonth() >= 3 ? reference.getFullYear() : reference.getFullYear() - 1;
    from = new Date(year, 3, 1, 12);
  }
  return { from: localDateKey(from), to: localDateKey(to) };
}

export function defaultLedgerReportDates(referenceDate = new Date()) {
  return ledgerReportDatePreset("This month", referenceDate);
}

export function buildLedgerAccountReport(rows = [], filters = {}) {
  const account = text(filters.account);
  if (!account) return null;
  const accountRows = rows.filter((entry) => text(entry.account).toLowerCase() === account.toLowerCase());
  const from = dateOnly(filters.from);
  const to = dateOnly(filters.to);
  const openingBalance = accountRows
    .filter((entry) => from && dateOnly(entry.date) < from)
    .reduce((sum, entry) => sum + number(entry.debit) - number(entry.credit), 0);
  const partyNeedle = text(filters.party).toLowerCase();
  const minimum = text(filters.minimum) === "" ? null : number(filters.minimum);
  const maximum = text(filters.maximum) === "" ? null : number(filters.maximum);
  const type = text(filters.transactionType || "All");
  const direction = text(filters.direction || "All");
  const records = accountRows.filter((entry) => {
    const entryDate = dateOnly(entry.date);
    const amount = Math.max(number(entry.debit), number(entry.credit));
    if (from && entryDate < from) return false;
    if (to && entryDate > to) return false;
    if (partyNeedle && !`${entry.party || ""} ${entry.vendor || ""} ${entry.customer || ""} ${entry.details || ""} ${entry.reference || ""}`.toLowerCase().includes(partyNeedle)) return false;
    if (type !== "All" && text(entry.source) !== type) return false;
    if (direction === "Debit" && number(entry.debit) <= 0) return false;
    if (direction === "Credit" && number(entry.credit) <= 0) return false;
    if (minimum !== null && amount < minimum) return false;
    if (maximum !== null && amount > maximum) return false;
    return true;
  }).map((entry, index) => ({ ...entry, originalIndex: index }))
    .sort((a, b) => `${dateOnly(a.date)}-${String(a.originalIndex).padStart(8, "0")}`.localeCompare(`${dateOnly(b.date)}-${String(b.originalIndex).padStart(8, "0")}`));
  let runningBalance = openingBalance;
  const reportRows = records.map((entry) => {
    runningBalance += number(entry.debit) - number(entry.credit);
    return {
      date: dateOnly(entry.date),
      transactionType: text(entry.source || "Entry"),
      party: text(entry.party || entry.vendor || entry.customer || entry.details || "—"),
      details: text(entry.details),
      reference: text(entry.reference || "—"),
      debit: number(entry.debit),
      credit: number(entry.credit),
      balance: runningBalance,
    };
  });
  return {
    account,
    from,
    to,
    openingBalance,
    totalDebit: reportRows.reduce((sum, entry) => sum + entry.debit, 0),
    totalCredit: reportRows.reduce((sum, entry) => sum + entry.credit, 0),
    closingBalance: runningBalance,
    rows: reportRows,
  };
}
