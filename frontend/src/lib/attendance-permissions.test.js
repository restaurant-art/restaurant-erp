import test from "node:test";
import assert from "node:assert/strict";
import { canRecordManualAttendance as allowed } from "./attendance-permissions.js";

const role = { name: "Supervisor", storeId: "A", status: "Active", modules: ["attendance"], permissions: ["attendance.manual"] };
const check = (roles) => allowed({ roles, roleName: "Supervisor", storeId: "A" });
test("administrators can record manual attendance", () => assert.equal(allowed({ isAdmin: true }), true));
test("attendance access alone does not grant manual punches", () => assert.equal(check([{ ...role, permissions: [] }]), false));
test("explicit permission grants manual punches", () => assert.equal(check([role]), true));
test("inactive and other-store roles do not grant permission", () => {
  assert.equal(check([{ ...role, status: "Inactive" }]), false);
  assert.equal(check([{ ...role, storeId: "B" }]), false);
  assert.equal(check([{ ...role, modules: [] }]), false);
});
test("local role overrides global role, including revoked permission", () => {
  assert.equal(check([{ ...role, storeId: "GLOBAL" }]), true);
  assert.equal(check([{ ...role, storeId: "GLOBAL" }, { ...role, permissions: [] }]), false);
});
