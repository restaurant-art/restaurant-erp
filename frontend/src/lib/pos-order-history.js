export function orderHistoryTimestamp(bill = {}) {
  return bill.createdAt || bill.completedAt || bill.date || "";
}

export function isOrderFromToday(bill, now = new Date()) {
  const value = orderHistoryTimestamp(bill);
  if (!value) return false;

  const date = new Date(value);
  const today = new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(today.getTime())) return false;

  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export function defaultOrderHistoryScope(orderHistory = [], now = new Date()) {
  return orderHistory.some((bill) => isOrderFromToday(bill, now)) ? "Today" : "All orders";
}

export function filterOrderHistory(orderHistory = [], { scope = "All orders", search = "", now = new Date() } = {}) {
  const query = String(search || "").trim().toLowerCase();

  return orderHistory
    .filter((bill) => scope !== "Today" || isOrderFromToday(bill, now))
    .filter((bill) => {
      if (!query) return true;
      const searchText = [
        bill.id,
        bill.orderNumber,
        bill.cashier,
        bill.customerName,
        bill.customerMobile,
        bill.orderType,
        bill.payment,
        ...(bill.items || []).map((item) => item.name),
      ].filter(Boolean).join(" ").toLowerCase();
      return searchText.includes(query);
    })
    .sort((left, right) => {
      const rightTime = new Date(orderHistoryTimestamp(right)).getTime();
      const leftTime = new Date(orderHistoryTimestamp(left)).getTime();
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });
}
