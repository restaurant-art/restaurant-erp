const round = (value, decimals = 2) => Number(Number(value).toFixed(decimals));
const cents = (value) => Math.round(Number(value) * 100);

// Largest-remainder allocation keeps every invoice-level amount exact to a paise.
export function allocatePurchaseAmount(amount, weights) {
  if (!weights.length) return [];
  const total = cents(amount);
  const sum = weights.reduce((value, weight) => value + weight, 0);
  const shares = weights.map((weight, index) => {
    const exact = total * (sum > 0 ? weight / sum : 1 / weights.length);
    return { index, value: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = total - shares.reduce((value, share) => value + share.value, 0);
  for (const share of [...shares].sort((a, b) => b.fraction - a.fraction || a.index - b.index)) {
    if (remainder-- > 0) share.value += 1;
  }
  return shares.map((share) => share.value / 100);
}

export function calculatePurchaseInvoice(amounts = [], adjustments = {}, { strict = false } = {}) {
  const errors = [];
  const withoutTax = adjustments.billType === "urd";
  const invoiceLines = withoutTax ? amounts.map((line) => ({ ...line, taxRate: 0 })) : amounts;
  if (amounts.some((line) => !Number.isFinite(Number(line.discountPercent || 0)) || Number(line.discountPercent || 0) < 0 || Number(line.discountPercent || 0) > 100)) {
    errors.push("Discount must be between 0 and 100 percent");
  }
  const number = (value, label, max = 1e10) => {
    const result = Number(value || 0);
    if (!Number.isFinite(result) || result < 0 || result > max) {
      errors.push(`${label} must be between 0 and ${max}.`);
      return 0;
    }
    return result;
  };
  const weights = amounts.map((line) => number(line.taxableSubtotal ?? (line.subtotal - (line.discount || 0)), "Item amount"));
  const base = round(weights.reduce((sum, value) => sum + value, 0));
  // Missing basis belongs to an older invoice; never silently change its GST.
  const billDiscountBasis = adjustments.billDiscountBasis || "before_gst";
  if (!["before_gst", "after_gst"].includes(billDiscountBasis)) errors.push("Choose a valid bill discount application.");
  const afterGst = billDiscountBasis === "after_gst";
  const type = adjustments.billDiscountType || "amount";
  if (!["amount", "percent"].includes(type)) errors.push("Choose a valid bill discount type.");
  const value = number(adjustments.billDiscountValue, "Bill discount", type === "percent" ? 100 : 1e10);
  const freight = round(number(adjustments.freightCharge, "Freight charge"));
  const freightRate = withoutTax ? 0 : number(adjustments.freightGstRate, "Freight GST", 100);
  const otherCharges = round(number(adjustments.otherCharges, "Other charges"));
  const otherRate = withoutTax ? 0 : number(adjustments.otherChargesGstRate, "Other charges GST", 100);
  const freightTax = round(freight * freightRate / 100);
  const otherChargesTax = round(otherCharges * otherRate / 100);
  const itemTaxBeforeBillDiscount = round(invoiceLines.reduce((sum, line, index) =>
    sum + round(weights[index] * Number(line.taxRate || 0) / 100), 0));
  const beforeBillDiscount = round(base + itemTaxBeforeBillDiscount + freight + otherCharges + freightTax + otherChargesTax);
  const discountBase = afterGst ? beforeBillDiscount : base;
  const requestedDiscount = round(type === "percent" ? discountBase * value / 100 : value);
  if (requestedDiscount > discountBase) errors.push(afterGst
    ? "Bill discount cannot exceed the invoice total before discount."
    : "Bill discount cannot exceed the amount after item discounts.");
  const billDiscount = Math.min(requestedDiscount, discountBase);
  const splitBillDiscount = afterGst ? adjustments.billDiscountSplit !== false : true;
  const discounts = allocatePurchaseAmount(afterGst ? 0 : billDiscount, weights);
  const freights = allocatePurchaseAmount(freight, weights);
  const freightTaxes = allocatePurchaseAmount(freightTax, weights);
  const others = allocatePurchaseAmount(otherCharges, weights);
  const otherTaxes = allocatePurchaseAmount(otherChargesTax, weights);
  const adjusted = (!afterGst && billDiscount > 0) || freight > 0 || otherCharges > 0;
  const lines = invoiceLines.map((line, index) => {
    const taxableSubtotal = round(weights[index] - discounts[index]);
    const itemTax = round(taxableSubtotal * Number(line.taxRate || 0) / 100);
    const tax = round(itemTax + freightTaxes[index] + otherTaxes[index]);
    const total = round(taxableSubtotal + freights[index] + others[index] + tax);
    const netUnitCost = adjusted && line.quantity > 0
      ? round((taxableSubtotal + freights[index] + others[index]) / line.quantity, 4) : line.netUnitCost;
    return { ...line, billDiscountBasis, billDiscount: discounts[index], freightCharge: freights[index], freightTax: freightTaxes[index],
      otherCharges: others[index], otherChargesTax: otherTaxes[index], taxableSubtotal, itemTax, tax, total, netUnitCost,
      receivedUnitCost: adjusted && line.quantity > 0 ? round(total / line.quantity, 4)
        : round(Number(line.netUnitCost) * (1 + Number(line.taxRate || 0) / 100), 4) };
  });
  if (afterGst && splitBillDiscount) {
    // Keep GST unchanged, but carry each allocated share into the item cost.
    // Separate the item's pre-tax share for netUnitCost from its gross carrying
    // value; only round-off remains a payable-only adjustment.
    const payableDiscounts = allocatePurchaseAmount(billDiscount, lines.map((line) => line.total));
    lines.forEach((line, index) => {
      const grossTotal = line.total;
      line.billDiscount = payableDiscounts[index];
      line.total = round(grossTotal - line.billDiscount);
      if (line.quantity > 0) {
        const preTaxCost = line.taxableSubtotal + line.freightCharge + line.otherCharges;
        const preTaxShare = grossTotal > 0 ? line.billDiscount * preTaxCost / grossTotal : 0;
        line.netUnitCost = round(Math.max(0, preTaxCost - preTaxShare) / line.quantity, 4);
        line.receivedUnitCost = round(line.total / line.quantity, 4);
      }
    });
  }
  const itemTax = round(lines.reduce((sum, line) => sum + line.itemTax, 0));
  const billDiscountTaxReduction = round(itemTaxBeforeBillDiscount - itemTax);
  const tax = round(itemTax + freightTax + otherChargesTax);
  const beforeRoundOff = round(base - billDiscount + freight + otherCharges + tax);
  const roundOffMode = adjustments.roundOffMode || "none";
  if (!["none", "nearest", "manual"].includes(roundOffMode)) errors.push("Choose a valid round-off option.");
  let roundOff = 0;
  if (roundOffMode === "nearest") {
    roundOff = round(Math.floor((cents(beforeRoundOff) + 50) / 100) - beforeRoundOff);
  } else if (roundOffMode === "manual") {
    const entered = Number(adjustments.roundOffValue ?? 0);
    if (!Number.isFinite(entered) || Math.abs(entered) > 1e10) {
      errors.push("Enter a valid round-off amount.");
    } else {
      roundOff = round(entered);
    }
  }
  if (round(beforeRoundOff + roundOff) < 0) {
    errors.push("Round off cannot make the invoice total negative.");
    roundOff = 0;
  }
  // Round off is an after-tax payable adjustment, not a change to GST or stock cost.
  const roundOffShares = allocatePurchaseAmount(Math.abs(roundOff), lines.map((line) => line.total));
  lines.forEach((line, index) => {
    line.roundOff = roundOff === 0 ? 0 : round(roundOffShares[index] * Math.sign(roundOff));
    line.total = round(line.total + line.roundOff);
  });
  const totals = { ...(adjustments.billType && { billType: adjustments.billType }), subtotal: round(amounts.reduce((sum, line) => sum + Number(line.subtotal || 0), 0)),
    discount: round(amounts.reduce((sum, line) => sum + Number(line.discount || 0), 0)), billDiscount,
    taxableSubtotal: round(base - (afterGst ? 0 : billDiscount)), freight, freightTax, otherCharges, otherChargesTax, itemTax, tax,
    billDiscountBasis, billDiscountSplit: splitBillDiscount, billDiscountTaxReduction, beforeBillDiscount,
    beforeRoundOff, roundOff, total: round(beforeRoundOff + roundOff) };
  if (strict && errors.length) throw new Error(errors[0]);
  return { lines, totals, errors };
}
