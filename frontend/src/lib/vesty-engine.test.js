import test from "node:test";
import assert from "node:assert/strict";
import { answerVestyQuestion } from "./vesty-engine.js";

const now = new Date("2026-10-16T12:00:00+05:30");
const context = { storeName: "Test branch", allowedModules: ["dashboard", "reports", "inventory", "finance", "tables", "kds"],
  sales: [{ id: "1", createdAt: "2026-10-16T10:00:00+05:30", total: 210, tax: 10, payment: "Cash", items: [{ name: "Tea", qty: 2, price: 100 }] },
    { id: "2", createdAt: "2026-10-15T10:00:00+05:30", total: 105, tax: 5, payment: "Card", items: [{ name: "Coffee", qty: 1, price: 100 }] }],
  refunds: [{ createdAt: "2026-10-16T11:00:00+05:30", amount: 10 }], inventory: [{ name: "Flour", sku: "F01", stock: 2, reorder: 5, unit: "kg", cost: 20, sellingPrice: 30 }],
  recipes: [{ name: "Tea", outputQty: 1, ingredients: [{ name: "Flour", qty: 100, unit: "g" }] }, { name: "Coffee", outputQty: 1, ingredients: [{ name: "Flour", qty: 50, unit: "g" }] }],
  expenses: [{ date: "2026-10-16", amount: 30, status: "Posted" }, { date: "2026-09-30", amount: 500, status: "Posted" }],
  transactions: [{ type: "Purchase", purchaseId: "P1", total: 100 }], vendorPayments: [{ amount: 40 }], vendors: [{ name: "V1" }], purchaseDrafts: [{ status: "Draft" }, { status: "PendingApproval" }],
  tableOrders: [{ status: "Ready for billing" }], kdsOrders: [{ status: "Preparing" }] };

test("answers sales with explicit period and refunds", () => {
  assert.match(answerVestyQuestion("sales today", context, now).text, /gross sales.*₹210.*net sales.*₹200/i);
  assert.match(answerVestyQuestion("orders yesterday", context, now).text, /1 completed bill/i);
  assert.match(answerVestyQuestion("top selling this week", context, now).text, /Tea.*2 sold/i);
});
test("answers stock, purchases and operations from branch data", () => {
  assert.match(answerVestyQuestion("low stock", context, now).text, /Flour.*2 kg/i);
  assert.match(answerVestyQuestion("vendor outstanding", context, now).text, /₹60/);
  assert.match(answerVestyQuestion("active table orders", context, now).text, /1 active.*1 ready.*1 order.*not completed/i);
  assert.match(answerVestyQuestion("How do I set up QZ Tray?", context, now).text, /Settings → QZ Tray setup.*digital-certificate\.txt.*private-key\.pem/i);
});
test("calculates monthly profit and loss from tax-exclusive sales, recipe food cost and expenses", () => {
  const answer = answerVestyQuestion("give me this month profit and loss", context, now).text;
  assert.match(answer, /Profit & loss for this month/i);
  assert.match(answer, /Net sales \(excluding GST\): ₹290/);
  assert.match(answer, /Food cost \(recipe COGS\): ₹5/);
  assert.match(answer, /Operating expenses: ₹30/);
  assert.match(answer, /Net profit: ₹255.*Margin: 87\.9%/);
  assert.match(answerVestyQuestion("expenses this month", context, now).text, /1 operating expense.*₹30/i);
  assert.match(answerVestyQuestion("How is profit calculated?", context, now).text, /net sales excluding GST.*recipe-based food cost.*operating expenses/i);
});
test("labels profit as provisional when a sold item has no complete recipe cost", () => {
  const incomplete = { ...context, recipes: [] };
  const answer = answerVestyQuestion("P&L today", incomplete, now).text;
  assert.match(answer, /Provisional profit & loss/i);
  assert.match(answer, /Food cost is incomplete for Tea \(2 sold\)/i);
  assert.match(answer, /before those missing food costs/i);
});
test("does not reveal restricted module information", () => {
  const restricted = { ...context, allowedModules: ["tables"] };
  assert.match(answerVestyQuestion("sales today", restricted, now).text, /does not have access/i);
  assert.match(answerVestyQuestion("low stock", restricted, now).text, /does not have access/i);
  assert.match(answerVestyQuestion("profit and loss", restricted, now).text, /does not have access/i);
});
