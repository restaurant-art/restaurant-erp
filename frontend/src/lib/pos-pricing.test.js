import test from "node:test";
import assert from "node:assert/strict";
import { withBillingPrice, repriceCart, wholesalePriceError, ecommercePriceError } from "./pos-pricing.js";
import { buildProductSearchCatalog, filterPosCatalog } from "./pos-catalog.js";

test("retail is the default; wholesale uses its own price", () => {
  const product = { id: "rice", price: 100, wholesalePrice: 80, tax: 5 };
  assert.equal(withBillingPrice(product).price, 100);
  assert.equal(withBillingPrice(product, "Wholesale").price, 80);
  assert.equal(withBillingPrice(withBillingPrice(product, "Wholesale"), "Retail").price, 100);
  assert.equal(product.price, 100);
});
test("missing or invalid wholesale values fall back visibly, while explicit zero remains valid", () => {
  for (const wholesalePrice of [undefined, null, "", " ", "oops", -1, Infinity]) {
    const row = withBillingPrice({ price: 100, wholesalePrice }, "Wholesale");
    assert.equal(row.price, 100);
    assert.equal(row.wholesaleFallback, true);
  }
  assert.equal(withBillingPrice({ price: 100, wholesalePrice: 0 }, "Wholesale").price, 0);
});
test("switching a populated cart reprices every row without changing quantity, tax, or notes", () => {
  const cart = [{ id: "a", name: "Rice", price: 100, qty: 2, tax: 5, notes: "Keep packed" }, { id: "b", name: "Tea", price: 50, qty: 3, tax: 18 }];
  const catalog = [{ id: "a", name: "Rice", wholesalePrice: 80 }, { id: "b", name: "Tea" }];
  const wholesale = repriceCart(cart, catalog, "Wholesale");
  assert.equal(wholesale.reduce((sum, item) => sum + item.price * item.qty, 0), 310);
  assert.equal(wholesale[0].tax, 5);
  assert.equal(wholesale[0].notes, "Keep packed");
  assert.equal(wholesale[1].wholesaleFallback, true);
  const retail = repriceCart(wholesale, catalog, "Retail");
  assert.deepEqual(retail.map((item) => [item.price, item.qty]), [[100, 2], [50, 3]]);
});
test("catalog preserves Product Master wholesale prices for search and barcode billing", () => {
  const catalog = buildProductSearchCatalog([{ id: "menu-rice", name: "Rice", price: 120 }], [{ id: "rice", name: "Rice", sellingPrice: 100, wholesalePrice: 80, price: 60, barcode: "1234", gstRate: 5 }]);
  const result = filterPosCatalog([], catalog, "1234").map((item) => withBillingPrice(item, "Wholesale"));
  assert.equal(result.length, 1);
  assert.equal(result[0].price, 80);
  assert.equal(result[0].retailPrice, 100);
  assert.equal(result[0].tax, 5);
});
test("wholesale price is optional, nonnegative and cannot exceed MRP", () => {
  assert.equal(wholesalePriceError("", 100), "");
  assert.equal(wholesalePriceError(0, 100), "");
  assert.equal(wholesalePriceError("80.50", 100), "");
  assert.ok(wholesalePriceError(-1, 100));
  assert.ok(wholesalePriceError("invalid", 100));
  assert.ok(wholesalePriceError(101, 100));
});
test("saved bill snapshot keeps billing mode and applied prices", () => {
  const item = withBillingPrice({ id: "a", price: 100, wholesalePrice: 80, qty: 2 }, "Wholesale");
  const bill = JSON.parse(JSON.stringify({ pricingMode: "Wholesale", items: [item] }));
  assert.equal(bill.pricingMode, "Wholesale");
  assert.equal(bill.items[0].price, 80);
  assert.equal(bill.items[0].retailPrice, 100);
});

test("e-commerce price is optional and supports zero and decimal prices within MRP", () => {
  for (const value of [undefined, null, "", " ", 0, "80.50", 100]) assert.equal(ecommercePriceError(value, 100), "");
  for (const value of [-1, "invalid", Infinity]) assert.equal(ecommercePriceError(value, 100), "E-commerce price must be zero or more.");
  assert.equal(ecommercePriceError(100.01, 100), "E-commerce price cannot be greater than MRP.");
});

test("e-commerce pricing is preserved independently without changing POS retail or wholesale prices", () => {
  const product = { id: "rice", name: "Rice", sellingPrice: 100, wholesalePrice: 80, ecommercePrice: 95.5 };
  const stored = JSON.parse(JSON.stringify(product));
  const [catalogItem] = buildProductSearchCatalog([], [stored]);
  assert.equal(catalogItem.ecommercePrice, 95.5);
  assert.equal(withBillingPrice(catalogItem, "Retail").price, 100);
  assert.equal(withBillingPrice(catalogItem, "Wholesale").price, 80);
});
