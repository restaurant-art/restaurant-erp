import React from "react";
import { MoreVertical, Pencil, Save, Send, Trash2, Plus } from "lucide-react";

export function PurchaseDraftList({ records, onEdit, onUpdate, onSubmit, onDelete, onNew, totals, formatMoney }) {
  const drafts = records.filter((record) => record.status === "Draft");
  return <section className="panel purchase-history-panel purchase-drafts-panel" id="saved-purchase-drafts" aria-label="Saved purchase drafts">
    <div className="purchase-history-head"><div><span>Not submitted · Stock unchanged</span><h3>Saved purchase drafts</h3></div><strong>{drafts.length} drafts</strong>{onNew && <button type="button" onClick={onNew}><Plus size={16} /> New purchase entry</button>}</div>
    <div className="inventory-table-wrap"><table className="inventory-table purchase-history-table">
      <thead><tr><th>Date</th><th>Vendor</th><th>Invoice</th><th>Items</th><th>Total</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{drafts.map((record) => {
        const amount = totals(record.entry.lines || [], record.entry).total;
        const runAction = (event, action) => {
          event.currentTarget.closest("details").open = false;
          action(record);
        };
        return <tr key={record.id}><td>{record.entry.date || "—"}</td><td>{record.entry.supplier || "Vendor not selected"}</td>
          <td>{record.entry.invoice || "Not entered"}</td><td>{record.entry.lines?.filter((line) => line.itemId).length || 0}</td>
          <td>{Number.isFinite(amount) ? formatMoney(amount) : "Incomplete"}</td><td><span className="inventory-status watch">Draft</span></td>
          <td><details className="purchase-draft-actions"><summary aria-label={`Actions for draft ${record.entry.invoice || record.id}`} title="Draft actions"><MoreVertical size={18} /></summary>
            <div className="purchase-draft-actions-menu" role="menu">
              <button type="button" role="menuitem" onClick={(event) => runAction(event, onEdit)}><Pencil size={15} /> Edit draft</button>
              <button type="button" role="menuitem" onClick={(event) => runAction(event, onUpdate)}><Save size={15} /> Update draft</button>
              <button type="button" role="menuitem" onClick={(event) => runAction(event, onSubmit)}><Send size={15} /> Submit purchase</button>
              <button type="button" role="menuitem" className="danger" onClick={(event) => runAction(event, onDelete)}><Trash2 size={15} /> Delete draft</button>
            </div>
          </details></td></tr>;
      })}
      {!drafts.length && <tr><td className="purchase-history-empty" colSpan="7">No saved drafts yet.</td></tr>}
      </tbody></table></div>
  </section>;
}
