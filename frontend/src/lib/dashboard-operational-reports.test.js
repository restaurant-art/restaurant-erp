import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardOperationalReports, sortOperationalReportsByPriority } from "./dashboard-operational-reports.js";

test("operational reports show active priority items first and zero items last", () => {
  const reports = [
    { id: "zero-critical", count: 0, tone: "critical" },
    { id: "active-neutral", count: 1, tone: "neutral" },
    { id: "active-warning-small", count: 1, tone: "warning" },
    { id: "active-critical", count: 1, tone: "critical" },
    { id: "active-warning-large", count: 5, tone: "warning" },
    { id: "zero-warning", count: 0, tone: "warning" },
  ];

  assert.deepEqual(sortOperationalReportsByPriority(reports).map((report) => report.id), [
    "active-critical",
    "active-warning-large",
    "active-warning-small",
    "active-neutral",
    "zero-critical",
    "zero-warning",
  ]);
  assert.equal(reports[0].id, "zero-critical");
});

test("an explicit report priority overrides its visual tone", () => {
  const reports = [
    { id: "critical", count: 2, tone: "critical" },
    { id: "business-priority", count: 1, tone: "neutral", priority: 10 },
  ];
  assert.deepEqual(sortOperationalReportsByPriority(reports).map((report) => report.id), ["business-priority", "critical"]);
});

test("dashboard operational reports use live stock, purchase, sales, and shift records", () => {
  const reports = buildDashboardOperationalReports({
    inventory: [
      { id: "negative", name: "Negative", stock: -2, cost: 10, sellingPrice: 8, status: "Active" },
      { id: "expired", name: "Expired", stock: 3, cost: 0, sellingPrice: 5, barcode: "100", expiryDate: "2026-10-01", status: "Active" },
      { id: "inactive", name: "Inactive", stock: 0, status: "Inactive" },
    ],
    purchaseOrders: [{ id: "draft", status: "Draft" }, { id: "approval", status: "Submitted for approval" }, { id: "approved", status: "Approved" }],
    purchaseDrafts: [{ id: "bill", status: "PendingApproval" }],
    inventoryTransactions: [{ type: "Purchase", purchaseId: "GRN-1", itemId: "expired", total: 50, supplier: "A", invoice: "1" }],
    vendorPayments: [{ purchaseId: "GRN-1", amount: 20, status: "Paid" }],
    shifts: [{ id: "open" }, { id: "closed", closedAt: "2026-10-22" }],
    sales: [{ id: "sale", orderType: "Delivery", payment: "Credit" }],
    now: new Date("2026-10-23T12:00:00"),
  });
  const count = (id) => reports.find((report) => report.id === id)?.count;
  assert.equal(reports.length, 26);
  assert.equal(count("bill-approval"), 2);
  assert.equal(count("open-counters"), 1);
  assert.equal(count("negative-stock"), 1);
  assert.equal(count("expired-stock"), 1);
  assert.equal(count("bill-dues"), 1);
  assert.equal(count("grn"), 1);
  assert.equal(count("delivery-credit"), 1);
  assert.equal(count("po-drafts"), 1);
});

test("negative stock dashboard report counts product totals and links to the negative stock filter", () => {
  const report = buildDashboardOperationalReports({ inventory: [
    { id: 'negative', stock: -5 },
    { id: 'negative-batch', parentProductId: 'negative', stock: 2 },
    { id: 'positive', stock: 6 },
    { id: 'positive-batch', parentProductId: 'positive', stock: -2 },
  ] }).find((item) => item.id === 'negative-stock');
  assert.equal(report.count, 1);
  assert.equal(report.view, 'negative-stock');
});
