import React, { useEffect, useRef } from "react";
import { ReceiptText, X } from "lucide-react";
import "./sales-bill-dialog.css";

const money = (value) => value === null || value === undefined || value === "" ? "—"
  : Number(value).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const dateTime = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";
};

export function SalesBillDialog({ bill, refunds = [], onClose }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const items = Array.isArray(bill.items) ? bill.items : [];
  const billRefunds = refunds.filter((entry) => entry.billId === bill.id || (bill.orderNumber && entry.billId === bill.orderNumber));
  const refundTotal = billRefunds.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const metadata = [
    ["Order number", bill.orderNumber], ["Date & time", dateTime(bill.createdAt || bill.completedAt)],
    ["Cashier", bill.cashier], ["Customer", bill.customerName || "Not recorded"],
    ["Mobile", bill.customerMobile || "Not recorded"], ["Billing type", bill.orderType],
    ["Price type", bill.pricingMode], ["Payment", bill.payment], ["Payment status", bill.paymentStatus],
    ["Table", bill.tableName], ["Waiter", bill.waiter], ["Guests", bill.guestCount || null],
    ["Branch", bill.storeName || bill.branchName || bill.storeId], ["Shift", bill.shiftId],
    ["Sync status", bill.syncStatus],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  const totals = [
    ["Subtotal", bill.subtotal], ["Discount", bill.discount],
    ["Taxable value", bill.taxableSubtotal],
    [bill.taxInclusive ? "GST (included)" : "GST", bill.tax],
    ["CGST", bill.cgst], ["SGST", bill.sgst],
  ].filter(([, value]) => value !== null && value !== undefined && value !== "");
  return <dialog ref={dialogRef} className="sales-bill-dialog" aria-labelledby="sales-bill-title"
    onCancel={onClose} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sales-bill-shell">
      <header className="sales-bill-header"><div><span><ReceiptText size={18} /> SALES RECEIPT</span><h2 id="sales-bill-title">Bill details</h2><p>{bill.id}</p></div><button type="button" aria-label="Close bill details" onClick={onClose} autoFocus><X size={21} /></button></header>
      <div className="sales-bill-body">
        <dl className="sales-bill-meta">{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <h3>Items <span>({items.length})</span></h3>
        <div className="sales-bill-table-scroll" tabIndex={0} role="region" aria-label="Bill items">
          <table><thead><tr><th>#</th><th>Product</th><th>Unit</th><th>Qty</th><th>MRP</th><th>Rate</th><th>GST rate</th><th>Amount</th></tr></thead>
            <tbody>{items.map((item, index) => <tr key={index}><td>{index + 1}</td><td><strong>{item.name || "Unnamed item"}</strong>{(item.sku || item.barcode || item.hsnCode) && <small>{[item.sku && `SKU: ${item.sku}`, item.barcode && `Barcode: ${item.barcode}`, item.hsnCode && `HSN: ${item.hsnCode}`].filter(Boolean).join(" · ")}</small>}</td><td>{item.salesUnit || item.unit || "—"}</td><td>{item.qty ?? "—"}</td><td>{money(item.mrp)}</td><td>{money(item.price)}</td><td>{item.tax !== undefined && item.tax !== null ? `${item.tax}%` : "—"}</td><td>{money(Number(item.qty || 0) * Number(item.price || 0))}</td></tr>)}
              {!items.length && <tr><td colSpan={8}>Item details were not saved for this bill.</td></tr>}</tbody>
          </table>
        </div>
        <div className="sales-bill-bottom">
          <section className="sales-bill-payment"><h3>Payment details</h3><p>{bill.payment || "Not recorded"}{bill.paymentStatus ? ` · ${bill.paymentStatus}` : ""}</p>
            {(bill.splitPayments || []).map((entry, index) => <div className="sales-bill-payment-line" key={index}><span>{entry.method}</span><strong>{money(entry.amount)}</strong></div>)}
            {bill.appliedOffer && <p>Offer: {bill.appliedOffer.name || bill.appliedOffer.title || "Applied offer"}</p>}
            {bill.notes && <p>Notes: {bill.notes}</p>}
            <p className="sales-bill-help">{bill.taxInclusive ? "GST is included in the saved selling prices." : "Totals shown as recorded on this bill."}</p>
          </section>
          <dl className="sales-bill-totals">{totals.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}<div><dt>Total quantity</dt><dd>{bill.itemCount ?? items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</dd></div><div className="sales-bill-grand-total"><dt>Grand total</dt><dd>{money(bill.total)}</dd></div></dl>
        </div>
        {billRefunds.length > 0 && <section className="sales-bill-refunds"><h3>Recorded refunds · {money(refundTotal)}</h3>{billRefunds.map((entry, index) => <div key={entry.id || index}><span>{dateTime(entry.createdAt)} · {entry.payment || "—"}<small>{entry.reason || "No reason recorded"}</small></span><strong>{money(entry.amount)}</strong></div>)}</section>}
      </div>
      <footer className="sales-bill-footer"><span>Original saved bill · Read only</span><button type="button" onClick={onClose}>Close</button></footer>
    </div>
  </dialog>;
}
