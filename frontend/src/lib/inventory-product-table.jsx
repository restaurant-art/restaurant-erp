import React, { useState } from "react";
import { Search, Pencil, ClipboardCheck, History, PackageSearch } from "lucide-react";
import { buildInventoryProductList, filterInventoryProductList } from "./inventory-product-list.js";
import { ProductBarcodeButton } from "./barcode-printing.jsx";
import "./inventory-product-table.css";

const quantity = (value) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 6 });
const amount = (value, digits = 2) => value === "" || value == null || !Number.isFinite(Number(value))
  ? "—" : "₹" + Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: digits });
const percent = (value) => value == null || value === "" ? "—" : Number(value).toFixed(2) + "%";

export function InventoryProductTable({ data, location, onLocationChange, onEditStock, onFullStockTake, onSavedCounts, onToggleStatus, can }) {
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const products = buildInventoryProductList(data, location);
  const visible = filterInventoryProductList(products, query, stockFilter, statusFilter);
  const columns = ["Product", "Quantity", "SKU", "PLU", "EAN code", "HSN", "GST", "Price", "Cost (incl. GST)", "MRP", "Selling price", "Wholesale price", "E-commerce price", "Card price", "Margin", "Margin %", "Markup %", "Reorder at", "Department", "Category", "Sub-category", "Brand", "Manufacturer", "Unit", "Batches", "Actions"];
  return <section className="inventory-items-catalog">
    <header className="inventory-items-list-head">
      <div><span>Inventory</span><h3>Created products</h3></div>
      <strong className="inventory-items-total">{products.length} total</strong>
    </header>
    <div className="inventory-items-controls">
      <label><span>Stock location</span><select aria-label="Inventory items stock location" value={location} onChange={(event) => onLocationChange(event.target.value)}>{data.locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
      <label><span>Product status</span><select aria-label="Inventory items product status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>{["All", "Enabled", "Disabled"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <div className="inventory-items-top-actions">
        <button type="button" disabled={!can("start_count") || !products.length || !location} onClick={onFullStockTake}><ClipboardCheck size={16} /> Full stock take</button>
        <button type="button" className="kp-quiet" onClick={onSavedCounts}><History size={16} /> Saved counts</button>
      </div>
    </div>
    <div className="inventory-items-toolbar">
      <label className="inventory-items-search"><Search size={19} /><input type="search" aria-label="Search inventory products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products by name, SKU, PLU, HSN, or category" /></label>
      <div className="inventory-items-filters" role="group" aria-label="Inventory product stock filter">{["All", "Low stock", "Negative stock", "Watch", "Healthy"].map((value) => <button key={value} type="button" className={stockFilter === value ? "active" : ""} aria-pressed={stockFilter === value} onClick={() => setStockFilter(value)}>{value}</button>)}</div>
      <span className="inventory-items-result" role="status">{visible.length} of {products.length} products</span>
    </div>
    <div className="inventory-items-table-wrap">
      <table className="inventory-items-table" aria-label="Inventory items product list">
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{visible.map((product) => <tr key={product.id}>
          <td><div className="inventory-items-product"><span className="inventory-items-avatar" aria-hidden="true">{String(product.name || "P").slice(0, 1).toUpperCase()}</span><div><strong>{product.name}</strong><span className={product.enabled ? "inventory-product-enabled" : "inventory-product-disabled"}>{product.enabled ? "Enabled" : "Disabled"}</span><small>{product.subcategory || product.category || "Product Master"}</small></div></div></td>
          <td className="inventory-items-stock"><strong>{quantity(product.pack_tracking ? product.unopened_packs : product.stock_quantity)}</strong> <span>{product.unit || "units"}{product.pack_tracking ? " unopened" : ""}</span>{product.pack_tracking && <small>{quantity(product.loose_quantity)} {product.stock_base_unit} loose · {quantity(product.total_base_quantity)} {product.stock_base_unit} total{product.unverified ? " · Stock needs verification" : ""}</small>}</td>
          <td>{product.sku || "—"}</td><td>{product.plu || "—"}</td><td>{product.barcode || "—"}</td><td>{product.hsnCode || "—"}</td><td>{product.gstRate == null || product.gstRate === "" ? "—" : quantity(product.gstRate) + "%"}</td>
          <td>{amount(product.price, 4)}</td><td>{amount(product.cost, 4)}</td><td>{amount(product.sellable === false ? null : product.mrp)}</td><td>{amount(product.sellable === false ? null : product.sellingPrice)}</td><td>{amount(product.sellable === false ? null : product.wholesalePrice)}</td><td>{amount(product.sellable === false ? null : product.ecommercePrice)}</td><td>{amount(product.sellable === false ? null : product.cardPrice)}</td><td>{amount(product.margin_amount)}</td><td>{percent(product.margin_percent)}</td><td>{percent(product.markup_percent)}</td>
          <td>{quantity(product.reorder)} {product.unit}</td><td>{product.department || "—"}</td><td>{product.category || "—"}</td><td>{product.subcategory || "—"}</td><td>{product.brand || "—"}</td><td>{product.manufacturer || "—"}</td><td>{product.unit || "—"}</td><td>{product.batch_count}</td>
          <td><div className="inventory-items-row-actions"><ProductBarcodeButton product={product} compact />{can("start_count") && <button className="kp-quiet" type="button" onClick={() => onEditStock(product)} disabled={!location || !product.stock_editable} title={product.stock_editable ? "Correct stock quantities" : "Save the product in Product Master to link stock first"} aria-label={"Edit stock for " + product.name}><Pencil size={15} /> Edit stock</button>}{can("product_status") && <button type="button" className={product.enabled ? "product-disable-action" : "product-enable-action"} onClick={() => onToggleStatus(product)} aria-label={(product.enabled ? "Disable " : "Enable ") + product.name}>{product.enabled ? "Disable" : "Enable"}</button>}</div></td>
        </tr>)}</tbody>
        {!visible.length && <tbody><tr><td colSpan={columns.length}><div className="inventory-items-empty"><PackageSearch size={28} /><strong>{products.length ? "No products match your filters" : "No products have been created"}</strong><span>{products.length ? "Try another search or select All." : "Create products in Product Master to list them here."}</span></div></td></tr></tbody>}
      </table>
    </div>
    <p className="inventory-items-footnote">Stock is shown for the selected location. Use Edit stock for quantity corrections; unopened packs and loose contents stay separate.</p>
  </section>;
}
