export const ROLE_ACCESS_PREFIX = "access:";

export const roleAccessSections = [
  { id: "dashboard", label: "Dashboard", options: [] },
  { id: "pos", label: "POS Billing", options: [] },
  { id: "kds", label: "KDS", options: [] },
  { id: "tables", label: "Tables", options: [] },
  { id: "menu", label: "Menu", options: [
    { id: "items", label: "All items" },
    { id: "create", label: "Item creation" },
    { id: "setup", label: "Menu setup" },
  ] },
  { id: "inventory", label: "Inventory & Purchase", options: [
    { id: "create", label: "Product Master", group: "Inventory" },
    { id: "variants", label: "Batches", group: "Inventory" },
    { id: "category-setup", label: "Inventory setup", group: "Inventory" },
    { id: "vendors", label: "Vendor creation", group: "Purchase" },
    { id: "purchase-order", label: "Purchase order", group: "Purchase" },
    { id: "purchase", label: "Purchase entry", group: "Purchase" },
    { id: "purchase-return", label: "Purchase return", group: "Purchase" },
    { id: "vendor-settlements", label: "Vendor settlements", group: "Purchase" },
  ] },
  { id: "production", label: "Production", options: [
    { id: "Recipes", label: "Recipes" },
    { id: "Planning", label: "Planning" },
    { id: "Batches", label: "Batches" },
    { id: "Food Stock", label: "Food Stock" },
    { id: "Wastage", label: "Wastage" },
    { id: "Reports", label: "Reports", group: "Production reports" },
    { id: "report:Daily Production", label: "Daily Production", group: "Production reports" },
    { id: "report:Ingredient Consumption", label: "Ingredient Consumption", group: "Production reports" },
    { id: "report:Food Cost Report", label: "Food Cost Report", group: "Production reports" },
    { id: "report:Wastage Report", label: "Wastage Report", group: "Production reports" },
    { id: "report:Finished Goods Stock", label: "Finished Goods Stock", group: "Production reports" },
  ] },
  { id: "item-stock", label: "Item Stock", options: [] },
  { id: "crm", label: "CRM", options: [] },
  { id: "offers", label: "Marketing", options: [
    { id: "Poster Design", label: "Poster Design" },
    { id: "Flyer Design", label: "Flyer Design" },
    { id: "Happy hour offer", label: "Happy hour offer" },
    { id: "BOGO offers", label: "BOGO offers" },
    { id: "Combo discounts", label: "Combo discounts" },
    { id: "Weekend offers", label: "Weekend offers" },
    { id: "Coupons", label: "Coupons" },
  ] },
  { id: "attendance", label: "Attendance", options: [
    { id: "Add Face ID", label: "Add Face ID" },
    { id: "Face Check In/Out", label: "Check In/Out" },
    { id: "Manual Check In/Out", label: "Manual Check In/Out" },
    { id: "Attendance Report", label: "Attendance report" },
    { id: "Attendance Records", label: "Attendance records" },
    { id: "Leave Requests", label: "Leave requests" },
    { id: "Leave Approvals", label: "Leave approvals" },
    { id: "Payroll Summary", label: "Payroll summary" },
    { id: "Settings", label: "Attendance settings" },
  ] },
  { id: "finance", label: "Finance", options: [
    { id: "Receipts", label: "Receipts" },
    { id: "Expenses", label: "Expenses" },
    { id: "Bank Accounts", label: "Bank accounts" },
    { id: "Vendor Payments", label: "Vendor payments" },
    { id: "Journal Entries", label: "Journal entries" },
    { id: "General Ledger", label: "General ledger" },
    { id: "Finance Reports", label: "Finance reports" },
  ] },
  { id: "reports", label: "Reports", options: [
    { id: "Daily sales", label: "Daily sales" },
    { id: "Item-wise sales", label: "Item-wise sales" },
    { id: "GST", label: "GST report" },
    { id: "Cashier closing", label: "Cashier closing" },
    { id: "Void and refund", label: "Void & refunds" },
    { id: "Production reports", label: "Production reports" },
  ] },
  { id: "mis", label: "MIS Reports", options: [] },
  { id: "intelligence", label: "AI Intelligence", options: [] },
  { id: "admin", label: "Admin", options: [
    { id: "all", label: "All users" },
    { id: "create", label: "User creation" },
    { id: "roles", label: "Role creation" },
  ] },
  { id: "settings", label: "Settings", options: [] },
];

export const roleAccessPermission = (moduleId, optionId) => `${ROLE_ACCESS_PREFIX}${moduleId}:${optionId}`;

export function isRoleAccessPermission(permission) {
  return String(permission || "").startsWith(ROLE_ACCESS_PREFIX);
}

export function accessPermissionsForModule(moduleId) {
  const section = roleAccessSections.find((entry) => entry.id === moduleId);
  return (section?.options || []).map((option) => roleAccessPermission(moduleId, option.id));
}

export function prepareRolePermissionsForEdit(role) {
  const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
  if (permissions.some(isRoleAccessPermission)) return [...permissions];
  const generated = (role?.modules || []).flatMap(accessPermissionsForModule);
  return [...new Set([...permissions, ...generated])];
}

export function roleCanAccessOption(role, moduleId, optionId) {
  if (!role) return true;
  if (!(role.modules || []).includes(moduleId)) return false;
  const permissions = Array.isArray(role.permissions) ? role.permissions : [];
  if (!permissions.some(isRoleAccessPermission)) return true;
  return permissions.includes(roleAccessPermission(moduleId, optionId));
}

export function pruneRolePermissions(modules, permissions) {
  const selected = new Set(modules || []);
  return [...new Set((permissions || []).filter((permission) => {
    if (!isRoleAccessPermission(permission)) return true;
    const moduleId = String(permission).slice(ROLE_ACCESS_PREFIX.length).split(":")[0];
    return selected.has(moduleId);
  }))];
}
