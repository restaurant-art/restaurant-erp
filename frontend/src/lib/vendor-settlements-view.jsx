import React, { useState } from "react";
import { BadgeIndianRupee, ReceiptText } from "lucide-react";
import { paymentMatchesPurchase, settlementSearch } from "./vendor-settlements.js";
import "./vendor-settlements-view.css";

export function VendorSettlementsView({ purchases, payments, formatMoney, onOpenPurchase }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All invoices");
  const [selectedId, setSelectedId] = useState("");
  const selected = purchases.find((purchase) => purchase.id === selectedId);
  const visiblePurchases = purchases.filter((purchase) => settlementSearch(purchase, query)
    && (status === "All invoices" || (status === "Outstanding" ? purchase.balance > 0.005 : purchase.balance <= 0.005)));
  const visiblePayments = payments.filter((payment) => settlementSearch(payment, query)
    && (!selected || paymentMatchesPurchase(payment, selected)))
    .sort((first, second) => String(second.date || second.createdAt || "").localeCompare(String(first.date || first.createdAt || "")));
  const total = (field) => purchases.reduce((sum, purchase) => sum + Number(purchase[field] || 0), 0);

  return <section className="screen vendor-settlements-screen">
    <div className="inventory-page-head"><div className="inventory-title-block"><span className="inventory-title-icon"><BadgeIndianRupee size={24} /></span>
      <div><span>Purchase / Vendor settlements</span><h2>Vendor settlements</h2><p>Review invoice balances and recorded vendor payments for this store.</p></div></div>
      <div className="inventory-head-actions"><button type="button" onClick={onOpenPurchase}><ReceiptText size={17} /> Purchase entry</button></div>
    </div>
    <div className="vendor-settlement-summary" aria-label="Purchase settlement summary">
      {[["Posted invoices", purchases.length], ["Purchase total", formatMoney(total("total"))], ["Paid against purchases", formatMoney(total("paid"))], ["Outstanding balance", formatMoney(total("balance"))]].map(([label, value]) =>
        <div className="panel" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <div className="panel vendor-settlement-filters">
      <label>Search settlements<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Vendor, invoice, payment reference or method" /></label>
      <label><span>Invoice status</span><select aria-label="Invoice status" value={status} onChange={(event) => setStatus(event.target.value)}><option>All invoices</option><option>Outstanding</option><option>Paid</option></select></label>
    </div>
    <section className="panel purchase-history-panel" aria-label="Invoice balances">
      <div className="purchase-history-head"><div><span>Posted purchases only · Drafts excluded</span><h3>Invoice balances</h3></div><strong>{visiblePurchases.length} invoices</strong></div>
      <div className="vendor-settlement-scroll" tabIndex={0} role="region" aria-label="Invoice balances table"><table className="inventory-table vendor-settlement-table">
        <thead><tr><th>Date</th><th>Vendor</th><th>Invoice / Purchase no.</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>{visiblePurchases.map((purchase) => <tr key={purchase.id}><td>{purchase.date || "—"}</td><td><strong>{purchase.supplier}</strong></td><td>{purchase.invoice}<small>{purchase.id}</small></td>
          <td>{formatMoney(purchase.total)}</td><td>{formatMoney(purchase.paid)}</td><td><strong>{formatMoney(purchase.balance)}</strong></td>
          <td><span className={`inventory-status ${purchase.balance > 0.005 ? "watch" : ""}`}>{purchase.settlementStatus}</span></td>
          <td><button type="button" className="purchase-settlement-button" aria-pressed={selectedId === purchase.id} onClick={() => { setSelectedId(purchase.id); setQuery(""); }}>View payments</button></td></tr>)}
          {!visiblePurchases.length && <tr><td colSpan="8" className="purchase-history-empty">{purchases.length ? "No invoices match these filters." : "No purchases have been submitted yet."}</td></tr>}
        </tbody></table></div>
    </section>
    <section className="panel purchase-history-panel" aria-label="Vendor payment history">
      <div className="purchase-history-head"><div><span>{selected ? `${selected.supplier} · Invoice ${selected.invoice}` : "All recorded payments · Cancelled and reversed entries remain visible"}</span><h3>Payment history</h3></div>
        {selected ? <button type="button" className="purchase-settlement-button" onClick={() => setSelectedId("")}>Show all payments</button> : <strong>{visiblePayments.length} payments</strong>}</div>
      <div className="vendor-settlement-scroll" tabIndex={0} role="region" aria-label="Payment history table"><table className="inventory-table vendor-settlement-table vendor-payment-details">
        <thead><tr><th>Date</th><th>Vendor</th><th>Invoice / Purchase no.</th><th>Amount</th><th>Payment method</th><th>Reference</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>{visiblePayments.map((payment) => <tr key={payment.id}><td>{payment.date || "—"}</td><td><strong>{payment.vendor || "—"}</strong></td><td>{payment.invoice || "—"}<small>{payment.purchaseId || ""}</small></td>
          <td><strong>{formatMoney(Number(payment.amount || 0))}</strong></td><td>{payment.method || payment.creditAccount || "—"}</td><td>{payment.reference || "—"}</td>
          <td><span className={`inventory-status ${["Cancelled", "Reversed"].includes(payment.status) ? "low-stock" : ""}`}>{payment.status || "Recorded"}</span></td><td>{payment.note || "—"}</td></tr>)}
          {!visiblePayments.length && <tr><td colSpan="8" className="purchase-history-empty">{selected ? "No payments found for this invoice." : "No vendor payments match this view."}</td></tr>}
        </tbody></table></div>
    </section>
  </section>;
}
