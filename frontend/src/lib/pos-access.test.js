import test from "node:test";
import assert from "node:assert/strict";
import { canCashierUseOpenShift, findOpenStoreShift, isEligiblePosCashier } from "./pos-access.js";

const branch = "STORE-001";
const cashier = { id: "cashier-1", role: "Cashier", status: "Active", storeId: branch };

test("cashier selection accepts active cashiers and active custom POS roles", () => {
  assert.equal(isEligiblePosCashier(cashier, [], branch), true);
  assert.equal(isEligiblePosCashier(
    { id: "host-1", role: "Counter_Host", status: "ACTIVE", storeId: branch },
    [{ name: "Counter Host", status: "Active", storeId: branch, modules: ["pos", "tables"] }],
    branch,
  ), true);
});

test("cashier selection excludes suspended staff, non-POS roles, and other branches", () => {
  assert.equal(isEligiblePosCashier({ ...cashier, status: "Suspended" }, [], branch), false);
  assert.equal(isEligiblePosCashier({ ...cashier, role: "Waiter" }, [], branch), false);
  assert.equal(isEligiblePosCashier({ ...cashier, storeId: "STORE-002" }, [], branch), false);
  assert.equal(isEligiblePosCashier(
    { ...cashier, role: "Supervisor" },
    [{ name: "Supervisor", status: "Inactive", storeId: branch, modules: ["pos"] }],
    branch,
  ), false);
});

test("an open shift is found independently of the selected cashier", () => {
  const shifts = [
    { id: "closed", cashierId: "cashier-0", closedAt: "2026-09-24T10:00:00.000Z" },
    { id: "open", cashierId: "cashier-1" },
  ];
  assert.equal(findOpenStoreShift(shifts)?.id, "open");
  assert.equal(findOpenStoreShift([]), null);
});

test("only the cashier who owns an open shift can resume or open in that drawer", () => {
  const openShift = { id: "shift-1", cashierId: "cashier-1" };
  assert.equal(canCashierUseOpenShift(cashier, openShift), true);
  assert.equal(canCashierUseOpenShift({ ...cashier, id: "cashier-2" }, openShift), false);
  assert.equal(canCashierUseOpenShift(cashier, null), true);
  assert.equal(canCashierUseOpenShift(null, openShift), false);
});
