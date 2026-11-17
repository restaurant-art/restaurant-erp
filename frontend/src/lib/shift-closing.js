export const SHIFT_CASH_DENOMINATIONS = Object.freeze([1, 2, 5, 10, 20, 50, 100, 200, 500]);

const emptyCounts = () => Object.fromEntries(SHIFT_CASH_DENOMINATIONS.map(value => [value, 0]));
const isBlank = value => value == null || (typeof value === "string" && !value.trim());
const decimalInput = value => typeof value === "number"
  || (typeof value === "string" && /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim()));

export function calculateCashDenominations(counts = {}) {
  const normalized = emptyCounts();
  const invalid = error => ({ total: 0, counts: normalized, valid: false, error });
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) {
    return invalid("Enter the number of notes or coins for each denomination.");
  }
  let entered = false;
  let total = 0;
  for (const denomination of SHIFT_CASH_DENOMINATIONS) {
    const raw = Object.hasOwn(counts, denomination) ? counts[denomination] : undefined;
    if (isBlank(raw)) continue;
    entered = true;
    const count = decimalInput(raw) ? Number(raw) : NaN;
    if (!decimalInput(raw) || !Number.isSafeInteger(count) || count < 0) {
      return invalid(`Enter a whole number of zero or more for ₹${denomination}.`);
    }
    normalized[denomination] = count;
    total += denomination * count;
    if (!Number.isSafeInteger(total * 100)) {
      return invalid("The cash count is too large. Check the entered quantities.");
    }
  }
  if (!entered) return invalid("Enter at least one denomination count, or enter 0 if there is no cash.");
  return { total, counts: normalized, valid: true, error: "" };
}

function parseTotal(value, label, { blankAsZero = false } = {}) {
  if (isBlank(value)) return blankAsZero
    ? { valid: true, amount: 0, error: "" }
    : { valid: false, amount: 0, error: `Enter the ${label} total, including 0 if none.` };
  if (!decimalInput(value)) return { valid: false, amount: 0, error: `Enter a valid non-negative ${label} total.` };
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false, amount: 0, error: `Enter a valid non-negative ${label} total.` };
  }
  // Reject unsupported precision rather than silently rounding the employee's declaration.
  const decimalPlaces = typeof value === "string" ? (value.trim().split(".")[1]?.length || 0) : 0;
  const cents = Math.round(amount * 100);
  const precisionTolerance = Math.min(0.0000001, Number.EPSILON * Math.max(1, amount * 100) * 4);
  if (decimalPlaces > 2 || Math.abs(amount * 100 - cents) > precisionTolerance || !Number.isSafeInteger(cents)) {
    return { valid: false, amount: 0, error: `Enter the ${label} total with no more than 2 decimal places and within the supported amount range.` };
  }
  return { valid: true, amount: cents / 100, error: "" };
}

export function validateShiftClosingEntry({ cashMode = "denominations", cashTotal, denominations, upiTotal, cardTotal, mealPassTotal = 0, couponTotal = 0, sodexoTotal = 0, giftVoucherTotal = 0 } = {}) {
  const result = {
    valid: false,
    error: "",
    cashAmount: 0,
    upiAmount: 0,
    cardAmount: 0,
    mealPassAmount: 0,
    couponAmount: 0,
    sodexoAmount: 0,
    giftVoucherAmount: 0,
    cashDenominations: cashMode === "denominations" ? emptyCounts() : null,
    cashCountMode: cashMode,
  };
  if (!["denominations", "total"].includes(cashMode)) return { ...result, error: "Choose cash denominations or total cash." };
  if (cashMode === "denominations") {
    const cash = calculateCashDenominations(denominations);
    result.cashDenominations = cash.counts;
    if (!cash.valid) return { ...result, error: cash.error };
    result.cashAmount = cash.total;
  } else {
    const cash = parseTotal(cashTotal, "cash");
    if (!cash.valid) return { ...result, error: cash.error };
    result.cashAmount = cash.amount;
  }
  for (const [value, label, key] of [
    [upiTotal, "UPI", "upiAmount"], [cardTotal, "card", "cardAmount"],
    [mealPassTotal, "Meal Pass", "mealPassAmount"], [couponTotal, "coupon", "couponAmount"],
    [sodexoTotal, "Sodexo", "sodexoAmount"], [giftVoucherTotal, "gift voucher", "giftVoucherAmount"],
  ]) {
    const parsed = parseTotal(value, label, { blankAsZero: label === "UPI" || label === "card" });
    if (!parsed.valid) return { ...result, error: parsed.error };
    result[key] = parsed.amount;
  }
  return { ...result, valid: true };
}

const roundMoney = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 || 0 : 0;
};
const isPosted = record => record && !["cancelled", "canceled", "reversed", "draft", "void", "voided"].includes(String(record.status || "").trim().toLowerCase());

// Reconciliation is saved for authorised reporting, never needed to validate a blind declaration.
export function buildShiftClosingDetails({ openingBalance = 0, bills = [], refunds = [], entry, note = "" } = {}) {
  if (!entry?.valid) throw new Error("A valid closing declaration is required.");
  const sumMethod = (records, method, refund = false) => roundMoney(records.filter(isPosted).reduce((sum, record) => {
    if (record.payment === "Split") {
      return sum + (record.splitPayments || []).filter(part => part.method === method)
        .reduce((subtotal, part) => subtotal + roundMoney(part.amount), 0);
    }
    if (record.payment !== method) return sum;
    const amount = refund
      ? record.amount
      : (method === "Cash" ? record.cashReceived : undefined) ?? record.paidAmount ?? (roundMoney(record.total) - roundMoney(record.walletRedemption));
    return sum + roundMoney(amount);
  }, 0));
  const methods = Object.fromEntries(["Cash", "UPI", "Card"].map(method => {
    const received = sumMethod(bills, method);
    const refunded = sumMethod(refunds, method, true);
    return [method, { refunds: refunded, net: roundMoney(received - refunded) }];
  }));
  const expectedClosingCash = roundMoney(roundMoney(openingBalance) + methods.Cash.net);
  const expectedClosingUpi = methods.UPI.net;
  const expectedClosingCard = methods.Card.net;
  const enteredClosingCash = roundMoney(entry.cashAmount);
  const enteredClosingUpi = roundMoney(entry.upiAmount);
  const enteredClosingCard = roundMoney(entry.cardAmount);
  const enteredClosingMealPass = roundMoney(entry.mealPassAmount);
  const enteredClosingCoupon = roundMoney(entry.couponAmount);
  const enteredClosingSodexo = roundMoney(entry.sodexoAmount);
  const enteredClosingGiftVoucher = roundMoney(entry.giftVoucherAmount);
  const expectedClosingTotal = roundMoney(expectedClosingCash + expectedClosingUpi + expectedClosingCard);
  const enteredClosingTotal = roundMoney(enteredClosingCash + enteredClosingUpi + enteredClosingCard);
  const closingNote = String(note ?? "").trim();
  return {
    expectedClosingCash,
    cashSales: methods.Cash.net,
    cashRefunds: methods.Cash.refunds,
    upiSales: methods.UPI.net,
    upiRefunds: methods.UPI.refunds,
    cardSales: methods.Card.net,
    cardRefunds: methods.Card.refunds,
    expectedClosingUpi,
    expectedClosingCard,
    enteredClosingCash,
    enteredClosingUpi,
    enteredClosingCard,
    enteredClosingMealPass,
    enteredClosingCoupon,
    enteredClosingSodexo,
    enteredClosingGiftVoucher,
    // These tenders are declarations only until POS sales support them.
    // Keep them out of the cash/UPI/card variance to avoid a false discrepancy.
    otherTenderDeclaredTotal: roundMoney(enteredClosingMealPass + enteredClosingCoupon + enteredClosingSodexo + enteredClosingGiftVoucher),
    expectedClosingTotal,
    enteredClosingTotal,
    paymentVariances: {
      Cash: roundMoney(enteredClosingCash - expectedClosingCash),
      UPI: roundMoney(enteredClosingUpi - expectedClosingUpi),
      Card: roundMoney(enteredClosingCard - expectedClosingCard),
    },
    variance: roundMoney(enteredClosingTotal - expectedClosingTotal),
    varianceNote: closingNote,
    closingNote,
    blindClosing: true,
    cashCountMode: entry.cashCountMode,
    cashDenominations: entry.cashDenominations ? { ...entry.cashDenominations } : null,
  };
}
