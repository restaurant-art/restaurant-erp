import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformWithEsbuild } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const source = readFileSync(new URL("./attendance-leave-list.jsx", import.meta.url), "utf8");
const { code: compiled } = await transformWithEsbuild(source, "attendance-leave-list.jsx", { loader: "jsx", format: "cjs" });
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(createRequire(import.meta.url), componentModule, componentModule.exports);
const { AttendanceLeaveList } = componentModule.exports;
const requests = ["Pending", "Approved", "Rejected"].map((status) => ({
  id: status, employeeName: `${status} employee`, employeeCode: "EMP-01", type: "Casual leave",
  from: "2026-10-20", to: "2026-10-21", reason: "Personal leave", status,
}));
const render = (props) => renderToStaticMarkup(React.createElement(AttendanceLeaveList, props));

test("request history shows every status without review actions", () => {
  const html = render({ requests });
  for (const status of ["Pending", "Approved", "Rejected"]) assert.ok(html.includes(`${status} employee`));
  assert.ok(!html.includes("<button"));
  assert.ok(!html.includes("<th>Action</th>"));
});
test("approval page defaults to pending requests and exposes both decisions", () => {
  const html = render({ requests, onReview: () => {} });
  assert.ok(html.includes("Approve leave for Pending employee"));
  assert.ok(html.includes("Reject leave for Pending employee"));
  assert.ok(!html.includes("Approved employee"));
  assert.ok(!html.includes("Rejected employee"));
  assert.ok(html.includes('aria-pressed="true">Pending'));
});
test("empty approval queue explains there are no pending requests", () => {
  assert.ok(render({ requests: [], onReview: () => {} }).includes("No pending leave requests for this branch."));
});
