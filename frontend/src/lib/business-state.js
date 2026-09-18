export const globalBusinessKeys = new Set(['vestora-stores', 'vestora-users', 'vestora-custom-roles', 'vestora-sales-ledger', 'vestora-void-ledger', 'vestora-refund-ledger', 'vestora-kds-orders', 'vestora-table-orders', 'vestora-supplier-orders']);
export const storePrefixes = ['active-settings', 'attendance-employees', 'attendance-logs', 'attendance-records', 'attendance-report', 'attendance-settings', 'finance-bank-accounts', 'finance-expenses', 'finance-journals', 'finance-ledgers', 'finance-receipts', 'finance-vendor-payments', 'finished-goods', 'floors', 'food-stock', 'inventory-categories', 'inventory-transactions', 'inventory', 'last-shift-close', 'shifts', 'shift-history', 'leave-requests', 'menu-items', 'menu-setup', 'offers', 'payroll-attendance', 'production-batches', 'production-categories', 'production-wastage', 'recipes', 'tables', 'bill-template', 'theme-config', 'supplier-documents', 'customer-details'];
export function stateStore(key) {
  const prefix = storePrefixes.find((name) => key.startsWith(`vestora-${name}-`));
  return prefix ? key.slice(`vestora-${prefix}-`.length) : null;
}
export const isBusinessKey = (key) => globalBusinessKeys.has(key) || stateStore(key) !== null;
export const sanitize = (value) => JSON.parse(JSON.stringify(value, (key, entry) => /password|token|credential|secret|access.?key|api.?key/i.test(key) ? undefined : entry));
