import test from "node:test";
import assert from "node:assert/strict";
import { filterPurchasableProducts, filterSellableMenuItems, isProductEnabled, isProductPurchasable, isProductSellable, productUsage } from "./product-availability.js";

test("legacy products remain purchasable and sellable by default", () => {
  assert.deepEqual(productUsage({ id: "legacy" }), {
    purchasable: true,
    sellable: true,
    type: "Product",
    label: "Buy & sell",
  });
});

test("a purchasable non-sellable product is identified as a purchase-only asset", () => {
  assert.deepEqual(productUsage({ purchasable: true, sellable: false }), {
    purchasable: true,
    sellable: false,
    type: "Asset",
    label: "Asset · purchase only",
  });
});

test("purchase selection excludes disabled products and batches of disabled parents", () => {
  const products = [
    { id: "stock" },
    { id: "blocked", purchasable: false },
    { id: "blocked-batch", parentProductId: "blocked", variantLabel: "Batch 1" },
    { id: "asset", purchasable: true, sellable: false },
    { id: "asset-batch", parentProductId: "asset", variantLabel: "Batch 1" },
  ];
  assert.deepEqual(filterPurchasableProducts(products).map(({ id }) => id), ["stock", "asset", "asset-batch"]);
});

test("disabling preserves configured usage and re-enabling restores original eligibility", () => {
  const asset = { id: "equipment", status: "Inactive", purchasable: true, sellable: false };
  assert.equal(isProductEnabled({ id: "legacy" }), true);
  assert.equal(isProductEnabled(asset), false);
  assert.equal(isProductPurchasable(asset), true);
  assert.equal(isProductSellable(asset), false);
  assert.deepEqual(filterPurchasableProducts([asset]), []);
  assert.deepEqual(productUsage(asset), {
    purchasable: true, sellable: false, type: "Asset", label: "Asset · purchase only",
  });
  const enabled = { ...asset, status: "Active" };
  assert.equal(isProductPurchasable(enabled), true);
  assert.equal(isProductSellable(enabled), false);
  assert.equal(asset.status, "Inactive");
});

test("purchase selection excludes inactive parents and retains each batch's own status", () => {
  const products = [
    { id: "parent", status: "Inactive" },
    { id: "active-batch", parentProductId: "parent", status: "Active" },
    { id: "inactive-batch", parentProductId: "parent", status: "Inactive" },
    { id: "retail-only", status: "Active", purchasable: false, sellable: true },
  ];
  assert.deepEqual(filterPurchasableProducts(products), []);
  const restored = products.map((product) => product.id === "parent" ? { ...product, status: "Active" } : product);
  assert.deepEqual(filterPurchasableProducts(restored).map((product) => product.id), ["parent", "active-batch"]);
});

test("disabled masters shadow matching legacy menu entries during browsing", () => {
  const menu = [{ id: "old", name: " Masala ", status: "Active" }, { id: "meal", name: "Dosa" }];
  const masters = [{ id: "master", name: "masala", status: "Inactive", sellable: true }];
  assert.deepEqual(filterSellableMenuItems(menu, masters).map((item) => item.id), ["meal"]);
  assert.deepEqual(filterSellableMenuItems(menu, [{ ...masters[0], status: "Active" }]), menu);
  assert.deepEqual(filterSellableMenuItems([{ id: "master", name: "Old product name" }], masters), []);
});
