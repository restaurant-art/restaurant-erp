import test from "node:test";
import assert from "node:assert/strict";
import { deletePurchaseDraftRecord, normalizePurchaseDraftDays, purchaseDraftDeadline, purchaseDraftMatches, purchaseDraftNumber, requestPurchaseApprovalRecord, returnPurchaseToDraft, savePurchaseDraftRecord, submitPurchaseDraftRecord } from "./purchase-drafts.js";

test("draft can remain otherwise incomplete once the mandatory invoice is provided", () => {
  const entry = { supplier: "", invoice: "INV-DRAFT", lines: [{ id: "line", itemId: "", quantity: "" }] };
  const records = [{ id: "other", status: "Draft", entry: {} }];
  const result = savePurchaseDraftRecord(records, entry, "draft", "now");
  assert.equal(result.length, 2);
  assert.equal(result[0].status, "Draft");
  assert.equal(records.length, 1);
  entry.lines[0].quantity = "10";
  assert.equal(result[0].entry.lines[0].quantity, "");
});

test("supplier invoice number is mandatory even when saving a draft", () => {
  assert.throws(() => savePurchaseDraftRecord([], { supplier: "Vendor", invoice: "   ", lines: [] }, "draft"), /Supplier invoice number is required/);
});

test("purchase draft deadline uses the configured maximum without deleting the draft", () => {
  const record = { status: "Draft", createdAt: "2026-10-01T08:00:00.000Z" };
  assert.deepEqual(purchaseDraftDeadline(record, 7, "2026-10-08T18:00:00.000Z"), { age: 7, limit: 7, overdue: false, daysRemaining: 0, daysOverdue: 0 });
  assert.deepEqual(purchaseDraftDeadline(record, 7, "2026-10-10T18:00:00.000Z"), { age: 9, limit: 7, overdue: true, daysRemaining: 0, daysOverdue: 2 });
  assert.equal(normalizePurchaseDraftDays(0), 1);
  assert.equal(normalizePurchaseDraftDays(999), 365);
});

test("saving a recalled purchase order assigns and preserves a purchase number", () => {
  const entry = { date: "2026-10-17", invoice: "INV-PO", purchaseOrderNumber: "PO-20261017-001", lines: [] };
  const saved = savePurchaseDraftRecord([], entry, "PUR-DRAFT-12345678-abcd-ef12", "first");
  assert.match(saved[0].purchaseNumber, /^PUR-20261017-\d{6}$/);
  assert.equal(purchaseDraftNumber(saved[0]), saved[0].purchaseNumber);
  const updated = savePurchaseDraftRecord(saved, { ...entry, invoice: "INV-PO-2" }, saved[0].id, "second");
  assert.equal(updated[0].purchaseNumber, saved[0].purchaseNumber);
  assert.equal(updated[0].entry.purchaseOrderNumber, "PO-20261017-001");
});

test("edits require a fresh save, including batch, discount and selling price changes", () => {
  const entry = { supplier: "Vendor", invoice: "INV-1", lines: [{ itemId: "rice", batchKey: "batch2", discountPercent: "10", sellingPrice: "30", taxRate: "5" }] };
  const records = savePurchaseDraftRecord([], entry, "draft", "first");
  assert.ok(purchaseDraftMatches(records[0], entry));
  for (const field of ["batchKey", "discountPercent", "sellingPrice", "taxRate"]) {
    const changed = structuredClone(entry);
    changed.lines[0][field] = "different";
    assert.equal(purchaseDraftMatches(records[0], changed), false);
  }
  const changed = { ...entry, invoice: "INV-2" };
  const updated = savePurchaseDraftRecord(records, changed, "draft", "second");
  assert.equal(updated.length, 1);
  assert.equal(updated[0].createdAt, "first");
  assert.equal(updated[0].updatedAt, "second");
  assert.ok(purchaseDraftMatches(updated[0], changed));
});

test("purchase approval keeps stock posting separate from draft submission", () => {
  const records = savePurchaseDraftRecord([], { invoice: "INV-1", lines: [] }, "draft", "first");
  assert.throws(() => submitPurchaseDraftRecord(records, "draft", "PUR-1"), /not awaiting approval/);
  const pending = requestPurchaseApprovalRecord(records, "draft", "second");
  assert.equal(pending[0].status, "PendingApproval");
  assert.equal(pending[0].purchaseId, undefined);
  assert.equal(returnPurchaseToDraft(pending, "draft", "third")[0].status, "Draft");
  const approved = submitPurchaseDraftRecord(pending, "draft", "PUR-1", "fourth");
  assert.equal(approved[0].status, "Approved");
  assert.equal(approved[0].purchaseId, "PUR-1");
  assert.equal(records[0].status, "Draft");
  assert.equal(purchaseDraftMatches(approved[0], records[0].entry), false);
  assert.throws(() => savePurchaseDraftRecord(approved, {}, "draft"), /awaiting approval or has already been approved/);
  assert.throws(() => submitPurchaseDraftRecord(approved, "draft", "PUR-2"), /not awaiting approval/);
});

test("deleting a draft leaves submitted purchase records untouched", () => {
  const records = [
    { id: "draft", status: "Draft" },
    { id: "submitted", status: "Submitted" },
  ];
  assert.deepEqual(deletePurchaseDraftRecord(records, "draft"), [{ id: "submitted", status: "Submitted" }]);
  assert.deepEqual(deletePurchaseDraftRecord(records, "submitted"), records);
});
