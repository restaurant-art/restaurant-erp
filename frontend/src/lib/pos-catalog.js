import { expandProductUnitCatalog } from "./product-units.js";
import { isProductEnabled, isProductSellable, filterSellableMenuItems } from "./product-availability.js";

const cleanText = (value) => String(value ?? "").trim();

function expandCatalogProduct(product, stockProductId = product.id) {
  return expandProductUnitCatalog(product).map((item) => ({
    ...item,
    productMasterId: String(stockProductId),
    internalBarcode: item.id === product.id ? cleanText(product.internalBarcode) : "",
  }));
}

// Use Product Master selling prices and GST, never inventory purchase costs.
export function buildProductSearchCatalog(menuItems = [], inventoryProducts = []) {
  const menu = filterSellableMenuItems(menuItems, inventoryProducts);
  const normalizedName = (item) => String(item.name || "").trim().toLowerCase();
  const activeInventory = inventoryProducts.filter(isProductEnabled);
  const parentInventory = activeInventory.filter((item) => !item.parentProductId);
  const parentProducts = parentInventory.filter(isProductSellable);
  const baseProducts = parentProducts.map((item) => {
    const match = menu.find((candidate) => normalizedName(candidate) === normalizedName(item));
    return { ...match, ...item,
      category: item.category || match?.category || "Products",
      subcategory: item.subcategory || match?.subcategory || "",
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
  const baseById = new Map(baseProducts.map((item) => [String(item.id), item]));
  const products = baseProducts.flatMap((product) => {
    const eanMrpOptions = Array.isArray(product.eanMrpOptions) ? product.eanMrpOptions : [];
    if (!eanMrpOptions.length) return expandCatalogProduct(product);
    const combinations = [{ id: "primary", barcode: product.barcode, mrp: product.mrp, sellingPrice: product.sellingPrice }, ...eanMrpOptions]
      .filter((option) => cleanText(option.barcode) || cleanText(option.mrp));
    const batches = combinations.flatMap((option, index) => {
      const batchLabel = `Batch ${index + 1}`;
      const usesMainProductIdentity = option.id === "primary" || combinations.length === 1;
      const batchMrp = option.mrp === "" || option.mrp === null || option.mrp === undefined
        ? Number(product.mrp ?? product.price ?? 0)
        : Number(option.mrp);
      const savedBatchSellingPrice = option.sellingPrice === "" || option.sellingPrice === null || option.sellingPrice === undefined
        ? null
        : Number(option.sellingPrice);
      const batchRetailPrice = usesMainProductIdentity
        ? Number(product.price || 0)
        : Number.isFinite(savedBatchSellingPrice)
          ? savedBatchSellingPrice
          : Number.isFinite(batchMrp)
            ? batchMrp
            : Number(product.price || 0);
      const batchId = usesMainProductIdentity ? String(product.id) : `${product.id}::batch::${cleanText(option.id) || index + 1}`;
      const batch = {
        ...product,
        id: batchId,
        unitPricingGroupId: batchId,
        name: `${product.name} · ${batchLabel}`,
        barcode: cleanText(option.barcode),
        internalBarcode: usesMainProductIdentity ? product.internalBarcode : "",
        additionalBarcodes: [],
        mrp: batchMrp,
        batchMrp,
        price: batchRetailPrice,
        retailPrice: batchRetailPrice,
        sellingPrice: batchRetailPrice,
        batchLabel,
        batchBarcode: cleanText(option.barcode),
        sharedBatchStock: true,
      };
      return expandCatalogProduct(batch, product.id);
    });
    return product.internalBarcode && !batches.some((batch) => batch.internalBarcode)
      ? [...expandCatalogProduct(product), ...batches] : batches;
  });
  const stockBatches = activeInventory
    .filter((item) => item.parentProductId && isProductSellable(item) && (cleanText(item.variantLabel) || cleanText(item.sku) || cleanText(item.barcode) || item.stock !== undefined))
    .flatMap((batch) => {
    const parent = baseById.get(String(batch.parentProductId));
    if (!parent) return [];
    const batchLabel = cleanText(batch.variantLabel) || "Batch";
      const hasBatchPrice = batch.inheritPricing !== true;
      const sellingPrice = hasBatchPrice && cleanText(batch.sellingPrice) !== "" ? Number(batch.sellingPrice) : parent.price;
      const mrp = hasBatchPrice && cleanText(batch.mrp) !== "" ? batch.mrp : parent.mrp;
    const batchProduct = {
      ...parent,
      ...batch,
      id: batch.id,
      name: `${parent.name} · ${batchLabel}`,
      category: parent.category,
      subcategory: parent.subcategory,
      barcode: cleanText(batch.barcode || parent.barcode),
      internalBarcode: batch.internalBarcode,
      additionalBarcodes: [
        ...new Set([...(parent.additionalBarcodes || []), ...(batch.additionalBarcodes || [])].map(cleanText).filter(Boolean)),
      ],
      price: Number(sellingPrice || 0),
      retailPrice: Number(sellingPrice || 0),
      sellingPrice,
      wholesalePrice: hasBatchPrice ? batch.wholesalePrice ?? parent.wholesalePrice : parent.wholesalePrice,
      tax: parent.tax,
      mrp,
      alternateUnits: parent.alternateUnits,
      parentProductId: parent.id,
      parentProductName: parent.name,
      variantLabel: batchLabel,
      batchLabel,
      batchBarcode: cleanText(batch.barcode || parent.barcode),
      unitPricingGroupId: String(batch.id),
      stockBatch: true,
      productMasterItem: true,
    };
    return expandCatalogProduct(batchProduct, batch.id);
    });
  // Even a non-sellable master item must shadow an identically named legacy
  // menu entry; otherwise it could still be sold from the menu catalog.
  const productNames = new Set(inventoryProducts.filter((item) => !item.parentProductId).map(normalizedName));
  return [...products, ...stockBatches, ...menu.filter((item) => !productNames.has(normalizedName(item)))];
}

export function filterPosCatalog(menuItems, searchableItems, query = "", category = "All") {
  const search = query.trim().toLowerCase();
  const source = search ? searchableItems : menuItems;
  return source.filter((item) => {
    if (!isProductEnabled(item) || !isProductSellable(item)) return false;
    if (!search) return category === "All" || item.category === category || (category === "Favourites" && item.fav);
    return [item.name, item.parentProductName, item.variantLabel, item.batchLabel, item.category, item.subcategory, item.sku, item.plu, item.pluNumber, item.barcode, item.internalBarcode, item.batchBarcode, item.mrp, ...(item.additionalBarcodes || [])]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });
}

export function findPosBarcodeMatch(items, query) {
  const code = cleanText(query).toLowerCase();
  if (!code) return undefined;
  return items.find((item) => [item.internalBarcode, item.barcode, ...(item.additionalBarcodes || [])]
    .some((value) => cleanText(value).toLowerCase() === code));
}
