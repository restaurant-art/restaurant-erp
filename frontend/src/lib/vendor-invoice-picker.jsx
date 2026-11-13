import React, { useMemo, useState } from "react";
import { BadgeIndianRupee, ReceiptText, Search, Undo2, X } from "lucide-react";
import "./vendor-invoice-picker.css";

const statusOptions = ["All", "Unpaid", "Partially paid", "Paid", "Returned"];

function statusClass(status) {
  return String(status || "").toLowerCase().replaceAll(" ", "-");
}

export function VendorInvoicePicker({ bills, vendor, formatMoney, onClose, onSelect }) {
  const [status, setStatus] = useState("All");
  const [query, setQuery] = useState("");
  const visibleBills = useMemo(() => {
    const search = query.trim().toLowerCase();
    return bills.filter((bill) => (status === "All" || bill.status === status)
      && (!search || [bill.supplier, bill.invoice, bill.id, bill.date, bill.status]
        .join(" ").toLowerCase().includes(search)));
  }, [bills, query, status]);
  const count = (value) => bills.filter((bill) => value === "All" || bill.status === value).length;

  return <div className="vendor-invoice-picker-backdrop">
    <section className="vendor-invoice-picker" role="dialog" aria-modal="true" aria-labelledby="vendor-invoice-picker-title">
      <header>
        <div><span>VENDOR BILL REGISTER</span><h3 id="vendor-invoice-picker-title">{vendor ? `${vendor} bills` : "Select a vendor bill"}</h3><p>Review every posted bill, settlement status, and purchase return before choosing an invoice.</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close invoice picker"><X size={19} /></button>
      </header>
      <div className="vendor-invoice-picker-toolbar">
        <label><Search size={17} /><input autoFocus type="search" placeholder="Search invoice, purchase no., vendor or date" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="vendor-invoice-picker-count"><ReceiptText size={18} /><span><strong>{bills.length}</strong> records</span></div>
      </div>
      <div className="vendor-invoice-picker-tabs" aria-label="Filter vendor bills by status">
        {statusOptions.map((value) => <button type="button" key={value} className={status === value ? "active" : ""} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "All" ? "All bills" : value}<span>{count(value)}</span></button>)}
      </div>
      <div className="vendor-invoice-picker-table-wrap" role="region" aria-label="Vendor bills">
        <table>
          <thead><tr><th>Date</th><th>Vendor</th><th>Invoice / return no.</th><th>Purchase no.</th><th>Bill / credit</th><th>Paid</th><th>Balance</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {visibleBills.map((bill) => <tr key={`${bill.rowType}-${bill.id}`} className={bill.rowType === "return" ? "return-row" : ""}>
              <td>{bill.date || "—"}</td>
              <td><strong>{bill.supplier || "—"}</strong></td>
              <td><strong>{bill.invoice || "—"}</strong>{bill.rowType === "return" && <small><Undo2 size={13} /> Purchase return</small>}</td>
              <td>{bill.rowType === "bill" ? bill.id : bill.id || "—"}</td>
              <td>{formatMoney(bill.total)}</td>
              <td>{bill.rowType === "bill" ? formatMoney(bill.paid) : "—"}</td>
              <td><strong>{bill.rowType === "bill" ? formatMoney(bill.balance) : "—"}</strong></td>
              <td><span className={`vendor-invoice-status ${statusClass(bill.status)}`}>{bill.status}</span></td>
              <td>{bill.selectable
                ? <button type="button" className="vendor-invoice-select" onClick={() => onSelect(bill)}><BadgeIndianRupee size={15} /> Select</button>
                : <span className="vendor-invoice-closed">{bill.rowType === "return" ? "Credit note" : "Settled"}</span>}</td>
            </tr>)}
            {!visibleBills.length && <tr><td colSpan="9" className="vendor-invoice-empty">{bills.length ? "No bills match this status or search." : vendor ? `No posted bills found for ${vendor}.` : "No posted purchase bills or returns are available."}</td></tr>}
          </tbody>
        </table>
      </div>
      <footer><span>Only unpaid and partially paid bills can be selected for a new payment.</span><button type="button" onClick={onClose}>Close</button></footer>
    </section>
  </div>;
}
