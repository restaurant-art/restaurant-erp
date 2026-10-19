import test from "node:test";
import assert from "node:assert/strict";
import { prepareRolePermissionsForEdit, pruneRolePermissions, roleAccessPermission, roleCanAccessOption } from "./role-permissions.js";

test("legacy roles receive all submenu options for their selected modules", () => {
  const permissions = prepareRolePermissionsForEdit({ modules: ["menu"], permissions: [] });
  assert.equal(permissions.includes(roleAccessPermission("menu", "items")), true);
  assert.equal(permissions.includes(roleAccessPermission("menu", "create")), true);
  assert.equal(permissions.includes(roleAccessPermission("menu", "setup")), true);
});

test("marketing roles include separate poster and flyer design access", () => {
  const permissions = prepareRolePermissionsForEdit({ modules: ["offers"], permissions: [] });
  assert.equal(permissions.includes(roleAccessPermission("offers", "Poster Design")), true);
  assert.equal(permissions.includes(roleAccessPermission("offers", "Flyer Design")), true);
});

test("granular roles expose only selected submenu options", () => {
  const role = { modules: ["finance"], permissions: [roleAccessPermission("finance", "Vendor Payments")] };
  assert.equal(roleCanAccessOption(role, "finance", "Vendor Payments"), true);
  assert.equal(roleCanAccessOption(role, "finance", "Expenses"), false);
});

test("permissions are removed when their main module is removed", () => {
  const permissions = pruneRolePermissions(["menu"], [roleAccessPermission("menu", "items"), roleAccessPermission("finance", "Expenses"), "attendance.manual"]);
  assert.deepEqual(permissions, [roleAccessPermission("menu", "items"), "attendance.manual"]);
});
