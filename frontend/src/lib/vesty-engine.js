const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const dayKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const includesAny = (text, words) => words.some((word) => text.includes(word));
const sum = (rows, field) => rows.reduce((total, row) => total + Number(row[field] || 0), 0);
const allowed = (context, ...modules) => modules.some((module) => context.allowedModules?.includes(module));
const normalizeName = (value) => String(value || "").trim().toLowerCase();
const unitAliases = {
  kilogram: "kg", kilograms: "kg", kgs: "kg", gram: "g", grams: "g", gm: "g", gms: "g", milligram: "mg", milligrams: "mg",
  l: "litre", ltr: "litre", liter: "litre", liters: "litre", litres: "litre", millilitre: "ml", millilitres: "ml", milliliter: "ml", milliliters: "ml",
  pc: "piece", pcs: "piece", pieces: "piece", pack: "packet", packs: "packet", packets: "packet", bottles: "bottle", cans: "can", trays: "tray", boxes: "box", cups: "cup",
};
const unitFactors = { mg: 0.001, g: 1, kg: 1000, ml: 1, litre: 1000, piece: 1, packet: 1, bottle: 1, can: 1, tray: 1, box: 1, cup: 1, spoon: 1, tablespoon: 1, teaspoon: 1, dozen: 12, bundle: 1, cylinder: 1 };

function normalizeUnit(value) {
  const unit = normalizeName(value);
  return unitAliases[unit] || unit;
}

function unitFamily(value) {
  const unit = normalizeUnit(value);
  if (["mg", "g", "kg"].includes(unit)) return "weight";
  if (["ml", "litre"].includes(unit)) return "volume";
  return "count";
}

function unitsCompatible(first, second) {
  if (!first || !second || unitFamily(first) !== unitFamily(second)) return false;
  if (unitFamily(first) !== "count") return true;
  const group = (value) => normalizeUnit(value) === "dozen" ? "piece" : normalizeUnit(value);
  return group(first) === group(second);
}

function recipeUnitCost(recipe, inventory) {
  let cost = 0;
  const missing = [];
  for (const ingredient of recipe?.ingredients || []) {
    const stockItem = (inventory || []).find((item) => normalizeName(item.name) === normalizeName(ingredient.name) && !item.parentProductId);
    if (!stockItem || !unitsCompatible(ingredient.unit, stockItem.unit)) {
      missing.push(ingredient.name || "Unnamed ingredient");
      continue;
    }
    const ingredientBaseQty = Number(ingredient.qty || 0) * (unitFactors[normalizeUnit(ingredient.unit)] || 1);
    const stockBaseQty = unitFactors[normalizeUnit(stockItem.unit)] || 1;
    cost += ingredientBaseQty * (Number(stockItem.cost || stockItem.price || 0) / stockBaseQty);
  }
  return { cost: cost / Math.max(1, Number(recipe?.outputQty || 1)), missing };
}

function profitAndLoss(context, period) {
  const bills = (context.sales || []).filter((bill) => period.includes(bill.createdAt || bill.date));
  const refunds = (context.refunds || []).filter((entry) => period.includes(entry.createdAt || entry.date));
  const expenses = (context.expenses || []).filter((entry) => period.includes(entry.date || entry.createdAt)
    && !["cancelled", "canceled", "rejected", "void", "voided", "deleted"].includes(normalizeName(entry.status)));
  const grossWithTax = sum(bills, "total");
  const outputTax = sum(bills, "tax");
  let refundWithTax = 0;
  let refundTax = 0;
  for (const refund of refunds) {
    const amount = Number(refund.amount || 0);
    refundWithTax += amount;
    if (Number.isFinite(Number(refund.taxAmount))) refundTax += Number(refund.taxAmount || 0);
    else {
      const bill = bills.find((entry) => [entry.id, entry.billId, entry.orderNumber].filter(Boolean).includes(refund.billId || refund.orderNumber));
      const billTotal = Number(bill?.total || 0);
      if (billTotal > 0) refundTax += amount * Number(bill?.tax || 0) / billTotal;
    }
  }
  const netSales = Math.max(0, grossWithTax - outputTax - (refundWithTax - refundTax));
  let foodCost = 0;
  let soldLines = 0;
  const uncosted = new Map();
  for (const item of bills.flatMap((bill) => bill.items || [])) {
    const quantity = Number(item.qty ?? item.quantity ?? 0);
    if (quantity <= 0) continue;
    soldLines += 1;
    const recipe = (context.recipes || []).find((entry) => normalizeName(entry.name) === normalizeName(item.name));
    if (!recipe) {
      uncosted.set(item.name || "Unnamed item", (uncosted.get(item.name || "Unnamed item") || 0) + quantity);
      continue;
    }
    const details = recipeUnitCost(recipe, context.inventory || []);
    if (details.missing.length) {
      uncosted.set(item.name || recipe.name, (uncosted.get(item.name || recipe.name) || 0) + quantity);
      continue;
    }
    foodCost += details.cost * quantity;
  }
  const operatingExpenses = sum(expenses, "amount");
  const grossProfit = netSales - foodCost;
  const result = grossProfit - operatingExpenses;
  const margin = netSales > 0 ? result / netSales * 100 : 0;
  return { bills, grossWithTax, outputTax, refundWithTax, refundTax, netSales, foodCost, soldLines, uncosted, operatingExpenses, grossProfit, result, margin };
}

function periodFor(question, now) {
  const today = new Date(now);
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (/yesterday/.test(question)) {
    const date = new Date(startToday); date.setDate(date.getDate() - 1);
    return { label: "yesterday", includes: (value) => dayKey(value) === dayKey(date) };
  }
  if (/this month|monthly|month/.test(question)) {
    return { label: "this month", includes: (value) => { const date = new Date(value); return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth(); } };
  }
  if (/last 7|seven days|this week|weekly|week/.test(question)) {
    const start = new Date(startToday); start.setDate(start.getDate() - 6);
    return { label: "the last 7 days", includes: (value) => { const date = new Date(value); return date >= start && date <= new Date(now); } };
  }
  if (/all time|overall|total sales|all sales/.test(question)) return { label: "all recorded dates", includes: () => true };
  return { label: "today", includes: (value) => dayKey(value) === dayKey(today) };
}

const softwareHelp = [
  { keys: ["dashboard"], text: "Dashboard shows sales, orders, kitchen activity, low stock, and branch insights." },
  { keys: ["pos", "billing", "bill"], text: "POS Billing creates bills, applies offers, collects payment, prints receipts, sends KOTs, and handles refunds." },
  { keys: ["table"], text: "Tables manages floors, seating, waiter orders, KOTs, add-ons, QR orders, and reception billing." },
  { keys: ["kds", "kitchen"], text: "KDS moves orders through New, Preparing, Ready, and Completed." },
  { keys: ["menu"], text: "Menu manages sellable dishes, categories, prices, tax, favourites, and availability." },
  { keys: ["inventory", "stock", "product master"], text: "Inventory contains Product Master, batches, categories, tax profiles, reorder levels, and stock valuation." },
  { keys: ["purchase", "vendor"], text: "Purchase supports vendor creation, draft and approval flow, batch receiving, bill discounts, freight, GST, round-off, returns, and settlements." },
  { keys: ["production", "recipe"], text: "Production manages recipes, planning, batches, food stock, wastage, and production reports." },
  { keys: ["crm", "customer"], text: "CRM uses sales history to manage customer activity and engagement." },
  { keys: ["offer", "promotion", "coupon"], text: "Offers & Promotions manages happy hours, BOGO, combos, weekend offers, and coupons." },
  { keys: ["attendance", "payroll", "face"], text: "Attendance supports Face ID, check-in/out, leave requests, records, and payroll summaries." },
  { keys: ["finance", "expense"], text: "Finance tracks expenses, income, payment information, and vendor payments." },
  { keys: ["report", "excel", "csv", "pdf"], text: "Reports provides sales, GST, item, inventory, profitability, cashier, void/refund, and branch reports with Excel, CSV, PDF, and print output." },
  { keys: ["admin", "user", "role"], text: "Admin manages users, roles, module permissions, and store assignments." },
  { keys: ["qz tray", "silent printing", "direct printing"], text: "Open Settings → QZ Tray setup. Install and run QZ Tray, verify the operating-system printer, create trusted files in QZ Tray → Advanced → Site Manager, select digital-certificate.txt and private-key.pem in UVPRO, check the connection, then configure and test the Billing and KOT printer routes." },
  { keys: ["setting", "printer", "theme"], text: "Settings manages receipt and KOT printers, bill design, store preferences, theme, and display scale." },
];

export function answerVestyQuestion(rawQuestion, context, now = new Date()) {
  const question = String(rawQuestion || "").trim().toLowerCase();
  if (!question) return { text: "Ask me a question about this branch or how UVPRO works.", suggestions: ["Today's sales", "Low stock items", "What can you help with?"] };
  if (/^(hi|hello|hey|good morning|good evening)\b/.test(question)) return { text: `Hello! I’m Vesty, your UVPRO assistant for ${context.storeName || "this branch"}. Ask me about sales, stock, purchases, orders, or how to use the software.`, suggestions: ["Today's sales", "Top-selling item this week", "Show software features"] };
  if (includesAny(question, ["what can you", "help me", "software features", "what is in this software", "all modules", "what all"])) {
    const features = softwareHelp.filter((feature) => feature.keys.some((key) => context.allowedModules?.some((module) => key.includes(module) || module.includes(key.split(" ")[0]))));
    return { text: `I can explain and answer questions about: ${features.map((item) => item.keys[0]).join(", ")}. I also calculate answers from the current ${context.storeName || "branch"} records.`, suggestions: ["Today's sales", "How does Purchase work?", "Which items are low stock?"] };
  }
  if (/\b(how|explain|purpose|what is|what does)\b/.test(question)) {
    const help = softwareHelp.find((item) => item.keys.some((key) => question.includes(key)));
    if (help) return { text: help.text, suggestions: ["What can you help with?", "Today's sales", "Low stock items"] };
  }

  const period = periodFor(question, now);
  if (includesAny(question, ["profit and loss", "profit & loss", "p&l", "income statement", "net profit", "net loss", "profit", "loss", "earnings", "margin"])) {
    if (/how.*profit|profit.*calculat|p&l.*calculat/.test(question)) return { text: "Vesty calculates profit as net sales excluding GST and refunds, minus recipe-based food cost (COGS), minus recorded operating expenses. Purchase receipts are inventory movements, so they are not treated directly as an expense. If a sold item has no complete recipe and ingredient cost, Vesty marks the result provisional." };
    if (!allowed(context, "finance", "reports", "mis")) return { text: "Your role does not have access to profit and loss information." };
    const data = profitAndLoss(context, period);
    const resultLabel = data.result >= 0 ? "Net profit" : "Net loss";
    const uncostedItems = [...data.uncosted.entries()];
    const incompleteFoodCost = uncostedItems.length > 0 || (data.bills.length > 0 && data.soldLines === 0);
    const lines = [
      `${incompleteFoodCost ? "Provisional profit & loss" : "Profit & loss"} for ${period.label}:`,
      `Net sales (excluding GST): ${money(data.netSales)} from ${data.bills.length} bill${data.bills.length === 1 ? "" : "s"}`,
      `GST excluded: ${money(data.outputTax - data.refundTax)} · Refunds excluding GST: ${money(data.refundWithTax - data.refundTax)}`,
      `Food cost (recipe COGS): ${money(data.foodCost)}`,
      `Gross profit: ${money(data.grossProfit)}`,
      `Operating expenses: ${money(data.operatingExpenses)}`,
      `${resultLabel}: ${money(Math.abs(data.result))}${data.netSales > 0 ? ` · Margin: ${data.margin.toFixed(1)}%` : ""}`,
    ];
    if (uncostedItems.length) {
      lines.push(`Food cost is incomplete for ${uncostedItems.slice(0, 5).map(([name, qty]) => `${name} (${qty} sold)`).join(", ")}${uncostedItems.length > 5 ? ` and ${uncostedItems.length - 5} more` : ""}. Add complete recipes and ingredient costs in Production for final profit.`);
      lines.push("The result shown is before those missing food costs.");
    }
    if (!data.soldLines && data.bills.length) lines.push("These bills have no item lines, so recipe food cost could not be calculated.");
    return { text: lines.join("\n"), suggestions: ["Sales this month", "Expenses this month", "How is profit calculated?"] };
  }
  if (includesAny(question, ["expense", "operating cost", "overhead"])) {
    if (!allowed(context, "finance", "reports", "mis")) return { text: "Your role does not have access to expense information." };
    const expenses = (context.expenses || []).filter((entry) => period.includes(entry.date || entry.createdAt)
      && !["cancelled", "canceled", "rejected", "void", "voided", "deleted"].includes(normalizeName(entry.status)));
    const categories = new Map();
    expenses.forEach((entry) => categories.set(entry.category || "Uncategorised", (categories.get(entry.category || "Uncategorised") || 0) + Number(entry.amount || 0)));
    const breakdown = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { text: `${expenses.length} operating expense${expenses.length === 1 ? " is" : "s are"} recorded for ${period.label}, totaling ${money(sum(expenses, "amount"))}.${breakdown.length ? ` Top categories: ${breakdown.map(([name, value]) => `${name} ${money(value)}`).join(" · ")}.` : ""}`, suggestions: ["Profit and loss this month", "Sales this month"] };
  }
  if (includesAny(question, ["sale", "revenue", "turnover", "order", "bill", "gst", "tax", "discount", "payment", "top selling", "best selling", "refund", "average bill"])
    && !includesAny(question, ["table order", "active order", "kds", "kitchen", "ready for billing"])) {
    if (!allowed(context, "dashboard", "pos", "reports", "finance", "mis")) return { text: "Your role does not have access to sales information." };
    const bills = (context.sales || []).filter((bill) => period.includes(bill.createdAt));
    const refunds = (context.refunds || []).filter((entry) => period.includes(entry.createdAt));
    const gross = sum(bills, "total");
    const refund = sum(refunds, "amount");
    if (/top|best selling|most sold/.test(question)) {
      const items = new Map();
      bills.flatMap((bill) => bill.items || []).forEach((item) => { const key = String(item.name || "Unknown"); const current = items.get(key) || { qty: 0, sales: 0 }; current.qty += Number(item.qty || 0); current.sales += Number(item.qty || 0) * Number(item.price || 0); items.set(key, current); });
      const top = [...items.entries()].sort((a, b) => b[1].qty - a[1].qty || b[1].sales - a[1].sales).slice(0, 5);
      return { text: top.length ? `Top items for ${period.label}: ${top.map(([name, data], index) => `${index + 1}. ${name} — ${data.qty} sold (${money(data.sales)})`).join("\n")}` : `No item sales are recorded for ${period.label}.`, suggestions: ["Sales this week", "Payment breakdown", "Today's orders"] };
    }
    if (/payment/.test(question)) {
      const groups = new Map(); bills.forEach((bill) => groups.set(bill.payment || "Unspecified", (groups.get(bill.payment || "Unspecified") || 0) + Number(bill.total || 0)));
      return { text: groups.size ? `Payment breakdown for ${period.label}: ${[...groups.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => `${name} ${money(value)}`).join(" · ")}.` : `No payments are recorded for ${period.label}.` };
    }
    if (/gst|tax/.test(question)) return { text: `GST recorded for ${period.label} is ${money(sum(bills, "tax"))} across ${bills.length} bill${bills.length === 1 ? "" : "s"}.` };
    if (/discount/.test(question)) return { text: `Discounts recorded for ${period.label} total ${money(sum(bills, "discount"))} across ${bills.length} bill${bills.length === 1 ? "" : "s"}.` };
    if (/refund/.test(question)) return { text: `${refunds.length} refund${refunds.length === 1 ? "" : "s"} totaling ${money(refund)} are recorded for ${period.label}.` };
    if (/average/.test(question)) return { text: `Average bill value for ${period.label} is ${money(bills.length ? gross / bills.length : 0)}, based on ${bills.length} bill${bills.length === 1 ? "" : "s"}.` };
    if (/order|bill|count|how many/.test(question) && !/sales|revenue|turnover/.test(question)) return { text: `${bills.length} completed bill${bills.length === 1 ? " is" : "s are"} recorded for ${period.label}. Gross sales are ${money(gross)}.` };
    return { text: `For ${period.label}, gross sales are ${money(gross)} from ${bills.length} bill${bills.length === 1 ? "" : "s"}. Refunds are ${money(refund)}, so net sales are ${money(gross - refund)}.`, suggestions: ["Top-selling item this week", "Payment breakdown today", "GST this month"] };
  }

  if (includesAny(question, ["stock", "inventory", "out of stock", "reorder", "product master"])) {
    if (!allowed(context, "inventory", "item-stock", "production")) return { text: "Your role does not have access to inventory information." };
    const inventory = (context.inventory || []).filter((item) => !item.parentProductId && item.status !== "Inactive");
    const low = inventory.filter((item) => Number(item.stock || 0) <= Number(item.reorder || 0));
    const out = inventory.filter((item) => Number(item.stock || 0) <= 0);
    if (/value|worth/.test(question)) return { text: `Current inventory value is ${money(inventory.reduce((total, item) => total + Number(item.stock || 0) * Number(item.cost || item.price || 0), 0))} across ${inventory.length} active products.` };
    if (/out of stock|zero stock/.test(question)) return { text: out.length ? `${out.length} item${out.length === 1 ? " is" : "s are"} out of stock: ${out.slice(0, 8).map((item) => item.name).join(", ")}${out.length > 8 ? `, and ${out.length - 8} more` : ""}.` : "No active Product Master items are out of stock." };
    if (/low|reorder/.test(question)) return { text: low.length ? `${low.length} item${low.length === 1 ? " needs" : "s need"} attention: ${low.slice(0, 8).map((item) => `${item.name} (${Number(item.stock || 0)} ${item.unit || "units"})`).join(", ")}${low.length > 8 ? `, and ${low.length - 8} more` : ""}.` : "No active Product Master items are at or below their reorder level." };
    const matched = inventory.find((item) => question.includes(String(item.name || "").toLowerCase()) || question.includes(String(item.sku || "").toLowerCase()));
    if (matched) return { text: `${matched.name} has ${Number(matched.stock || 0)} ${matched.unit || "units"} on hand. Reorder level: ${Number(matched.reorder || 0)}. Selling price: ${money(matched.sellingPrice ?? matched.mrp ?? 0)}.` };
    return { text: `Product Master has ${inventory.length} active products. ${low.length} are at or below reorder level and ${out.length} are out of stock.`, suggestions: ["Low stock items", "Out of stock items", "Inventory value"] };
  }

  if (includesAny(question, ["purchase", "supplier", "vendor", "draft", "approval", "outstanding"])) {
    if (!allowed(context, "inventory", "finance")) return { text: "Your role does not have access to purchase or vendor information." };
    const receipts = (context.transactions || []).filter((entry) => entry.type === "Purchase" && entry.purchaseId);
    const purchaseTotals = new Map(); receipts.forEach((entry) => purchaseTotals.set(entry.purchaseId, (purchaseTotals.get(entry.purchaseId) || 0) + Number(entry.total || 0)));
    const purchased = [...purchaseTotals.values()].reduce((total, value) => total + value, 0);
    const paid = sum(context.vendorPayments || [], "amount");
    const drafts = (context.purchaseDrafts || []).filter((record) => record.status === "Draft");
    const pending = (context.purchaseDrafts || []).filter((record) => record.status === "PendingApproval");
    if (/outstanding|balance|due/.test(question)) return { text: `Estimated vendor outstanding is ${money(Math.max(0, purchased - paid))}. Posted purchases total ${money(purchased)} and recorded vendor payments total ${money(paid)}.` };
    if (/draft|approval|pending/.test(question)) return { text: `${drafts.length} purchase draft${drafts.length === 1 ? "" : "s"} and ${pending.length} pending approval${pending.length === 1 ? "" : "s"} are recorded for this branch.` };
    if (/vendor|supplier/.test(question)) return { text: `${(context.vendors || []).length} vendor${(context.vendors || []).length === 1 ? " is" : "s are"} registered. Estimated outstanding across posted purchases is ${money(Math.max(0, purchased - paid))}.` };
    return { text: `${purchaseTotals.size} posted purchase${purchaseTotals.size === 1 ? "" : "s"} totaling ${money(purchased)} are recorded. There are ${drafts.length} drafts and ${pending.length} pending approvals.` };
  }

  if (includesAny(question, ["table", "kds", "kitchen", "ready for billing", "active order"])) {
    if (!allowed(context, "tables", "kds", "pos")) return { text: "Your role does not have access to table or kitchen information." };
    const openOrders = (context.tableOrders || []).filter((order) => !["Paid", "Cancelled"].includes(order.status));
    const kitchen = (context.kdsOrders || []).filter((order) => order.status !== "Completed");
    return { text: `${openOrders.length} active table order${openOrders.length === 1 ? " is" : "s are"} open, including ${openOrders.filter((order) => order.status === "Ready for billing").length} ready for billing. KDS has ${kitchen.length} order${kitchen.length === 1 ? "" : "s"} not completed.` };
  }

  const help = softwareHelp.find((item) => item.keys.some((key) => question.includes(key)));
  if (help) return { text: help.text, suggestions: ["What can you help with?", "Today's sales", "Low stock items"] };
  return { text: "I couldn’t match that question yet. I can answer about sales periods, top items, payments, GST, refunds, stock, purchases, vendors, tables, KDS, and how each UVPRO module works.", suggestions: ["Today's sales", "Top-selling item this week", "How does Purchase work?"] };
}

