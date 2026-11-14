import test from "node:test";
import assert from "node:assert/strict";
import { calculateInclusiveBill } from "./pos-bill-totals.js";
import { categorySalesRows, reportCategoryResolver, salesBillLines } from "./sales-by-category.js";
import { kitchenServingCategory, servingCategoryRows } from "./production-category-report.js";
import { projectReportTable, visibleColumnIndices, quoteReportCsv } from "./report-columns.js";

test("mixed-category sale respects a line offer, bill discount, GST rates and till rounding", () => {
  const items = [
    { id: "meal", name: "Biryani", category: "Mains", qty: 1, price: 118, tax: 18 },
    { id: "drink", name: "Lime soda", category: "Drinks", qty: 2, price: 52.5, tax: 5 },
  ];
  const totals = calculateInclusiveBill(items, 1.23, { amount: 59, lineDiscounts: [59, 0] });
  const bill = { ...totals, id: "B-1", items, salesChannel: "Restaurant POS", discount: totals.totalDiscount,
    lineDiscounts: [59, 0], unroundedTotal: totals.total, total: 163, roundOff: .23 };
  const rows = categorySalesRows([bill], [], [bill], reportCategoryResolver());
  const mains = rows.find((row) => row.category === "Mains");
  const drinks = rows.find((row) => row.category === "Drinks");
  assert.deepEqual([mains.gross, mains.discount, mains.tax, mains.sales], [11800, 5944, 894, 4962]);
  assert.deepEqual([drinks.gross, drinks.discount, drinks.tax, drinks.sales], [10500, 79, 496, 9925]);
  assert.equal(mains.sales + drinks.sales, Math.round(totals.taxableSubtotal * 100));
  assert.equal(mains.tax + drinks.tax, Math.round(totals.tax * 100));
  assert.deepEqual([...drinks.quantities], [["portion", 2]]);
  assert.deepEqual(salesBillLines(bill).map(({ rate, sales, tax }) => [rate, sales, tax]), [[18, 4962, 894], [5, 9925, 496]]);
});

test("prior-period refunds reduce their original categories and exclude training bills", () => {
  const oldBill = { id: "B-2", orderNumber: "O-2", subtotal: 223, total: 223, tax: 23,
    items: [{ id: "B", qty: 1, price: 118, tax: 18 }, { id: "A", qty: 1, price: 105, tax: 5 }] };
  const practice = { ...oldBill, id: "TRAIN-3", orderNumber: "TRAIN-ORDER-3", training: true };
  const refunds = [
    { billId: "O-2", amount: 111.5, taxAmount: 11.5 },
    { billId: practice.id, amount: 5 },
    { billId: "Missing bill", amount: 7, taxAmount: 0 },
  ];
  const categoryOf = reportCategoryResolver([{ id: "A", category: "Drinks" }, { id: "B", category: "Mains" }]);
  const rows = categorySalesRows([practice], refunds, [oldBill, practice], categoryOf);
  assert.equal(rows.length, 3);
  const amounts = Object.fromEntries(rows.map(({ category, bills, refunds, tax, sales }) =>
    [category, [bills.size, refunds, tax, sales]]));
  assert.deepEqual(amounts, { Mains: [0, 5900, -900, -5000], Drinks: [0, 5250, -250, -5000], Uncategorized: [0, 700, 0, -700] });
});

test("category uses the saved sale and keeps incompatible quantity units separate", () => {
  const categoryOf = reportCategoryResolver([{ id: "101", name: "Rice", category: "New category" }],
    [{ id: "102", name: "Rice", category: "Other category" }]);
  const bill = { id: "B-4", subtotal: 100, total: 100, tax: 0, items: [
    { id: "101", name: "Rice", category: "Grains", price: 25, qty: 2, unit: "kg", tax: 0 },
    { id: "101", name: "Rice", category: "grains", price: 50, qty: 1, unit: "pack", tax: 0 },
  ] };
  const [group] = categorySalesRows([bill], [], [bill], categoryOf);
  assert.equal(group.category, "Grains");
  assert.deepEqual([...group.quantities], [["kg", 2], ["pack", 1]]);
  assert.equal(group.bills.size, 1);
  assert.equal(group.sales, 10000);
  assert.equal(categoryOf({ name: "Rice" }), "Uncategorized");
});

test("kitchen report joins the saved serving by order line and keeps unknown costs pending", () => {
  const menu = [{ id: "m-1", name: "Rice", category: "Mains" }, { id: "m-2", name: "Rice", category: "Sides" }];
  const bills = [{ id: "bill", stockOrderRef: "first", items: [{ id: "m-1", name: "Rice", category: "Saved mains" }] }];
  const orders = [{ reference: "second", lines: [{ key: "line", menu_key: "m-2" }] }];
  const resolve = kitchenServingCategory(menu, [], orders, bills);
  const rows = servingCategoryRows([
    { order: "first", line: "m-1::rice", menu: "Rice", quantity: "2", net_menu_value: "100", food_cost: "24", cost_incomplete: false },
    { order: "first", line: "m-1::rice", menu: "Rice", quantity: "1", net_menu_value: "50", food_cost: "0", cost_incomplete: true },
    { order: "second", line: "line", menu: "Rice", quantity: "1", net_menu_value: "35", food_cost: "8", cost_incomplete: false },
    { order: "older", line: "line", menu: "Rice", quantity: "2", net_menu_value: "70", food_cost: "16", cost_incomplete: false },
  ], resolve);
  assert.deepEqual(rows, [
    { category: "Saved mains", quantity: 3, value: 150, cost: 24, incomplete: true },
    { category: "Uncategorized", quantity: 2, value: 70, cost: 16, incomplete: false },
    { category: "Sides", quantity: 1, value: 35, cost: 8, incomplete: false },
  ]);
});

test("report exports keep the selected fields aligned through stale preferences and reordered data", () => {
  const columns = ["Category", "Refunds", "Net sales"];
  const indices = visibleColumnIndices(columns, ["Refunds", "Old field"]);
  assert.deepEqual(projectReportTable(columns, [["Mains", 3, -15], ["Sides", 0, 7]], indices), {
    columns: ["Category", "Net sales"], rows: [["Mains", -15], ["Sides", 7]],
  });
  assert.deepEqual(visibleColumnIndices(columns, columns), [0, 1, 2]);
  assert.equal(quoteReportCsv(-15), '"-15"');
});
