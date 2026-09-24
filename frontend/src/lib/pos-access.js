export function normalizeStaffStatus(status) {
  return String(status || "Active").trim().toLowerCase();
}

export function normalizeStaffRole(role) {
  return String(role || "").trim().replaceAll("_", " ").toLowerCase();
}

function roleCanOperatePos(role, storeId) {
  const isActive = normalizeStaffStatus(role?.status) === "active";
  const isForStore = role?.storeId === "GLOBAL" || String(role?.storeId || "") === String(storeId || "");
  const modules = Array.isArray(role?.modules) ? role.modules : [];
  return isActive && isForStore && modules.some((module) => String(module).trim().toLowerCase() === "pos");
}

export function isEligiblePosCashier(user, customRoles, storeId) {
  const userStoreId = String(user?.storeId || "GLOBAL");
  const isForStore = String(storeId || "GLOBAL") === "GLOBAL" || userStoreId === "GLOBAL" || userStoreId === String(storeId);
  if (!isForStore || normalizeStaffStatus(user?.status) !== "active") return false;

  const role = normalizeStaffRole(user?.role);
  if (role === "cashier") return true;
  return (Array.isArray(customRoles) ? customRoles : []).some((customRole) => (
    normalizeStaffRole(customRole?.name) === role && roleCanOperatePos(customRole, storeId)
  ));
}

export function findOpenStoreShift(shifts) {
  return (Array.isArray(shifts) ? shifts : []).find((shift) => !shift?.closedAt) || null;
}

export function canCashierUseOpenShift(cashier, openShift) {
  return Boolean(cashier) && (!openShift || String(openShift.cashierId) === String(cashier.id));
}
