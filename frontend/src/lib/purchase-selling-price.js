// Selling price is independent of purchase cost, tax, and stock valuation.
export function applyPurchaseSellingPrices(inventory, receivedLines) {
  const prices = new Map();
  for (const line of receivedLines) {
    if (line.sellingPrice == null || String(line.sellingPrice).trim() === "") continue;
    const price = Number(line.sellingPrice);
    if (!Number.isFinite(price) || price < 0) throw new Error("Selling price must be zero or more");
    const item = inventory.find((entry) => entry.id === line.itemId);
    if (!item) throw new Error("The purchased item is no longer available");
    const productId = item.parentProductId || item.id;
    if (prices.has(productId) && prices.get(productId) !== price) {
      throw new Error(`Use the same selling price for all purchase lines of ${item.name}`);
    }
    prices.set(productId, price);
  }
  return inventory.map((item) => {
    const productId = item.parentProductId || item.id;
    return prices.has(productId) ? { ...item, sellingPrice: prices.get(productId) } : item;
  });
}
