import { inventoryProductStock } from './inventory-stock-status.js';

const list = (value) => Array.isArray(value) ? value : [];
const lower = (value) => String(value || "").trim().toLowerCase();
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const isStatus = (record, statuses) => statuses.includes(lower(record?.status));
const priorityByTone = { critical: 3, warning: 2, neutral: 1 };

export function sortOperationalReportsByPriority(reports = []) {
  return list(reports)
    .map((report, index) => ({ report, index }))
    .sort((first, second) => {
      const firstCount = number(first.report?.count);
      const secondCount = number(second.report?.count);
      const firstHasActivity = firstCount > 0;
      const secondHasActivity = secondCount > 0;
      if (firstHasActivity !== secondHasActivity) return firstHasActivity ? -1 : 1;

      const firstPriority = Number.isFinite(Number(first.report?.priority))
        ? Number(first.report.priority)
        : priorityByTone[lower(first.report?.tone)] || 1;
      const secondPriority = Number.isFinite(Number(second.report?.priority))
        ? Number(second.report.priority)
        : priorityByTone[lower(second.report?.tone)] || 1;
      if (firstPriority !== secondPriority) return secondPriority - firstPriority;
      if (firstHasActivity && firstCount !== secondCount) return secondCount - firstCount;
      return first.index - second.index;
    })
    .map(({ report }) => report);
}

function distinctCount(records, keyFor) {
  return new Set(records.map(keyFor).filter(Boolean)).size;
}

function purchaseBillDues(purchases, payments) {
  const bills = new Map();
  purchases.filter((entry) => lower(entry.type) === "purchase").forEach((entry) => {
    const key = String(entry.purchaseId || `${lower(entry.supplier)}::${lower(entry.invoice || entry.reference)}`);
    const current = bills.get(key) || { total: 0, invoiceTotal: null };
    current.total += number(entry.total ?? entry.cost);
    if (Number.isFinite(Number(entry.invoiceSummary?.total))) current.invoiceTotal = number(entry.invoiceSummary.total);
    bills.set(key, current);
  });
  for (const [key, value] of bills) bills.set(key, value.invoiceTotal ?? value.total);
  payments.filter((entry) => !isStatus(entry, ["pending", "cancelled", "reversed"])).forEach((entry) => {
    const key = String(entry.purchaseId || `${lower(entry.vendor)}::${lower(entry.invoice || entry.reference)}`);
    if (bills.has(key)) bills.set(key, bills.get(key) - number(entry.amount));
  });
  return [...bills.values()].filter((balance) => balance > 0.005).length;
}

export function buildDashboardOperationalReports({
  inventory = [], purchaseOrders = [], purchaseDrafts = [], inventoryTransactions = [],
  vendorPayments = [], financeReceipts = [], supplierDocuments = [], shifts = [], sales = [],
  now = new Date(),
} = {}) {
  const items = list(inventory);
  const masterItems = items.filter((item) => !item.parentProductId && !item.productEanMrpBatch);
  const activeItems = masterItems.filter((item) => !isStatus(item, ["inactive", "discontinued"]));
  const orders = list(purchaseOrders);
  const drafts = list(purchaseDrafts);
  const transactions = list(inventoryTransactions);
  const documents = list(supplierDocuments);
  const receipts = list(financeReceipts);
  const completedSales = list(sales).filter((bill) => !isStatus(bill, ["cancelled", "reversed"]));
  const today = new Date(now);
  today.setHours(23, 59, 59, 999);

  const pendingBillApprovals = drafts.filter((entry) => isStatus(entry, ["pendingapproval", "pending approval", "submitted for approval"])).length
    + orders.filter((entry) => isStatus(entry, ["submitted for approval", "sent"])).length;
  const serviceBills = documents.filter((entry) => /service/.test(lower(entry.type || entry.category || entry.kind)));
  const purchaseTransactions = transactions.filter((entry) => lower(entry.type) === "purchase");
  const returnTransactions = transactions.filter((entry) => lower(entry.type) === "purchase return");
  const transferTransactions = transactions.filter((entry) => /transfer/.test(lower(entry.type)));
  const expiredStock = items.filter((item) => {
    const expiry = item.expiryDate || item.expiry;
    if (!expiry || number(item.stock) <= 0) return false;
    const expiryDate = new Date(`${String(expiry).slice(0, 10)}T23:59:59`);
    return Number.isFinite(expiryDate.getTime()) && expiryDate < today;
  }).length;
  const cards = [
    ["bill-approval", "Bill approval", pendingBillApprovals, "Purchase bills waiting for approval", "inventory", "purchase", "warning", "approval"],
    ["service-approval", "Service bill approval", serviceBills.filter((entry) => isStatus(entry, ["pending", "pending approval", "submitted"])).length, "Service bills waiting for approval", "finance", "Expenses", "warning", "approval"],
    ["open-counters", "Open counter shifts", list(shifts).filter((entry) => !entry.closedAt).length, "Counters currently open", "reports", "Cashier closing", "critical", "counter"],
    ["closing-review", "Counter closing report", list(shifts).filter((entry) => entry.closedAt && !entry.reconciledAt && !isStatus(entry, ["reconciled"])).length, "Closings pending reconciliation", "reports", "Cashier closing", "critical", "counter"],
    ["missing-ean", "Items pending EAN", activeItems.filter((item) => !String(item.barcode || item.ean || item.eanCode || "").trim() && !list(item.eanMrpOptions).some((option) => String(option.barcode || "").trim())).length, "Products without an EAN barcode", "inventory", "create", "warning", "inventory"],
    ["below-minimum", "Items below minimum price", activeItems.filter((item) => item.minimumSellingPrice != null && number(item.sellingPrice) < number(item.minimumSellingPrice)).length, "Selling price below the saved minimum", "inventory", "create", "warning", "pricing"],
    ["purchase-above-selling", "Purchase price above selling price", activeItems.filter((item) => number(item.cost) > 0 && number(item.sellingPrice) < number(item.cost)).length, "Products currently selling below cost", "inventory", "create", "critical", "pricing"],
    ["scheme-below-purchase", "Scheme price below purchase price", activeItems.filter((item) => item.schemePrice != null && number(item.schemePrice) < number(item.cost)).length, "Scheme prices below recorded cost", "offers", "All offers", "warning", "pricing"],
    ["voucher-mapping", "Voucher items pending mapping", purchaseTransactions.filter((entry) => !entry.itemId).length, "Purchase lines not linked to Product Master", "inventory", "purchase", "warning", "mapping"],
    ["zero-purchase-price", "Items with zero purchase price", activeItems.filter((item) => number(item.cost) <= 0).length, "Products without a purchase price", "inventory", "create", "warning", "pricing"],
    ["awaiting-return", "Items awaiting return", returnTransactions.filter((entry) => isStatus(entry, ["pending", "awaiting return", "draft"])).length, "Supplier returns still pending", "inventory", "purchase-return", "neutral", "return"],
    ["bill-dues", "Vendor bill dues", purchaseBillDues(purchaseTransactions, list(vendorPayments)), "Purchase invoices with an unpaid balance", "finance", "Vendor Payments", "neutral", "dues"],
    ["service-dues", "Service bill dues", serviceBills.filter((entry) => !isStatus(entry, ["paid", "cancelled", "reversed"])).length, "Service invoices due for payment", "finance", "Expenses", "neutral", "dues"],
    ["grn", "Goods receipt notes", distinctCount(purchaseTransactions, (entry) => entry.purchaseId || entry.sourceDraftId || entry.invoice), "Posted purchase receipts", "inventory", "purchase", "neutral", "receipt"],
    ["expired-stock", "Items with expired stock", expiredStock, "Expired batches that still have stock", "inventory", "variants", "critical", "expiry"],
    ["negative-stock", "Items with negative stock", masterItems.filter((item) => inventoryProductStock(item, items) < 0).length, "Products with stock below zero", "inventory", "negative-stock", "critical", "inventory"],
    ["sales-receipts", "Sales receipts", completedSales.length, "Completed POS sales receipts", "reports", "Daily sales", "neutral", "receipt"],
    ["delivery-credit", "Delivery credit sales receipts", completedSales.filter((bill) => lower(bill.orderType) === "delivery" && lower(bill.payment) === "credit").length, "Delivery sales awaiting credit collection", "finance", "Receipts", "neutral", "receipt"],
    ["paper-receipts", "Paper receipts", receipts.filter((entry) => entry.paperReceipt || /paper/.test(lower(entry.receiptType))).length, "Receipts recorded from paper documents", "finance", "Receipts", "neutral", "receipt"],
    ["po-progress", "Purchase orders in progress", orders.filter((entry) => isStatus(entry, ["submitted for approval", "sent", "approved", "partially received"])).length, "Orders moving through approval or receipt", "inventory", "purchase-order", "neutral", "purchase"],
    ["po-awaiting", "Purchase orders awaiting goods", orders.filter((entry) => isStatus(entry, ["approved", "partially received"])).length, "Approved orders not fully received", "inventory", "purchase-order", "warning", "purchase"],
    ["purchase-requests", "Purchase requests", orders.filter((entry) => isStatus(entry, ["requested", "purchase request"])).length, "Requests waiting to become orders", "inventory", "purchase-order", "neutral", "purchase"],
    ["transfer-awaiting", "Transfer notes awaiting receipt", transferTransactions.filter((entry) => isStatus(entry, ["sent", "in transit", "awaiting receipt"])).length, "Stock transfers awaiting material receipt", "inventory", "stock", "neutral", "transfer"],
    ["discontinued", "Discontinued items", masterItems.filter((item) => isStatus(item, ["inactive", "discontinued"])).length, "Products removed from active sale", "inventory", "create", "neutral", "inventory"],
    ["transfer-drafts", "Draft transfer notes", transferTransactions.filter((entry) => isStatus(entry, ["draft"])).length, "Transfer notes still in draft", "inventory", "stock", "neutral", "transfer"],
    ["po-drafts", "Draft purchase orders", orders.filter((entry) => isStatus(entry, ["draft"])).length, "Purchase orders not yet submitted", "inventory", "purchase-order", "neutral", "purchase"],
  ];
  return cards.map(([id, title, count, description, module, view, tone, icon]) => ({ id, title, count, description, module, view, tone, icon }));
}
