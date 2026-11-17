import React, { useId, useState } from "react";
import { ChevronDown, Columns3, RotateCcw } from "lucide-react";
import { visibleColumnIndices } from "./report-columns.js";
import "./report-columns.css";

function loadHiddenColumns(key, defaults) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : defaults;
  } catch { return defaults; }
}

export function useReportColumns(reportKey, columns, defaultHidden = []) {
  const key = `uvpro-report-columns:${reportKey}`;
  const [stored, setStored] = useState(() => ({ key, hidden: loadHiddenColumns(key, defaultHidden) }));
  if (stored.key !== key) setStored({ key, hidden: loadHiddenColumns(key, defaultHidden) });
  const indices = visibleColumnIndices(columns, stored.hidden);
  const save = (hidden) => {
    setStored({ key, hidden });
    try { localStorage.setItem(key, JSON.stringify(hidden)); }
    catch { /* Keep the current selection when browser storage is unavailable. */ }
  };
  const toggle = (index) => {
    const checked = indices.includes(index);
    if (checked && indices.length === 1) return;
    const hidden = new Set(stored.hidden);
    // A new date range can remove the only selected dynamic column.
    if (indices.length === columns.length) columns.forEach((column) => hidden.delete(column));
    if (checked) hidden.add(columns[index]); else hidden.delete(columns[index]);
    save([...hidden]);
  };
  return { indices, toggle, showAll: () => save([]) };
}

export function ReportColumnControls({ columns, selection, children, label = "Report" }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const { indices, toggle, showAll } = selection;

  return <div className="report-column-controls" role="group" aria-label={`${label} display and export`}>
    <div className="report-columns-toolbar">
      <button type="button" className="report-columns-toggle" aria-expanded={open} aria-controls={panelId} aria-label={`Columns for ${label}: ${indices.length} of ${columns.length}`} onClick={() => setOpen(!open)}>
        <Columns3 size={17} aria-hidden="true" /> Columns <span className="report-column-count">{indices.length} of {columns.length}</span><ChevronDown className="report-columns-chevron" size={15} aria-hidden="true" />
      </button>
      {children}
    </div>
    <fieldset id={panelId} className="report-columns-panel" hidden={!open}>
      <legend className="report-columns-legend">{label} columns</legend>
      <div className="report-columns-panel-heading"><div><strong>Choose your columns</strong><p>Checked fields appear in the table and its exports.</p></div>
        <button type="button" className="report-columns-reset" onClick={showAll} disabled={indices.length === columns.length}><RotateCcw size={14} aria-hidden="true" />Show all</button>
      </div>
      <div className="report-columns-grid">{columns.map((column, index) => {
        const checked = indices.includes(index);
        return <label className="report-column-choice" key={`${column}-${index}`}>
          <input type="checkbox" checked={checked} disabled={checked && indices.length === 1} onChange={() => toggle(index)} />
          <span>{column}</span>
        </label>;
      })}</div>
    </fieldset>
  </div>;
}
