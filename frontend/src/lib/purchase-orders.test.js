import test from "node:test";
import assert from "node:assert/strict";
import { applyPurchaseOrderReceipt, automaticPurchaseOrderForEntry, nextPurchaseOrderNumber, normalizePurchaseRate, purchaseOrderLineAmounts, purchaseOrdersForVendor, purchaseOrderToPurchaseDraft, purchaseOrderTotals, purchaseOrderVendorOptions, recallPurchaseOrderLines } from "./purchase-orders.js";

test("purchase order unit rates retain up to four decimal places", () => {
  assert.equal(normalizePurchaseRate(6.0513), "6.0513");
  assert.equal(normalizePurchaseRate(114.9074), "114.9074");
  assert.equal(normalizePurchaseRate(24.759), "24.759");
  assert.equal(normalizePurchaseRate(10.5), "10.50");
});

test("a single unlinked approved purchase order is selected automatically", () => {
  const orders = [
    { id: "DRAFT", status: "Draft" },
    { id: "APPROVED", status: "Approved", poNumber: "PO-001" },
    { id: "CLOSED", status: "Closed" },
  ];
  assert.equal(automaticPurchaseOrderForEntry(orders, [])?.id, "APPROVED");
  assert.equal(automaticPurchaseOrderForEntry(orders, [{ status: "Draft", entry: { purchaseOrderId: "APPROVED" } }]), null);
  assert.equal(automaticPurchaseOrderForEntry([...orders, { id: "PARTIAL", status: "Partially received" }], []), null);
});

test("purchase order line and invoice totals include discount before GST", () => {
  assert.deepEqual(purchaseOrderLineAmounts({ quantity: 2, unitCost: 100, discountPercent: 10, gstRate: 5 }), {
    subtotal: 200, discount: 20, taxable: 180, gst: 9, total: 189,
  });
  assert.deepEqual(purchaseOrderTotals([
    { quantity: 2, unitCost: 100, discountPercent: 10, gstRate: 5 },
    { quantity: 1, unitCost: 50, discountPercent: 0, gstRate: 18 },
  ]), { subtotal: 250, discount: 20, gst: 18, total: 248, quantity: 3 });
});

test("purchase order numbering increments within a business day", () => {
  const date = new Date("2026-10-17T00:00:00.000Z");
  assert.equal(nextPurchaseOrderNumber([{ poNumber: "PO-20261017-001" }], date), "PO-20261017-002");
});

test("purchase order vendor search filters names and removes case-insensitive duplicates", () => {
  const vendors = [
    { id: "1", name: "Malavika Agencies" },
    { id: "2", name: "HUL Products" },
    { id: "3", name: "malavika agencies" },
    { id: "4", name: "Vendor One" },
  ];
  assert.deepEqual(purchaseOrderVendorOptions(vendors), ["HUL Products", "Malavika Agencies", "Vendor One"]);
  assert.deepEqual(purchaseOrderVendorOptions(vendors, "avi"), ["Malavika Agencies"]);
  assert.deepEqual(purchaseOrderVendorOptions(vendors, "products"), ["HUL Products"]);
  assert.deepEqual(purchaseOrderVendorOptions(vendors, "missing"), []);
});

test("vendor recall lists that vendor's previous orders and creates fresh editable lines", () => {
  const orders = [
    { id: "A-OLD", vendor: "Vendor A", orderDate: "2026-10-10", lines: [{ id: "old-line", itemId: "RICE", quantity: 2, unitCost: 80, discountPercent: 5, gstRate: 5, total: 168 }] },
    { id: "B", vendor: "Vendor B", orderDate: "2026-10-17", lines: [{ itemId: "OIL" }] },
    { id: "A-NEW", vendor: "vendor a", orderDate: "2026-10-16", lines: [{ id: "source-line", itemId: "RICE", batchKey: "batch-2", quantity: 4, unitCost: 81.257, discountPercent: 2, gstRate: 5, subtotal: 325.03 }] },
  ];
  const matches = purchaseOrdersForVendor(orders, " Vendor A ");
  assert.deepEqual(matches.map((order) => order.id), ["A-NEW", "A-OLD"]);
  const recalled = recallPurchaseOrderLines(matches[0], () => "fresh-line");
  assert.deepEqual(recalled.map((line) => [line.id, line.itemId, line.batchKey, line.quantity, line.unitCost, line.discountPercent, line.gstRate]), [
    ["fresh-line", "RICE", "batch-2", "4", "81.257", "2", "5"],
  ]);
  assert.equal("subtotal" in recalled[0], false);
});

test("approved purchase order converts into a purchase draft without posting stock", () => {
  const draft = purchaseOrderToPurchaseDraft({
    id: "ORDER-1", poNumber: "PO-20261017-001", vendor: "Supplier A", notes: "Deliver mornings",
    lines: [{ itemId: "ITEM-1", itemName: "Rice", sku: "001", unit: "kg", quantity: 5, unitCost: 80, discountPercent: 2, gstRate: 5 }],
  }, [{ id: "ITEM-1", name: "Rice", category: "Dry goods", department: "Food", unit: "kg", sellingPrice: 100 }], () => "LINE-1", new Date("2026-10-17T00:00:00.000Z"));
  assert.equal(draft.supplier, "Supplier A");
  assert.equal(draft.billDiscountBasis, "after_gst");
  assert.equal(draft.purchaseOrderId, "ORDER-1");
  assert.equal(draft.lines[0].quantity, "5");
  assert.equal(draft.lines[0].unitCost, "80.00");
  assert.equal(draft.lines[0].sellingPrice, "100");
});

test("purchase order preserves the selected EAN/MRP batch when received", () => {
  const batch = { batchKey: "batch-2", batchLabel: "Batch 2", batchBarcode: "123456", batchMrp: 15 };
  const draft = purchaseOrderToPurchaseDraft({ vendor: "Supplier", lines: [{ itemId: "item", quantity: 2, ...batch }] }, [], () => "line", "2026-10-17");
  for (const [key, value] of Object.entries(batch)) assert.equal(draft.lines[0][key], value);
});

test("linking a purchase order copies every ordered product into Purchase Entry", () => {
  let lineNumber = 0;
  const draft = purchaseOrderToPurchaseDraft({
    id: "ORDER-ALL", poNumber: "PO-20261017-009", vendor: "Supplier",
    lines: [
      { itemId: "RICE", itemName: "Rice", quantity: 2, unitCost: 100, gstRate: 5 },
      { itemId: "OIL", itemName: "Oil", quantity: 3, unitCost: 80, gstRate: 5 },
    ],
  }, [], () => `LINE-${++lineNumber}`, "2026-10-17");
  assert.equal(draft.purchaseOrderNumber, "PO-20261017-009");
  assert.deepEqual(draft.lines.map((line) => [line.name, line.quantity, line.unitCost]), [
    ["Rice", "2", "100.00"],
    ["Oil", "3", "80.00"],
  ]);
});

test("a partially received purchase order loads only its outstanding quantities", () => {
  const draft = purchaseOrderToPurchaseDraft({
    id: "ORDER-PARTIAL", poNumber: "PO-PARTIAL", vendor: "Supplier", status: "Partially received",
    lines: [
      { id: "RICE-LINE", itemId: "RICE", itemName: "Rice", quantity: 5, receivedQuantity: 2, unitCost: 80 },
      { id: "OIL-LINE", itemId: "OIL", itemName: "Oil", quantity: 3, receivedQuantity: 3, unitCost: 100 },
    ],
  }, [], () => "RECEIPT-LINE", "2026-10-26");
  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].purchaseOrderLineId, "RICE-LINE");
  assert.equal(draft.lines[0].quantity, "3");
});

test("receiving less than ordered marks a PO partial, then closes it when complete", () => {
  const orders = [{ id: "ORDER-1", status: "Approved", lines: [
    { id: "RICE-LINE", itemId: "RICE", quantity: 5, receivedQuantity: 0 },
  ] }];
  const partial = applyPurchaseOrderReceipt(orders, "ORDER-1", [{ purchaseOrderLineId: "RICE-LINE", itemId: "RICE", quantity: 2 }], "2026-10-26T10:00:00.000Z");
  assert.equal(partial[0].status, "Partially received");
  assert.equal(partial[0].lines[0].receivedQuantity, 2);
  const complete = applyPurchaseOrderReceipt(partial, "ORDER-1", [{ purchaseOrderLineId: "RICE-LINE", itemId: "RICE", quantity: 3 }], "2026-10-27T10:00:00.000Z");
  assert.equal(complete[0].status, "Closed");
  assert.equal(complete[0].lines[0].receivedQuantity, 5);
});
