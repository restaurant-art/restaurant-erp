import React, { useMemo, useRef, useState } from "react";
import { CalendarClock, CircleCheck, ClipboardList, PackageSearch, Pencil, Plus, ReceiptText, RotateCcw, Save, Search, Send, Trash2, X } from "lucide-react";
import { nextPurchaseOrderNumber, normalizePurchaseRate, purchaseOrderLineAmounts, purchaseOrdersForVendor, purchaseOrderStatuses, purchaseOrderTotals, recallPurchaseOrderLines } from "./purchase-orders.js";
import { PurchaseItemPicker } from "./purchase-item-picker.jsx";
import { PurchaseGstSelect } from "./purchase-gst-select.jsx";
import { purchaseBatchFields } from "./purchase-batches.js";
import { handlePurchaseArrowNavigation, purchaseEditableFields } from "./purchase-keyboard.js";
import "./purchase-orders.css";

const emptyLine = () => ({ id: crypto.randomUUID(), itemId: "", itemName: "", sku: "", hsnCode: "", unit: "pcs", quantity: "", unitCost: "", discountPercent: "0", gstRate: "5" });
const gstRates = [0, 3, 5, 12, 18, 28];

export function PurchaseOrdersWorkspace({ orders = [], setOrders, vendors = [], items = [], canManage, notify, formatMoney, today, onCreatePurchase, getLastPurchaseCost }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [recallOrderId, setRecallOrderId] = useState("");
  const itemRefs = useRef(new Map());
  const [draft, setDraft] = useState(() => ({ vendor: "", orderDate: today, expectedDate: "", reference: "", notes: "", status: "Draft", lines: [emptyLine()] }));
  const products = useMemo(() => items.filter((item) => item.status !== "Inactive" && !item.parentProductId && !item.productEanMrpBatch), [items]);
  const totals = purchaseOrderTotals(draft.lines);
  const vendorOrders = useMemo(() => purchaseOrdersForVendor(orders, draft.vendor, editingId), [orders, draft.vendor, editingId]);
  const visibleOrders = orders.filter((order) => {
    const text = `${order.poNumber} ${order.vendor} ${order.reference} ${order.notes}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (statusFilter === "All" || order.status === statusFilter);
  });
  const committedValue = orders.filter((order) => !["Draft", "Cancelled"].includes(order.status)).reduce((sum, order) => sum + Number(order.total || 0), 0);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId("");
    setRecallOrderId("");
    setDraft({ vendor: "", orderDate: today, expectedDate: "", reference: "", notes: "", status: "Draft", lines: [emptyLine()] });
  };
  const openCreate = () => {
    if (!canManage) return notify("Only an administrator can manage purchase orders");
    setEditingId("");
    setRecallOrderId("");
    setDraft({ vendor: "", orderDate: today, expectedDate: "", reference: "", notes: "", status: "Draft", lines: [emptyLine()] });
    setFormOpen(true);
  };
  const openEdit = (order) => {
    if (!canManage) return notify("Only an administrator can manage purchase orders");
    if (order.status !== "Draft") return notify("Only draft purchase orders can be edited");
    setEditingId(order.id);
    setRecallOrderId("");
    setDraft({
      vendor: order.vendor || "", orderDate: order.orderDate || today, expectedDate: order.expectedDate || "",
      reference: order.reference || "", notes: order.notes || "", status: order.status || "Draft",
      lines: (order.lines || []).map((line) => ({ ...line, id: line.id || crypto.randomUUID(), quantity: String(line.quantity ?? ""), unitCost: normalizePurchaseRate(line.unitCost), discountPercent: String(line.discountPercent ?? 0), gstRate: String(line.gstRate ?? 0) })),
    });
    setFormOpen(true);
  };
  const updateLine = (lineId, patch) => setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line) }));
  const addLine = () => {
    const line = emptyLine();
    setDraft((current) => ({ ...current, lines: [...current.lines, line] }));
    window.requestAnimationFrame(() => itemRefs.current.get(line.id)?.focus());
  };
  const recallPreviousOrder = () => {
    const previousOrder = vendorOrders.find((order) => order.id === recallOrderId);
    if (!previousOrder) return notify("Select a previous purchase order to recall");
    const recalledLines = recallPurchaseOrderLines(previousOrder);
    if (!recalledLines.length) return notify(`${previousOrder.poNumber} has no items to recall`);
    const hasEnteredItems = draft.lines.some((line) => line.itemId || line.quantity || line.unitCost);
    if (hasEnteredItems && !window.confirm(`Replace the current items with ${previousOrder.poNumber}?`)) return;
    setDraft((current) => ({ ...current, lines: recalledLines }));
    notify(`${previousOrder.poNumber} recalled · ${recalledLines.length} item${recalledLines.length === 1 ? "" : "s"} loaded`);
    window.requestAnimationFrame(() => itemRefs.current.get(recalledLines[0]?.id)?.focus());
  };
  const handleLineKeyDown = (event) => {
    if (event.defaultPrevented || event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.nativeEvent?.isComposing) return;
    const row = event.target.closest(".purchase-order-line");
    if (!row || !event.target.matches(purchaseEditableFields)) return;
    event.preventDefault();
    const fields = Array.from(row.querySelectorAll(purchaseEditableFields)).filter((field) => field.getClientRects().length);
    const next = fields[fields.indexOf(event.target) + 1];
    if (next) next.focus();
    else addLine();
  };
  const chooseItem = (lineId, itemId, batch) => {
    const item = products.find((entry) => entry.id === itemId);
    updateLine(lineId, item ? {
      ...purchaseBatchFields(batch),
      itemId: item.id, itemName: item.name, sku: item.sku || "", hsnCode: item.hsnCode || "", unit: item.unit || "pcs",
      unitCost: normalizePurchaseRate(item.cost ?? item.price), gstRate: String(item.gstRate ?? 0),
    } : { ...purchaseBatchFields(), itemId: "", itemName: "", sku: "", hsnCode: "", unit: "pcs", unitCost: "", gstRate: "5" });
  };
  const saveOrder = (event) => {
    event.preventDefault();
    if (!canManage) return notify("Only an administrator can manage purchase orders");
    const lines = draft.lines.filter((line) => line.itemId || Number(line.quantity || 0) || Number(line.unitCost || 0));
    if (!draft.vendor) return notify("Select a vendor");
    if (!lines.length || lines.some((line) => !line.itemId || Number(line.quantity || 0) <= 0 || Number(line.unitCost || 0) < 0)) return notify("Select an item and enter a valid quantity and rate for every line");
    const existing = orders.find((order) => order.id === editingId);
    const lineRecords = lines.map((line) => ({ ...line, quantity: Number(line.quantity), unitCost: Number(normalizePurchaseRate(line.unitCost)), discountPercent: Number(line.discountPercent || 0), gstRate: Number(line.gstRate || 0), ...purchaseOrderLineAmounts({ ...line, unitCost: normalizePurchaseRate(line.unitCost) }) }));
    const invoiceTotals = purchaseOrderTotals(lineRecords);
    const record = {
      ...(existing || {}),
      id: existing?.id || `PO-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      poNumber: existing?.poNumber || nextPurchaseOrderNumber(orders, draft.orderDate || today),
      vendor: draft.vendor,
      orderDate: draft.orderDate || today,
      expectedDate: draft.expectedDate,
      reference: draft.reference.trim(),
      notes: draft.notes.trim(),
      status: "Draft",
      lines: lineRecords,
      itemCount: lineRecords.length,
      ...invoiceTotals,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    setOrders((current) => existing ? current.map((order) => order.id === existing.id ? record : order) : [record, ...current]);
    notify(existing ? `${record.poNumber} draft updated` : `${record.poNumber} saved as draft`);
    resetForm();
  };
  const updateOrderStatus = (order, status, message, timestampField) => {
    if (!canManage) return notify("Only an administrator can manage purchase orders");
    const now = new Date().toISOString();
    setOrders((current) => current.map((entry) => entry.id === order.id ? { ...entry, status, updatedAt: now, ...(timestampField ? { [timestampField]: now } : {}) } : entry));
    notify(`${order.poNumber} ${message}`);
  };
  const submitOrder = (order) => {
    if (order.status !== "Draft") return notify("Only draft purchase orders can be submitted");
    updateOrderStatus(order, "Submitted for approval", "submitted for approval", "submittedAt");
  };
  const approveOrder = (order) => {
    if (!["Submitted for approval", "Sent"].includes(order.status)) return notify("Submit the purchase order before approval");
    updateOrderStatus(order, "Approved", "approved", "approvedAt");
  };
  const returnOrderToDraft = (order) => {
    if (!["Submitted for approval", "Sent"].includes(order.status)) return notify("Only submitted purchase orders can return to draft");
    updateOrderStatus(order, "Draft", "returned to draft");
  };
  const deleteOrder = (order) => {
    if (order.status !== "Draft") return notify("Only draft purchase orders can be deleted");
    if (!window.confirm(`Delete ${order.poNumber}?`)) return;
    setOrders((current) => current.filter((entry) => entry.id !== order.id));
    notify(`${order.poNumber} deleted`);
  };
  const receiveOrder = (order) => {
    if (!["Approved", "Partially received"].includes(order.status)) return notify("Approve this purchase order before receiving it");
    onCreatePurchase?.(order);
  };

  return <section className="screen inventory-screen purchase-order-screen">
    <div className="purchase-order-hero">
      <div><span>Procurement</span><h2>Purchase orders</h2><p>Plan supplier orders first, then receive approved items through Purchase Entry.</p></div>
      <button type="button" className="purchase-order-primary" onClick={openCreate}><Plus size={18} />Create purchase order</button>
    </div>
    <div className="purchase-order-metrics">
      <article><ClipboardList size={20} /><div><small>Total orders</small><strong>{orders.length}</strong><span>{orders.filter((order) => order.status === "Draft").length} drafts</span></div></article>
      <article><Send size={20} /><div><small>Open orders</small><strong>{orders.filter((order) => ["Submitted for approval", "Sent", "Approved", "Partially received"].includes(order.status)).length}</strong><span>Awaiting approval or receipt</span></div></article>
      <article><CircleCheck size={20} /><div><small>Closed</small><strong>{orders.filter((order) => order.status === "Closed").length}</strong><span>Completed orders</span></div></article>
      <article><ReceiptText size={20} /><div><small>Committed value</small><strong>{formatMoney(committedValue)}</strong><span>Excludes drafts and cancelled</span></div></article>
    </div>

    <section className="panel purchase-order-panel">
      <div className="purchase-order-toolbar">
        <label className="purchase-order-search"><Search size={18} /><input aria-label="Search purchase orders" placeholder="Search PO, vendor, or reference" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="purchase-order-status-filter" role="group" aria-label="Filter purchase orders by status">{["All", ...purchaseOrderStatuses].map((status) => <button type="button" key={status} className={statusFilter === status ? "active" : ""} onClick={() => setStatusFilter(status)}>{status}</button>)}</div>
      </div>

      {formOpen && <div className="purchase-entry-modal-backdrop purchase-order-modal-backdrop" role="presentation">
      <form className="purchase-order-form purchase-entry-modal purchase-order-modal" role="dialog" aria-modal="true" aria-labelledby="purchase-order-dialog-title" onSubmit={saveOrder} onKeyDown={(event) => handlePurchaseArrowNavigation(event, { rowSelector: ".purchase-order-line", gridSelector: ".purchase-order-line" })}>
        <div className="purchase-order-form-head"><div><span>{editingId ? "Update order" : "New order"}</span><h3 id="purchase-order-dialog-title">{editingId ? orders.find((order) => order.id === editingId)?.poNumber : "Create purchase order"}</h3><p>Plan supplier items, prices, tax, and expected delivery in one place.</p></div><button type="button" className="purchase-order-close" title="Close purchase order form" aria-label="Close purchase order form" onClick={resetForm}><X size={18} /></button></div>
        <div className="purchase-order-meta">
          <label>Vendor<select autoFocus value={draft.vendor} onChange={(event) => { setRecallOrderId(""); setDraft((current) => ({ ...current, vendor: event.target.value })); }} required><option value="">Select vendor</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.name}>{vendor.name}</option>)}</select></label>
          <label>Order date<input type="date" value={draft.orderDate} onChange={(event) => setDraft((current) => ({ ...current, orderDate: event.target.value }))} required /></label>
          <label>Expected delivery<input type="date" min={draft.orderDate || today} value={draft.expectedDate} onChange={(event) => setDraft((current) => ({ ...current, expectedDate: event.target.value }))} /></label>
          <label className="purchase-order-reference">Supplier reference<input value={draft.reference} onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))} placeholder="Quotation or reference" /></label>
          <label className="purchase-order-notes">Notes<input value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Delivery or purchase notes" /></label>
        </div>
        {!editingId && draft.vendor && <section className="purchase-order-recall" aria-label="Recall previous purchase order">
          <div><strong>Recall previous order</strong><span>Load all items from an earlier order for {draft.vendor}.</span></div>
          {vendorOrders.length ? <div className="purchase-order-recall-controls"><select aria-label="Previous purchase order" value={recallOrderId} onChange={(event) => setRecallOrderId(event.target.value)}><option value="">Select previous purchase order</option>{vendorOrders.map((order) => <option key={order.id} value={order.id}>{order.poNumber} · {order.orderDate || "No date"} · {order.itemCount || order.lines.length} items · {formatMoney(order.total || 0)} · {order.status}</option>)}</select><button type="button" disabled={!recallOrderId} onClick={recallPreviousOrder}><RotateCcw size={16} />Recall items</button></div> : <span className="purchase-order-recall-empty">No previous purchase orders found for this vendor.</span>}
        </section>}
        <div className="purchase-order-lines-head"><div><strong>Ordered items</strong><span>Purchase rate is before GST and can be changed to match the supplier quotation. Enter on GST adds a line.</span></div><button type="button" onClick={addLine}><Plus size={16} />Add item</button></div>
        <div className="purchase-order-lines" onKeyDown={handleLineKeyDown}>
          {draft.lines.map((line, index) => { const amounts = purchaseOrderLineAmounts(line); const selectedItem = products.find((item) => item.id === line.itemId); const lastPurchaseCost = getLastPurchaseCost?.(selectedItem) ?? null; return <div className="purchase-order-line" key={line.id}>
            <span className="purchase-order-line-number">{index + 1}</span>
            <div className="purchase-order-item-field"><PurchaseItemPicker items={products} value={line.itemId} batchKey={line.batchKey} lineNumber={index + 1} allowCreate={false} required inputRef={(element) => { if (element) itemRefs.current.set(line.id, element); else itemRefs.current.delete(line.id); }} onSelect={(itemId, batch) => chooseItem(line.id, itemId, batch)} /><small>{[line.sku ? `SKU ${line.sku}` : "Choose from Product Master", line.batchLabel, line.batchBarcode ? `EAN ${line.batchBarcode}` : "", line.batchMrp !== "" && line.batchMrp != null ? `MRP ${formatMoney(Number(line.batchMrp))}` : ""].filter(Boolean).join(" · ")}</small></div>
            <label>Quantity<input aria-label={`Quantity ${index + 1}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => updateLine(line.id, { quantity: event.target.value })} required /></label>
            <label>Unit<input value={line.unit} readOnly /></label>
            <label className="purchase-order-rate-field">Purchase rate / unit<input aria-label={`Rate ${index + 1}`} type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(line.id, { unitCost: event.target.value })} onBlur={(event) => updateLine(line.id, { unitCost: normalizePurchaseRate(event.target.value) })} required /><small>{lastPurchaseCost === null ? "LPC · Last purchase cost: —" : `LPC · ${formatMoney(lastPurchaseCost)} / ${selectedItem?.unit || line.unit || "unit"}`}</small></label>
            <label>Discount %<input type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => updateLine(line.id, { discountPercent: event.target.value })} /></label>
            <PurchaseGstSelect rates={gstRates} value={line.gstRate} onChange={(gstRate) => updateLine(line.id, { gstRate })} />
            <div className="purchase-order-line-total"><span>Line total</span><strong>{formatMoney(amounts.total)}</strong><small>GST {formatMoney(amounts.gst)}</small></div>
            <button type="button" className="purchase-order-remove" title={`Remove item ${index + 1}`} aria-label={`Remove item ${index + 1}`} disabled={draft.lines.length === 1} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((entry) => entry.id !== line.id) }))}><Trash2 size={17} /></button>
          </div>; })}
        </div>
        <div className="purchase-order-form-footer"><div className="purchase-order-totals"><span>Subtotal <strong>{formatMoney(totals.subtotal)}</strong></span><span>Discount <strong>{formatMoney(totals.discount)}</strong></span><span>GST <strong>{formatMoney(totals.gst)}</strong></span><span className="grand">Order total <strong>{formatMoney(totals.total)}</strong></span></div><div><button type="button" onClick={resetForm}>Cancel</button><button type="submit" className="purchase-order-primary"><Save size={17} />{editingId ? "Update draft" : "Save draft"}</button></div></div>
      </form>
      </div>}

      <div className="purchase-order-table-wrap"><table className="purchase-order-table"><thead><tr><th>PO number</th><th>Order date</th><th>Vendor</th><th>Items</th><th>Expected delivery</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody>
        {visibleOrders.map((order) => <tr key={order.id}><td><strong>{order.poNumber}</strong>{order.reference && <small>{order.reference}</small>}</td><td>{order.orderDate}</td><td><strong>{order.vendor}</strong>{order.notes && <small>{order.notes}</small>}</td><td>{order.itemCount}</td><td>{order.expectedDate || "—"}</td><td><strong>{formatMoney(order.total)}</strong></td><td><span className={`purchase-order-status ${String(order.status).toLowerCase().replaceAll(" ", "-")}`}>{order.status}</span></td><td><div className="purchase-order-actions">{order.status === "Draft" && <><button type="button" title={`Edit ${order.poNumber}`} aria-label={`Edit ${order.poNumber}`} onClick={() => openEdit(order)}><Pencil size={16} /></button><button type="button" className="submit" onClick={() => submitOrder(order)}><Send size={16} />Submit</button><button type="button" className="delete" title={`Delete ${order.poNumber}`} aria-label={`Delete ${order.poNumber}`} onClick={() => deleteOrder(order)}><Trash2 size={16} /></button></>}{["Submitted for approval", "Sent"].includes(order.status) && <><button type="button" className="approve" onClick={() => approveOrder(order)}><CircleCheck size={16} />Approve</button><button type="button" className="return-draft" onClick={() => returnOrderToDraft(order)}><RotateCcw size={16} />Return to draft</button></>}{["Approved", "Partially received"].includes(order.status) && <button type="button" className="receive" onClick={() => receiveOrder(order)}><ReceiptText size={16} />Receive</button>}</div></td></tr>)}
        {!visibleOrders.length && <tr><td colSpan="8" className="purchase-order-empty"><PackageSearch size={28} /><strong>{orders.length ? "No matching purchase orders" : "No purchase orders yet"}</strong><span>{orders.length ? "Change the search or status filter." : "Create a purchase order to plan your next supplier delivery."}</span></td></tr>}
      </tbody></table></div>
    </section>
  </section>;
}
