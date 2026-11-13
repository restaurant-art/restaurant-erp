import { stockLineKey } from "./production-transport.js";
import { reportCategoryResolver } from "./sales-by-category.js";

const lineKey = (order, line) => JSON.stringify([String(order), String(line)]);

export function kitchenServingCategory(menu, inventory, orders = [], bills = []) {
  const categoryOf = reportCategoryResolver(menu, inventory);
  const billLines = new Map();
  const orderLines = new Map();
  for (const bill of bills) {
    if (bill.training) continue;
    const reference = bill.stockOrderRef || bill.tableOrderId || bill.id;
    if (!reference) continue;
    for (const item of bill.items || []) {
      if (item && typeof item === "object") billLines.set(lineKey(reference, stockLineKey(item)), item);
    }
  }
  for (const order of orders) {
    for (const line of order.lines || []) orderLines.set(lineKey(order.reference, line.key), line.menu_key);
  }
  return (sale) => {
    const key = lineKey(sale.order, sale.line);
    const billedItem = billLines.get(key);
    const savedKey = String(sale.line || "").includes("::") ? sale.line.split("::")[0] : undefined;
    return categoryOf({ ...billedItem, id: sale.menu_key ?? orderLines.get(key) ?? billedItem?.id ?? savedKey, name: billedItem?.name || sale.menu });
  };
}

export function servingCategoryRows(sales, categoryOf) {
  const groups = new Map();
  for (const sale of sales) {
    const category = categoryOf(sale);
    const key = category.toLowerCase();
    const row = groups.get(key) || { category, quantity: 0, cost: 0, value: 0, incomplete: false };
    row.quantity += Number(sale.quantity);
    row.value += Number(sale.net_menu_value);
    row.cost += Number(sale.food_cost);
    row.incomplete ||= sale.cost_incomplete ?? !(Number(sale.food_cost) > 0);
    groups.set(key, row);
  }
  return [...groups.values()].sort((a, b) => b.value - a.value || a.category.localeCompare(b.category));
}
