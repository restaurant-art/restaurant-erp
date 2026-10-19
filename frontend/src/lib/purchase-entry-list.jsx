import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeIndianRupee, Check, Eye, MoreVertical, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { purchaseDraftDeadline, purchaseDraftNumber } from "./purchase-drafts.js";

const statusNames = { Draft: "Draft", PendingApproval: "Submitted for approval", Approved: "Approved" };

export function PurchaseEntryList({ records, purchases, onNew, onView, onEdit, onSubmit, onApprove, onReturnToDraft, onDelete, onSettle, totals, formatMoney, maximumDraftDays = 7 }) {
  const [filter, setFilter] = useState("All");
  const [menu, setMenu] = useState(null);
  const rows = useMemo(() => [
    ...records.filter((record) => ["Draft", "PendingApproval"].includes(record.status)).map((record) => ({
      id: record.id, status: record.status, record, date: record.entry.date || "", supplier: record.entry.supplier || "", invoice: record.entry.invoice || "",
      purchaseNumber: purchaseDraftNumber(record), purchaseOrderNumber: record.entry.purchaseOrderNumber || "",
      itemCount: record.entry.lines?.filter((line) => line.itemId).length || 0,
      total: totals(record.entry.lines || [], record.entry).total, paid: 0, balance: 0,
      createdAt: record.updatedAt || record.createdAt || record.entry.date || "",
    })),
    ...purchases.map((purchase) => ({ ...purchase, status: "Approved", purchase, createdAt: purchase.createdAt || purchase.date || "" })),
  ].sort((first, second) => String(second.createdAt).localeCompare(String(first.createdAt))), [records, purchases, totals]);
  const visible = rows.filter((row) => filter === "All" || row.status === filter);
  const overdueCount = rows.filter((row) => row.status === "Draft" && purchaseDraftDeadline(row.record, maximumDraftDays).overdue).length;

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => { if (event.key === "Escape" || (event.type === "pointerdown" && !event.target.closest(".purchase-entry-action-menu, .purchase-entry-action-trigger"))) setMenu(null); };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [menu]);

  const openMenu = (event, row) => {
    if (menu?.id === row.id) return setMenu(null);
    const bounds = event.currentTarget.getBoundingClientRect();
    setMenu({ id: row.id, row, left: Math.max(8, Math.min(bounds.right - 206, window.innerWidth - 214)), top: Math.min(bounds.bottom + 5, window.innerHeight - 260) });
  };
  const menuAction = (callback) => { const row = menu.row; setMenu(null); callback(row); };

  return <section className="panel purchase-history-panel purchase-entries-panel" aria-label="Purchase entries">
    <div className="purchase-history-head"><div><span>Purchase ledger</span><h3>Purchase entries</h3><small>Draft limit: {maximumDraftDays} day{maximumDraftDays === 1 ? "" : "s"}{overdueCount ? ` · ${overdueCount} overdue` : ""}</small></div><strong>{rows.length} entries</strong><button type="button" onClick={onNew}><Plus size={16} /> Add purchase entry</button></div>
    <div className="purchase-entry-filters" aria-label="Filter purchase entries">
      {[["All", "All"], ["Draft", "Draft"], ["PendingApproval", "Submitted for approval"], ["Approved", "Approved"]].map(([value, label]) =>
        <button type="button" key={value} className={filter === value ? "active" : ""} aria-pressed={filter === value} onClick={() => { setFilter(value); setMenu(null); }}>{label} <span>{value === "All" ? rows.length : rows.filter((row) => row.status === value).length}</span></button>)}
    </div>
    <div className="inventory-table-wrap"><table className="inventory-table purchase-history-table">
      <thead><tr><th>Date</th><th>Purchase no.</th><th>Vendor</th><th>Supplier invoice</th><th>Items</th><th>Total</th><th>Paid</th><th>Balance</th><th className="purchase-entry-status-column">Status</th><th>Action</th></tr></thead>
      <tbody>{visible.map((row) => {
        const deadline = row.status === "Draft" ? purchaseDraftDeadline(row.record, maximumDraftDays) : null;
        return <tr key={row.id} className={deadline?.overdue ? "purchase-draft-overdue-row" : ""}>
        <td>{row.date || "—"}</td><td><strong>{row.purchase?.id || row.purchaseNumber || "—"}</strong>{row.purchaseOrderNumber && <small>PO: {row.purchaseOrderNumber}</small>}</td><td>{row.supplier || "Vendor not selected"}</td><td>{row.invoice || "Not entered"}</td><td>{row.itemCount}</td>
        <td><strong>{Number.isFinite(row.total) ? formatMoney(row.total) : "Incomplete"}</strong></td><td>{row.status === "Approved" ? formatMoney(row.paid) : "—"}</td><td>{row.status === "Approved" ? formatMoney(row.balance) : "—"}</td>
        <td className="purchase-entry-status-column"><div className="purchase-entry-status-stack">
          <span className={`purchase-entry-status-badge purchase-entry-status-${row.status.toLowerCase()}${deadline?.overdue ? " is-overdue" : ""}`}><span className="purchase-entry-status-dot" aria-hidden="true" />{deadline?.overdue ? "Draft overdue" : statusNames[row.status]}</span>
          {deadline && <span className={`purchase-draft-deadline ${deadline.overdue ? "is-overdue" : ""}`}>{deadline.overdue ? `${deadline.daysOverdue} day${deadline.daysOverdue === 1 ? "" : "s"} overdue` : deadline.daysRemaining === 0 ? "Due today" : `${deadline.daysRemaining} day${deadline.daysRemaining === 1 ? "" : "s"} left`}</span>}
          {row.status === "Approved" && <span className={`purchase-entry-payment-status ${row.settlementStatus === "Paid" ? "is-paid" : "is-outstanding"}`}>{row.settlementStatus}</span>}
        </div></td>
        <td><button type="button" className="purchase-entry-action-trigger" aria-label={`Actions for ${row.invoice || row.id}`} aria-expanded={menu?.id === row.id} onClick={(event) => openMenu(event, row)}><MoreVertical size={18} /></button></td>
      </tr>;
      })}
        {!visible.length && <tr><td className="purchase-history-empty" colSpan="10">No {filter === "All" ? "purchase entries" : statusNames[filter]?.toLowerCase() + " entries"} yet.</td></tr>}
      </tbody></table></div>
    {menu && createPortal(<div className="purchase-entry-action-menu purchase-draft-actions-menu" role="menu" style={{ left: menu.left, top: Math.max(8, menu.top) }}>
      <button type="button" role="menuitem" onClick={() => menuAction(onView)}><Eye size={15} /> View bill</button>
      {menu.row.status === "Draft" && <><button type="button" role="menuitem" onClick={() => menuAction(onEdit)}><Pencil size={15} /> Edit draft</button><button type="button" role="menuitem" onClick={() => menuAction(onSubmit)}><Send size={15} /> Submit for approval</button></>}
      {menu.row.status === "PendingApproval" && <><button type="button" role="menuitem" onClick={() => menuAction(onReturnToDraft)}><Undo2 size={15} /> Return to draft</button><button type="button" role="menuitem" onClick={() => menuAction(onApprove)}><Check size={15} /> Approve &amp; post</button></>}
      {menu.row.status === "Approved" && <><button type="button" role="menuitem" onClick={() => menuAction(onEdit)}><Pencil size={15} /> Edit bill</button>{menu.row.balance > 0.005 && <button type="button" role="menuitem" onClick={() => menuAction(onSettle)}><BadgeIndianRupee size={15} /> Settle balance</button>}</>}
      <button type="button" role="menuitem" className="danger" onClick={() => menuAction(onDelete)}><Trash2 size={15} /> Delete {menu.row.status === "Draft" ? "draft" : "bill"}</button>
    </div>, document.body)}
  </section>;
}
