import React, { useState } from "react";
import { BadgeIndianRupee, Search, X, ReceiptText, CircleCheck, Clock, Users, RotateCcw } from "lucide-react";
import { useBusinessState } from "./use-business-state.js";
import { cloudConfigured } from "./cloud.js";
import { buildPurchasePayables } from "./vendor-settlements.js";
import { matchesVendorPaymentScope } from "./vendor-payment-filters.js";
import { ledgerVendorOptions } from "./ledger-vendor-filter.js";
import "./vendor-payments-workspace.css";

export function VendorPurchasePayables({ storeId, canManage, notify, formatMoney, today, filters, setFilters, filtersOpen, rangeOpen, accountNames }) {
  const [transactions] = useBusinessState(`vestora-inventory-transactions-${storeId}`, []);
  const [payments, setPayments] = useBusinessState(`vestora-finance-vendor-payments-${storeId}`, []);
  const [vendors] = useBusinessState(`vestora-inventory-vendors-${storeId}`, []);
  const [status, setStatus] = useState("All");
  const [draft, setDraft] = useState(null);
  const purchases = buildPurchasePayables(transactions, payments);
  const scoped = purchases.filter((purchase) => matchesVendorPaymentScope(purchase, filters));
  const visible = scoped.filter((purchase) => status === "All" || purchase.settlementStatus === status);
  const vendorOptions = ledgerVendorOptions(vendors, [...payments, ...purchases.map((purchase) => ({ vendor: purchase.supplier }))]);
  const updateFilter = (field, value) => setFilters((current) => ({ ...current, [field]: value }));
  const selected = purchases.find((purchase) => purchase.id === draft?.purchaseId);
  const total = (field) => scoped.reduce((sum, purchase) => sum + purchase[field], 0);

  const openPayment = (purchase) => {
    if (!canManage) return notify("Only an administrator can record vendor payments.");
    setDraft({ id: `VND-PUR-${crypto.randomUUID()}`, purchaseId: purchase.id, amount: purchase.balance.toFixed(2), method: "Bank", date: today(), reference: purchase.invoice, note: "" });
  };
  const savePayment = (event) => {
    event.preventDefault();
    if (!canManage) return;
    if (cloudConfigured && window.vestoraCloudStateReady !== true) return notify("Wait for cloud synchronization before recording a payment.");
    const amount = Number(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0 || !draft.date) return notify("Enter a valid payment amount and date.");
    try {
      setPayments((current) => {
        if (current.some((payment) => payment.id === draft.id)) return current;
        const purchase = buildPurchasePayables(transactions, current).find((entry) => entry.id === draft.purchaseId);
        if (!purchase) throw new Error("This purchase bill is no longer available.");
        if (amount > purchase.balance + 0.005) throw new Error(`Payment cannot exceed the outstanding balance of ${formatMoney(purchase.balance)}.`);
        const now = new Date().toISOString();
        return [{ ...draft, amount, vendor: purchase.supplier, invoice: purchase.invoice,
          purpose: "Supplier settlement", dueAmount: purchase.balance,
          debitAccount: "Accounts payable", creditAccount: draft.method, status: "Paid",
          reference: draft.reference.trim(), note: draft.note.trim(), createdAt: now, updatedAt: now }, ...current];
      });
      setDraft(null);
      notify("Vendor payment recorded. The purchase balance has been updated.");
    } catch (error) { notify(error.message); }
  };

  return <section className="vendor-purchase-payables" aria-label="Approved purchase bills">
    <div className="vendor-payment-hero"><div><span className="vendor-payment-eyebrow">SUPPLIER ACCOUNTS</span><h3>Every bill. Every payment.</h3><p>Track your purchases, settle outstanding bills, and review vendor payments in one place.</p></div><div className="vendor-payment-scope"><Users size={19} /><span>{filters.vendor ? vendorOptions.find((vendor) => vendor.value === filters.vendor)?.label || filters.vendor : "All vendors"}<small>{scoped.length} purchase bills in view</small></span></div></div>
    <div className="vendor-payment-metrics">
      <div><ReceiptText size={21} /><span>Purchase total<strong>{formatMoney(total("total"))}</strong><small>{scoped.length} approved bills</small></span></div>
      <div><CircleCheck size={21} /><span>Paid against bills<strong>{formatMoney(total("paid"))}</strong><small>Recorded settlements</small></span></div>
      <div className="vendor-payment-due"><BadgeIndianRupee size={21} /><span>Balance due<strong>{formatMoney(total("balance"))}</strong><small>Remaining on selected bills</small></span></div>
      <div><Clock size={21} /><span>Awaiting payment<strong>{scoped.filter((purchase) => purchase.balance > 0.005).length}</strong><small>Unpaid or partially paid bills</small></span></div>
    </div>
    <div className="vendor-payment-filters">
      <label>Vendor<select aria-label="Filter payments by vendor" value={filters.vendor || ""} onChange={(event) => updateFilter("vendor", event.target.value)}><option value="">All vendors</option>{vendorOptions.map((vendor) => <option key={vendor.value} value={vendor.value}>{vendor.label}</option>)}</select></label>
      <label className="vendor-payment-search">Search bills & payments<div><Search size={18} /><input placeholder="Vendor, invoice, reference or purchase no." value={filters.query} onChange={(event) => updateFilter("query", event.target.value)} /></div></label>
      <button type="button" className="vendor-filter-reset" onClick={() => { setFilters({ vendor: "", query: "", method: "All", status: "All", from: "", to: "" }); setStatus("All"); }}><RotateCcw size={16} />Reset filters</button>
      {(rangeOpen || filters.from || filters.to) && <div className="vendor-payment-filter-extra"><label>From date<input type="date" value={filters.from} onChange={(event) => updateFilter("from", event.target.value)} /></label><label>To date<input type="date" value={filters.to} onChange={(event) => updateFilter("to", event.target.value)} /></label><small>Bill dates for purchases · payment dates for history</small></div>}
      {(filtersOpen || filters.method !== "All" || filters.status !== "All") && <div className="vendor-payment-filter-extra"><label>History: payment method / account<select value={filters.method} onChange={(event) => updateFilter("method", event.target.value)}><option value="All">All methods / accounts</option>{[...new Set([...accountNames, ...payments.flatMap((payment) => [payment.method, payment.debitAccount, payment.creditAccount])])].filter(Boolean).map((method) => <option key={method}>{method}</option>)}</select></label><label>History: payment status<select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="All">All payment statuses</option>{[...new Set(["Paid", "Partially paid", "Pending", "Cancelled", "Reversed", ...payments.map((payment) => payment.status)])].filter(Boolean).map((value) => <option key={value}>{value}</option>)}</select></label><small>These options filter payment history below.</small></div>}
    </div>
    <div className="purchase-history-head"><div><span>Purchases ready for settlement</span><h3>Approved purchase bills</h3></div><strong>{visible.length} of {scoped.length} bills</strong></div>
    <div className="vendor-payment-tabs" aria-label="Bill payment status">{["All", "Unpaid", "Partially paid", "Paid"].map((value) => <button type="button" key={value} aria-pressed={status === value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{value === "All" ? "All bills" : value}<span>{scoped.filter((purchase) => value === "All" || purchase.settlementStatus === value).length}</span></button>)}</div>
    <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Date</th><th>Vendor</th><th>Purchase no.</th><th>Supplier invoice</th><th>Bill total</th><th>Paid</th><th>Balance due</th><th>Status</th><th>Action</th></tr></thead><tbody>
      {visible.map((purchase) => <tr key={purchase.id}><td>{purchase.date}</td><td><strong>{purchase.supplier}</strong></td><td>{purchase.id}</td><td>{purchase.invoice}</td><td>{formatMoney(purchase.total)}</td><td>{formatMoney(purchase.paid)}</td><td><strong>{formatMoney(purchase.balance)}</strong></td><td><span className={`purchase-entry-status-badge ${purchase.balance > 0.005 ? "purchase-entry-status-pendingapproval" : "purchase-entry-status-approved"}`}>{purchase.settlementStatus}</span></td><td>{purchase.balance > 0.005 && canManage ? <button type="button" className="purchase-settlement-button" onClick={() => openPayment(purchase)}>Record payment</button> : purchase.balance <= 0.005 ? "Settled" : "—"}</td></tr>)}
      {!visible.length && <tr><td colSpan="9" className="finance-empty">{purchases.length ? "No purchase bills match your search." : "Approved and posted purchase entries will appear here automatically."}</td></tr>}
    </tbody></table></div>
    <div className="purchase-history-head"><div><span>Recorded transactions</span><h3>Payment history</h3></div></div>
    {draft && <div className="purchase-entry-modal-backdrop"><form className="inventory-editor purchase-editor purchase-entry-modal purchase-bill-view" role="dialog" aria-modal="true" aria-labelledby="vendor-purchase-payment-title" onSubmit={savePayment}>
      <div className="inventory-editor-head"><div><span>{selected?.supplier}</span><h3 id="vendor-purchase-payment-title">Record vendor payment</h3><p>Invoice {selected?.invoice} · {draft.purchaseId} · Balance due {formatMoney(selected?.balance || 0)}</p></div><button type="button" className="icon-button" onClick={() => setDraft(null)} aria-label="Close payment form"><X size={18} /></button></div>
      <div className="purchase-meta-grid"><label>Payment amount<input autoFocus type="number" min="0.01" step="0.01" max={selected?.balance || 0} value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} required /></label><label>Paid from<select value={draft.method} onChange={(event) => setDraft({ ...draft, method: event.target.value })}>{["Bank", "Cash", "UPI", "Cheque", "Card"].map((method) => <option key={method}>{method}</option>)}</select></label><label>Date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required /></label><label>Reference<input value={draft.reference} onChange={(event) => setDraft({ ...draft, reference: event.target.value })} /></label><label>Notes<input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label></div>
      <div className="inventory-editor-actions"><button type="button" onClick={() => setDraft(null)}>Cancel</button><button type="submit" className="primary" disabled={!selected}><BadgeIndianRupee size={17} /> Record payment</button></div>
    </form></div>}
  </section>;
}
