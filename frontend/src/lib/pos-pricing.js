export function hasWholesalePrice(item) {
  const value = item?.wholesalePrice;
  return value !== null && value !== undefined && String(value).trim() !== ""
    && Number.isFinite(Number(value)) && Number(value) >= 0;
}

export function withBillingPrice(item, mode = "Retail") {
  const retailPrice = Number(item.retailPrice ?? item.price ?? 0);
  const wholesale = mode === "Wholesale" && hasWholesalePrice(item);
  return { ...item, retailPrice, price: wholesale ? Number(item.wholesalePrice) : retailPrice,
    pricingMode: mode, wholesaleFallback: mode === "Wholesale" && !wholesale };
}

export function repriceCart(cart, catalog, mode) {
  return cart.map((item) => {
    const product = catalog.find((entry) => String(entry.id) === String(item.id))
      || catalog.find((entry) => String(entry.name).trim().toLowerCase() === String(item.name).trim().toLowerCase());
    return withBillingPrice({ ...item,
      wholesalePrice: product ? product.wholesalePrice : item.wholesalePrice,
    }, mode);
  });
}

export function wholesalePriceError(value, mrp) {
  return optionalSellingPriceError(value, mrp, "Wholesale price");
}

export function ecommercePriceError(value, mrp) {
  return optionalSellingPriceError(value, mrp, "E-commerce price");
}

function optionalSellingPriceError(value, mrp, label) {
  if (value === null || value === undefined || String(value).trim() === "") return "";
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) return `${label} must be zero or more.`;
  if (String(mrp ?? "").trim() !== "" && price > Number(mrp)) return `${label} cannot be greater than MRP.`;
  return "";
}
