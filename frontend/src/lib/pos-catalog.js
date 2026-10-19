// Use Product Master selling prices and GST, never inventory purchase costs.
export function buildProductSearchCatalog(menuItems = [], inventoryProducts = []) {
  const menu = menuItems.filter((item) => item.status !== "Inactive");
  const normalizedName = (item) => String(item.name || "").trim().toLowerCase();
  const products = inventoryProducts.filter((item) => !item.parentProductId && item.status !== "Inactive").map((item) => {
    const match = menu.find((candidate) => normalizedName(candidate) === normalizedName(item));
    return { ...match, ...item,
      category: item.category || match?.category || "Products",
      barcode: item.barcode || match?.barcode || "",
      additionalBarcodes: (item.eanMrpOptions || []).map((option) => String(option.barcode || "").trim()).filter(Boolean),
      price: Number(item.sellingPrice ?? match?.price ?? item.mrp ?? 0),
      tax: Number(item.gstRate ?? match?.tax ?? 0),
      fav: match?.fav || false,
      status: item.status || match?.status || "Active",
      image: match?.image || item.image,
      productMasterItem: true,
    };
  });
  const productNames = new Set(products.map(normalizedName));
  return [...products, ...menu.filter((item) => !productNames.has(normalizedName(item)))];
}

export function filterPosCatalog(menuItems, searchableItems, query = "", category = "All") {
  const search = query.trim().toLowerCase();
  const source = search ? searchableItems : menuItems;
  return source.filter((item) => {
    if (item.status === "Inactive") return false;
    if (!search) return category === "All" || item.category === category || (category === "Favourites" && item.fav);
    return [item.name, item.category, item.sku, item.barcode, ...(item.additionalBarcodes || [])]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}
