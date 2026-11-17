export const customerTypes = ['Retail', 'Wholesale', 'E-commerce'];
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

export const normalizeCustomerMobile = value => String(value || '').replace(/\D/g, '').slice(-10);

export function customerRecordKey(customer = {}) {
  const mobile = normalizeCustomerMobile(customer.mobile ?? customer.customerMobile);
  const name = String(customer.name ?? customer.customerName ?? '').trim().toLowerCase();
  return mobile || name;
}

export function upsertCustomerMaster(records = [], customer = {}) {
  const name = String(customer.name || '').trim();
  const mobile = normalizeCustomerMobile(customer.mobile);
  const location = String(customer.location || '').trim();
  const key = customerRecordKey({ name, mobile });
  if (!key) return records;
  const now = new Date().toISOString();
  const existingIndex = records.findIndex((record) => (
    (mobile && normalizeCustomerMobile(record.mobile) === mobile)
    || (!mobile && String(record.name || '').trim().toLowerCase() === name.toLowerCase())
  ));
  const existing = existingIndex >= 0 ? records[existingIndex] : null;
  const saved = {
    ...existing,
    id: existing?.id || customer.id || `CUS-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    name: name || existing?.name || 'Customer',
    mobile: mobile || existing?.mobile || '',
    location,
    createdAt: existing?.createdAt || customer.createdAt || now,
    updatedAt: customer.updatedAt || now,
  };
  return existingIndex >= 0
    ? records.map((record, index) => index === existingIndex ? saved : record)
    : [saved, ...records];
}

export function normalizeCustomerStore(value, legacyCustomers = [], legacySettlements = []) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const overrides = Array.isArray(value) ? value : Array.isArray(source.overrides) ? source.overrides : [];
  const customers = [...(Array.isArray(source.customers) ? source.customers : [])];
  for (const customer of legacyCustomers || []) {
    const next = upsertCustomerMaster(customers, customer);
    customers.splice(0, customers.length, ...next);
  }
  const settlementsById = new Map();
  for (const settlement of [...(Array.isArray(source.settlements) ? source.settlements : []), ...(legacySettlements || [])]) {
    if (!settlement || typeof settlement !== 'object') continue;
    const id = settlement.id || `${customerRecordKey(settlement)}-${settlement.date || settlement.createdAt || ''}-${settlement.amount || 0}`;
    if (!settlementsById.has(id)) settlementsById.set(id, settlement);
  }
  const walletEntriesById = new Map();
  for (const entry of Array.isArray(source.walletEntries) ? source.walletEntries : []) {
    if (!entry || typeof entry !== 'object') continue;
    const id = entry.id || `${entry.customerKey || customerRecordKey(entry)}-${entry.direction || ''}-${entry.createdAt || entry.date || ''}-${entry.amount || 0}`;
    if (!walletEntriesById.has(id)) walletEntriesById.set(id, entry);
  }
  return { overrides, customers, settlements: [...settlementsById.values()], walletEntries: [...walletEntriesById.values()], loyaltySettings: source.loyaltySettings || null };
}

export function billCustomerTypes(bill) {
  const types = new Set();
  const channel = [bill.orderType, bill.channel, bill.source, bill.customerType].map(normalized);
  if (channel.some(value => ['online', 'ecommerce'].includes(value))) types.add('E-commerce');
  const priceModes = [bill.pricingMode, ...(bill.items || []).map(item => item.pricingMode)].map(normalized);
  if (priceModes.includes('wholesale') || normalized(bill.customerType) === 'wholesale') types.add('Wholesale');
  if (!types.size) types.add('Retail');
  return customerTypes.filter(type => types.has(type));
}

export function buildCustomerRows(salesLedger = [], overrides = [], customerMaster = []) {
  const customers = new Map();
  for (const record of customerMaster) {
    const name = String(record.name || '').trim();
    const mobile = normalizeCustomerMobile(record.mobile);
    if (!name && !mobile) continue;
    const key = mobile || name.toLowerCase();
    customers.set(key, {
      id: key,
      name: name || 'Customer',
      mobile,
      location: String(record.location || '').trim(),
      points: 0,
      itemCounts: new Map(),
      types: new Set(Array.isArray(record.customerTypes) && record.customerTypes.length ? record.customerTypes : ['Retail']),
    });
  }
  for (const bill of salesLedger) {
    const name = String(bill.customerName || '').trim();
    const mobile = normalizeCustomerMobile(bill.customerMobile);
    if (!name && !mobile) continue;
    const key = mobile || name.toLowerCase();
    const current = customers.get(key) || { id: key, name: name || 'Customer', mobile, location: '', points: 0, itemCounts: new Map(), types: new Set() };
    current.name = name || current.name;
    current.mobile = mobile || current.mobile;
    current.location = String(bill.customerLocation || '').trim() || current.location;
    current.points += Number.isFinite(Number(bill.loyaltyPointsEarned)) && bill.loyaltyPointsEarned != null ? Number(bill.loyaltyPointsEarned) : Math.round(Number(bill.total || 0));
    for (const type of billCustomerTypes(bill)) current.types.add(type);
    for (const item of bill.items || []) current.itemCounts.set(item.name, (current.itemCounts.get(item.name) || 0) + Number(item.qty || 0));
    customers.set(key, current);
  }
  return [...customers.values()].filter(customer => !overrides.find(entry => entry.id === customer.id)?.deleted).map(customer => {
    const favourite = [...customer.itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const saved = overrides.find(entry => entry.id === customer.id);
    const values = saved?.values ? saved.values.slice(0, 4) : [customer.name, customer.mobile ? `+91 ${customer.mobile}` : 'Not provided', String(customer.points), favourite];
    if (Number.isFinite(saved?.pointsAdjustment)) values[2] = String(Math.max(0, customer.points + saved.pointsAdjustment));
    const types = customerTypes.filter(type => customer.types.has(type));
    if (!types.length) types.push('Retail');
    return Object.assign([...values, types.join(' · ')], { recordId: customer.id, customerTypes: types, location: customer.location, pointsEarned: customer.points });
  }).sort((a, b) => Number(b[2]) - Number(a[2]));
}

// Only rows in the active filter may be edited/deleted. Hidden customers survive.
export function mergeCustomerEdits(overrides, visibleRows, nextRows) {
  const changes = new Map(overrides.map(entry => [entry.id, entry]));
  for (const row of visibleRows) {
    const replacement = nextRows.find(entry => entry.recordId === row.recordId);
    if (!replacement) changes.set(row.recordId, { id: row.recordId, deleted: true });
    else if (JSON.stringify(row.slice(0, 4)) !== JSON.stringify(replacement.slice(0, 4))) {
      const points = Number(replacement[2]);
      changes.set(row.recordId, { id: row.recordId, values: replacement.slice(0, 4), ...(Number.isFinite(points) && Number.isFinite(row.pointsEarned) ? { pointsAdjustment: points - row.pointsEarned } : {}) });
    }
  }
  return [...changes.values()];
}
