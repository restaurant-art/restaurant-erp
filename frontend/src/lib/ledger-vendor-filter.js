const vendorKey = (value) => String(value || "").trim().toLowerCase();

export function ledgerVendorOptions(vendors = [], payments = []) {
  const names = new Map();
  [...vendors.map((item) => item.name), ...payments.map((item) => item.vendor)].forEach((value) => {
    const name = String(value || "").trim();
    if (name && !names.has(vendorKey(name))) names.set(vendorKey(name), name);
  });
  return [...names].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function buildFilteredLedgerActivity(rows, filters = {}) {
  const runningBalances = {};
  const ledgerRows = rows
    .filter((item) => !filters.vendor || vendorKey(item.vendor) === vendorKey(filters.vendor))
    .slice()
    .sort((a, b) => `${a.date}-${a.reference}`.localeCompare(`${b.date}-${b.reference}`))
    .map((item) => {
      const balance = (runningBalances[item.account] || 0) + item.debit - item.credit;
      runningBalances[item.account] = balance;
      return { ...item, balance };
    })
    .filter((item) => (!filters.query || `${item.account} ${item.reference} ${item.details}`.toLowerCase().includes(filters.query.toLowerCase()))
      && (!filters.from || item.date >= filters.from)
      && (!filters.to || item.date <= filters.to));
  return { ledgerRows, runningBalances };
}
