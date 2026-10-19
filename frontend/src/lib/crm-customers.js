export const customerTypes = ['Retail', 'Wholesale', 'E-commerce'];
const normalized = value => String(value || '').toLowerCase().replace(/[^a-z]/g, '');

export function billCustomerTypes(bill) {
  const types = new Set();
  const channel = [bill.orderType, bill.channel, bill.source, bill.customerType].map(normalized);
  if (channel.some(value => ['online', 'ecommerce'].includes(value))) types.add('E-commerce');
  const priceModes = [bill.pricingMode, ...(bill.items || []).map(item => item.pricingMode)].map(normalized);
  if (priceModes.includes('wholesale') || normalized(bill.customerType) === 'wholesale') types.add('Wholesale');
  if (!types.size) types.add('Retail');
  return customerTypes.filter(type => types.has(type));
}

export function buildCustomerRows(salesLedger = [], overrides = []) {
  const customers = new Map();
  for (const bill of salesLedger) {
    const name = String(bill.customerName || '').trim();
    const mobile = String(bill.customerMobile || '').replace(/\D/g, '').slice(-10);
    if (!name && !mobile) continue;
    const key = mobile || name.toLowerCase();
    const current = customers.get(key) || { id: key, name: name || 'Customer', mobile, points: 0, itemCounts: new Map(), types: new Set() };
    current.name = name || current.name;
    current.mobile = mobile || current.mobile;
    current.points += Math.round(Number(bill.total || 0));
    for (const type of billCustomerTypes(bill)) current.types.add(type);
    for (const item of bill.items || []) current.itemCounts.set(item.name, (current.itemCounts.get(item.name) || 0) + Number(item.qty || 0));
    customers.set(key, current);
  }
  return [...customers.values()].filter(customer => !overrides.find(entry => entry.id === customer.id)?.deleted).map(customer => {
    const favourite = [...customer.itemCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const saved = overrides.find(entry => entry.id === customer.id);
    const values = saved?.values ? saved.values.slice(0, 4) : [customer.name, customer.mobile ? `+91 ${customer.mobile}` : 'Not provided', String(customer.points), favourite];
    const types = customerTypes.filter(type => customer.types.has(type));
    return Object.assign([...values, types.join(' · ')], { recordId: customer.id, customerTypes: types });
  }).sort((a, b) => Number(b[2]) - Number(a[2]));
}

// Only rows in the active filter may be edited/deleted. Hidden customers survive.
export function mergeCustomerEdits(overrides, visibleRows, nextRows) {
  const changes = new Map(overrides.map(entry => [entry.id, entry]));
  for (const row of visibleRows) {
    const replacement = nextRows.find(entry => entry.recordId === row.recordId);
    if (!replacement) changes.set(row.recordId, { id: row.recordId, deleted: true });
    else if (JSON.stringify(row.slice(0, 4)) !== JSON.stringify(replacement.slice(0, 4))) changes.set(row.recordId, { id: row.recordId, values: replacement.slice(0, 4) });
  }
  return [...changes.values()];
}
