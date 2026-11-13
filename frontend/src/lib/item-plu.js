export function normalizePluNumber(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits)).padStart(4, "0");
}

export function nextAvailablePluNumber(items = [], excludedItemId = "") {
  const used = new Set(items
    .filter((item) => String(item?.id || "") !== String(excludedItemId || ""))
    .map((item) => normalizePluNumber(item?.pluNumber))
    .filter(Boolean));
  let number = 1;
  while (used.has(String(number).padStart(4, "0"))) number += 1;
  return String(number).padStart(4, "0");
}
