const moneyFromCents = (cents) => cents / 100;

export function calculatePosRoundOff(total, enabled = false) {
  const numericTotal = Number(total);
  const exactCents = Number.isFinite(numericTotal)
    ? Math.max(0, Math.round(numericTotal * 100))
    : 0;
  const payableCents = enabled ? Math.round(exactCents / 100) * 100 : exactCents;

  return {
    exactTotal: moneyFromCents(exactCents),
    payableTotal: moneyFromCents(payableCents),
    adjustment: moneyFromCents(payableCents - exactCents),
  };
}
