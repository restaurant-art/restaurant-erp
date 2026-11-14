import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultOrderHistoryScope,
  filterOrderHistory,
  isOrderFromToday,
  orderHistoryTimestamp,
} from "./pos-order-history.js";

const now = new Date(2026, 9, 29, 11, 30, 0);

test("opens all orders when there are completed bills but none from today", () => {
  const bills = [{ id: "old", createdAt: "2026-10-28T12:00:00+05:30" }];
  assert.equal(defaultOrderHistoryScope(bills, now), "All orders");
});

test("opens today's orders when at least one bill was completed today", () => {
  const bills = [
    { id: "old", createdAt: "2026-10-28T12:00:00+05:30" },
    { id: "today", createdAt: "2026-10-29T09:00:00+05:30" },
  ];
  assert.equal(defaultOrderHistoryScope(bills, now), "Today");
});

test("supports legacy bills that only have completedAt", () => {
  const bill = { id: "legacy", completedAt: "2026-10-29T08:00:00+05:30" };
  assert.equal(orderHistoryTimestamp(bill), bill.completedAt);
  assert.equal(isOrderFromToday(bill, now), true);
  assert.deepEqual(filterOrderHistory([bill], { scope: "Today", now }).map((entry) => entry.id), ["legacy"]);
});

test("searches bill contents and sorts the newest order first", () => {
  const bills = [
    { id: "older", createdAt: "2026-10-27T12:00:00+05:30", customerName: "Anu", items: [{ name: "Sugar" }] },
    { id: "newer", completedAt: "2026-10-28T12:00:00+05:30", customerName: "Anu", items: [{ name: "Rice" }] },
  ];
  assert.deepEqual(filterOrderHistory(bills, { search: "anu", now }).map((bill) => bill.id), ["newer", "older"]);
  assert.deepEqual(filterOrderHistory(bills, { search: "sugar", now }).map((bill) => bill.id), ["older"]);
});
