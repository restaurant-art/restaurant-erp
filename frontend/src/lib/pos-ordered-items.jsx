import React, { useEffect, useId, useRef } from "react";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { resolvePosItemMrp } from "./pos-item-mrp.js";
import "./pos-ordered-items.css";

// Read the same cart as the receipt; quantity, conversion and void logic stay in POS.
export function PosOrderedItems({ cart, getItemKey, recentlyAddedKey, lineDiscounts = [], formatAmount, onChangeQty, onRemove, renderUnitActions }) {
  const titleId = useId();
  const scrollRef = useRef(null);
  const quantity = cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  useEffect(() => {
    if (!recentlyAddedKey || !scrollRef.current) return;
    const container = scrollRef.current;
    const rows = [...container.querySelectorAll("tbody tr")];
    const row = rows.find((entry) => entry.dataset.cartItemKey === recentlyAddedKey) || rows.at(-1);
    if (!row) return;
    const bounds = container.getBoundingClientRect();
    const rowBounds = row.getBoundingClientRect();
    const headerHeight = container.querySelector("thead")?.getBoundingClientRect().height || 0;
    if (rowBounds.top < bounds.top + headerHeight) container.scrollTop += rowBounds.top - bounds.top - headerHeight;
    else if (rowBounds.bottom > bounds.bottom) container.scrollTop += rowBounds.bottom - bounds.bottom;
  }, [cart, recentlyAddedKey]);

  return (
    <section className="erp-ordered-items" aria-labelledby={titleId}>
      <header className="erp-ordered-head">
        <div><ShoppingCart size={19} /><h2 id={titleId}>Ordered items</h2></div>
        <span aria-live="polite">{cart.length} {cart.length === 1 ? "line" : "lines"} · Qty {quantity}</span>
      </header>
      {!cart.length ? (
        <div className="erp-ordered-empty">
          <ShoppingCart size={30} strokeWidth={1.5} />
          <strong>No items added yet</strong>
          <span>Search for a product or scan its barcode above.</span>
        </div>
      ) : (
        <div className="erp-ordered-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label="Ordered items list">
          <table className="erp-ordered-table" aria-label="Ordered products">
            <thead><tr><th scope="col">#</th><th scope="col">Product</th><th scope="col">Unit</th><th scope="col" className="erp-number">MRP</th><th scope="col" className="erp-number">S. Price</th><th scope="col" className="erp-quantity-heading">Quantity</th><th scope="col" className="erp-number">Amount</th><th scope="col"><span className="erp-sr-only">Remove</span></th></tr></thead>
            <tbody>{cart.map((item, index) => {
              const itemKey = getItemKey(item);
              const quantity = Number(item.qty || 0);
              const originalAmount = Number(item.price || 0) * quantity;
              const lineDiscount = Number(lineDiscounts[index] || 0);
              const discountedUnitPrice = quantity > 0 ? Math.max(0, originalAmount - lineDiscount) / quantity : Number(item.price || 0);
              return (
                <tr key={itemKey} data-cart-item-key={itemKey} className={recentlyAddedKey === itemKey ? "is-recent" : ""}>
                  <td className="erp-line-number">{index + 1}</td>
                  <td className="erp-product-name"><strong>{item.name}</strong><small>GST {Number(item.tax ?? 5)}%</small>{(item.barcode || item.sku) && <small>{item.barcode ? `Barcode ${item.barcode}` : `SKU ${item.sku}`}</small>}{item.wholesaleFallback && <small>Retail price applied</small>}</td>
                  <td className="erp-product-unit">{item.salesUnit || item.unit || "—"}{renderUnitActions?.(item)}</td>
                  <td className="erp-number">{formatAmount(resolvePosItemMrp(item))}</td>
                  <td className="erp-number erp-unit-price">{lineDiscount > 0 ? <><del>{formatAmount(item.price)}</del><strong>{formatAmount(discountedUnitPrice)}</strong>{quantity !== 1 && <small>avg. per unit</small>}</> : formatAmount(item.price)}</td>
                  <td><div className="erp-order-quantity">
                    <button type="button" aria-label={`Decrease ${item.name}`} disabled={Number(item.qty) <= 1} onClick={() => onChangeQty(itemKey, -1)}><Minus size={14} /></button>
                    <span aria-label={`Quantity ${item.qty}`}>{item.qty}</span>
                    <button type="button" aria-label={`Increase ${item.name}`} onClick={() => onChangeQty(itemKey, 1)}><Plus size={14} /></button>
                  </div></td>
                  <td className="erp-number erp-line-amount">{lineDiscount > 0 && <del>{formatAmount(originalAmount)}</del>}<strong>{formatAmount(originalAmount - lineDiscount)}</strong></td>
                  <td><button type="button" className="erp-remove-item" aria-label={`Remove ${item.name}`} onClick={() => onRemove(itemKey)}><Trash2 size={16} /></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <footer className="erp-ordered-footer">Quantities and prices stay synced with the bill preview.</footer>
    </section>
  );
}
