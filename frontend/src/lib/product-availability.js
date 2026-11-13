export function isProductEnabled(item) {
  return String(item?.status ?? "Active").toLowerCase() !== "inactive";
}

export function isProductPurchasable(item) {
  return item?.purchasable !== false;
}

export function isProductSellable(item) {
  return item?.sellable !== false;
}

export function productUsage(item) {
  // Disabling a product is independent of its configured buy/sell usage.
  const purchasable = item?.purchasable !== false;
  const sellable = item?.sellable !== false;
  return {
    purchasable,
    sellable,
    type: purchasable && !sellable ? "Asset" : "Product",
    label: purchasable && !sellable ? "Asset · purchase only" : purchasable ? "Buy & sell" : "Sell only",
  };
}

/** A disabled master must not fall back to an identically named menu item. */
export function filterSellableMenuItems(menuItems = [], inventoryProducts = []) {
  const name = (item) => String(item?.name || "").trim().toLowerCase();
  const masters = inventoryProducts.filter((item) => !item.parentProductId);
  return menuItems.filter((item) => {
    if (!isProductEnabled(item) || !isProductSellable(item)) return false;
    const matches = masters.filter((master) => (
      master.id != null && item.id != null && String(master.id) === String(item.id)
    ) || name(master) === name(item));
    return !matches.length || matches.some((master) => isProductEnabled(master) && isProductSellable(master));
  });
}

export function filterPurchasableProducts(items = []) {
  const byId = new Map(items.map((item) => [String(item.id), item]));
  return items.filter((item) => {
    if (!isProductEnabled(item) || !isProductPurchasable(item)) return false;
    const parent = item.parentProductId ? byId.get(String(item.parentProductId)) : null;
    return !parent || isProductEnabled(parent) && isProductPurchasable(parent);
  });
}
