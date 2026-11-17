export const uncategorized = "Uncategorized";

const label = (value) => typeof value === "string" ? value.trim() : "";
const categoryLabel = (value) => {
  const name = label(value);
  return ["-", "—", uncategorized.toLowerCase()].includes(name.toLowerCase()) ? "" : name;
};
const itemIds = (item) => [item?.productionMenuKey, item?.productMasterId, item?.parentProductId, item?.id]
  .filter((id) => id != null && String(id).trim()).map(String);

export function reportCategoryResolver(...catalogs) {
  const byId = new Map();
  const byName = new Map();
  for (const catalog of catalogs) {
    for (const entry of catalog || []) {
      const category = categoryLabel(entry?.category);
      if (!category) continue;
      for (const id of itemIds(entry)) if (!byId.has(id)) byId.set(id, category);
      const name = label(entry.name).toLowerCase();
      if (!name) continue;
      const known = byName.get(name);
      if (known === undefined) byName.set(name, category);
      else if (known?.toLowerCase() !== category.toLowerCase()) byName.set(name, null);
    }
  }
  return (item) => categoryLabel(item?.category) || itemIds(item).map((id) => byId.get(id)).find(Boolean) ||
    byName.get(label(item?.name).toLowerCase()) || uncategorized;
}

const positive = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const cents = (value) => Math.round((positive(value) + Number.EPSILON) * 100);
const savedCents = (value) => value != null && value !== "" && Number.isFinite(Number(value)) ? cents(value) : null;
const sum = (values) => values.reduce((total, value) => total + value, 0);

// Allocate in cents; distribute remainders in stable line order.
function apportion(total, weights, fallback = weights) {
  const selected = weights.some((weight) => weight > 0) ? weights : fallback;
  const weightTotal = sum(selected);
  if (!weightTotal) return weights.map((_, index) => index === 0 ? total : 0);
  const ranked = selected.map((weight, index) => {
    const exact = total * weight / weightTotal;
    return { index, units: Math.floor(exact), fraction: exact % 1 };
  });
  const result = ranked.map(({ units }) => units);
  const remainder = total - sum(result);
  ranked.sort((first, second) => second.fraction - first.fraction || first.index - second.index);
  for (let index = 0; index < remainder; index += 1) result[ranked[index].index] += 1;
  return result;
}

function isCompletedBill(bill) {
  return bill && !bill.training && !String(bill.id || "").startsWith("TRAIN-") &&
    !["draft", "hold", "void", "voided", "cancelled", "canceled"].includes(label(bill.status).toLowerCase()) &&
    label(bill.paymentStatus).toLowerCase() !== "terminal pending";
}

export function salesBillLines(bill, categoryOf = () => uncategorized) {
  const inclusive = bill.taxInclusive !== false;
  const lines = (Array.isArray(bill.items) ? bill.items : []).flatMap((item, index) => {
    const quantity = positive(item?.qty ?? item?.quantity);
    if (!(quantity > 0)) return [];
    const rate = positive(item.tax ?? item.gstRate ?? item.taxRate ?? 5);
    const factor = inclusive ? 1 : 1 + rate / 100;
    const unit = label(item.salesUnit || item.unit) || (bill.salesChannel === "Restaurant POS" ? "portion" : "unit");
    return [{ category: categoryOf(item), rate, quantity, unit, amount: positive(item.price) * quantity * factor,
      offer: cents(positive(bill.lineDiscounts?.[index]) * factor), itemLine: true }];
  });
  const subtotal = inclusive ? savedCents(bill.subtotal) : null;
  const savedTax = savedCents(bill.tax);
  const taxable = savedCents(bill.taxableSubtotal);
  const recordedTotal = savedCents(bill.total);
  const beforeRounding = savedCents(bill.unroundedTotal) ?? (taxable !== null && savedTax !== null ? taxable + savedTax :
    recordedTotal == null ? null : Math.max(0, recordedTotal - Math.round((Number(bill.roundOff) || 0) * 100)));
  const recordedDiscount = cents(bill.discount);
  const gross = Math.max(beforeRounding ?? 0,
    subtotal ?? (lines.length ? cents(sum(lines.map((line) => line.amount))) : (beforeRounding ?? 0) + recordedDiscount));
  const paid = beforeRounding ?? Math.max(0, gross - recordedDiscount);
  if (!lines.length || (gross > 0 && !lines.some((line) => line.amount > 0))) {
    lines.push({ category: uncategorized, rate: 0, amount: gross, offer: 0, itemLine: false });
  }
  const lineGross = apportion(gross, lines.map((line) => line.amount));
  const discount = gross - paid;
  const lineOffers = lines.map((line, index) => Math.min(lineGross[index], line.offer));
  const offers = sum(lineOffers) <= discount ? lineOffers : apportion(discount, lineOffers);
  const manualDiscount = apportion(discount - sum(offers), lineGross.map((value, index) => value - offers[index]));
  const netInclusive = lineGross.map((value, index) => value - offers[index] - manualDiscount[index]);
  const tax = Math.min(paid, savedTax ?? (taxable != null ? Math.max(0, paid - taxable) : 0));
  const lineTax = apportion(tax, lines.map((line, index) => netInclusive[index] * line.rate / (100 + line.rate)), netInclusive);
  return lines.map((line, index) => ({
    category: line.category, itemLine: line.itemLine, rate: line.itemLine ? line.rate : null, quantity: line.quantity, unit: line.unit,
    gross: lineGross[index], discount: offers[index] + manualDiscount[index],
    tax: lineTax[index], sales: netInclusive[index] - lineTax[index],
  }));
}

export function categorySalesRows(periodBills, periodRefunds, allBills, categoryOf) {
  const groups = new Map();
  const billIndex = new Map();
  const cachedLines = new Map();
  const linesFor = (bill) => {
    if (!cachedLines.has(bill)) cachedLines.set(bill, salesBillLines(bill, categoryOf));
    return cachedLines.get(bill);
  };
  for (const bill of allBills) {
    for (const ref of [bill?.id, bill?.orderNumber].filter(Boolean)) billIndex.set(String(ref), bill);
  }
  const get = (category) => {
    const key = category.toLowerCase();
    if (!groups.has(key)) groups.set(key, { category, bills: new Set(), quantities: new Map(), lines: 0, gross: 0, discount: 0, refunds: 0, tax: 0, sales: 0 });
    return groups.get(key);
  };
  for (const [index, bill] of periodBills.entries()) {
    if (!isCompletedBill(bill)) continue;
    for (const line of linesFor(bill)) {
      const row = get(line.category);
      row.bills.add(bill.id || bill.orderNumber || index);
      row.lines += Number(line.itemLine);
      if (line.itemLine) {
        const unit = line.unit.toLowerCase();
        row.quantities.set(unit, (row.quantities.get(unit) || 0) + line.quantity);
      }
      row.gross += line.gross;
      row.discount += line.discount;
      row.tax += line.tax;
      row.sales += line.sales;
    }
  }
  for (const refund of periodRefunds) {
    const amount = cents(refund?.amount);
    if (!amount || refund.training || label(refund.status).toLowerCase() === "simulated refund" ||
        String(refund.billId || "").startsWith("TRAIN-")) continue;
    const bill = billIndex.get(String(refund.billId)) || billIndex.get(String(refund.orderNumber));
    if (bill && !isCompletedBill(bill)) continue;
    const lines = bill ? linesFor(bill) : [{ category: uncategorized, tax: 0, sales: 0 }];
    const salesWeights = lines.map((line) => line.sales);
    const taxWeights = lines.map((line) => line.tax);
    const totalWeights = lines.map((line) => line.sales + line.tax);
    const refundedTax = Math.min(amount, savedCents(refund.taxAmount ?? refund.tax) ?? (sum(totalWeights) ?
      Math.round(amount * sum(taxWeights) / (savedCents(bill?.total) || sum(totalWeights))) : 0));
    const netParts = apportion(amount - refundedTax, salesWeights, totalWeights);
    const taxParts = apportion(refundedTax, taxWeights, totalWeights);
    lines.forEach((line, index) => {
      if (!netParts[index] && !taxParts[index]) return;
      const row = get(line.category);
      row.refunds += netParts[index] + taxParts[index];
      row.tax -= taxParts[index];
      row.sales -= netParts[index];
    });
  }
  return [...groups.values()].sort((a, b) => b.sales - a.sales || a.category.localeCompare(b.category));
}
