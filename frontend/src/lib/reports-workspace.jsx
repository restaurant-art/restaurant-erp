import React, { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronLeft, ChevronRight, FileBarChart, FileDown, FileSearch, FileSpreadsheet, ListFilter, Printer, Search, SlidersHorizontal, X } from "lucide-react";
import "./reports-workspace.css";

const descriptions = {
  "Daily sales": "Review bills, payments, discounts, and sales for your selected period.",
  "Item-wise sales": "See what sold, quantities billed, and the sales value of each item.",
  GST: "Review taxable values and GST totals for the selected period.",
  "Inventory valuation": "Review stock quantities, unit costs, and inventory value.",
  "Cashier closing": "Review shift closing balances and cash variances.",
  "Void and refund": "Review cancelled items, refunds, and their recorded reasons.",
};
const isNumericColumn = (column) => /^(qty|quantity|bills|stock$|unit cost|stock value|rate$|sales$|gst$|discount$|total$|amount$|outstanding$|invoices$|opening$|cash sales|expected$|closed amount|taxable value|net sales|food cost|gross profit|margin$|recipe cost|total food cost|service sales|bills handled)/i.test(column);
const numericValue = (value) => {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim();
  return /^[-+₹\d.,%\s]+$/.test(text) && /\d/.test(text) ? Number(text.replace(/[^\d.+-]/g, "")) : null;
};

export function ReportsWorkspace({ selectedReport, reports, onSelectReport, range, onRangeChange, reportDate, onDateChange,
  search, onSearchChange, filter, onFilterChange, filterLabel, filterOptions, columns, rows, columnTotals, onAction }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState(null);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => { window.removeEventListener("beforeprint", beforePrint); window.removeEventListener("afterprint", afterPrint); };
  }, []);
  useEffect(() => { setPage(0); }, [selectedReport, range, reportDate, search, filter, pageSize, sort]);
  useEffect(() => { setSort(null); }, [selectedReport]);
  const period = reportDate ? new Date(`${reportDate}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : range === "All" ? "All dates" : range === "7 days" ? "Last 7 days" : range === "Month" ? "This month" : range;
  const hasFilters = Boolean(search.trim() || filter !== "All" || reportDate);
  const resetFilters = () => { onSearchChange(""); onFilterChange("All"); onDateChange(""); };
  const orderedRows = sort ? [...rows].sort((first, second) => {
    const a = first[sort.column];
    const b = second[sort.column];
    const numberA = numericValue(a);
    const numberB = numericValue(b);
    const comparison = isNumericColumn(columns[sort.column]) && numberA !== null && numberB !== null
      ? numberA - numberB : String(a ?? "").localeCompare(String(b ?? ""), "en-IN", { numeric: true, sensitivity: "base" });
    return sort.direction === "asc" ? comparison : -comparison;
  }) : rows;
  const pages = Math.max(1, Math.ceil(orderedRows.length / pageSize));
  const activePage = Math.min(page, pages - 1);
  const start = activePage * pageSize;
  const pageRows = printing ? orderedRows : orderedRows.slice(start, start + pageSize);
  const summaries = Object.entries(columnTotals).filter(([, value]) => value !== "TOTAL").slice(-3).reverse()
    .map(([index, value]) => ({ label: columns[index], value }));
  summaries.push({ label: "Records", value: rows.length.toLocaleString("en-IN") });

  return <section className="screen reports-workspace" aria-label="Reports workspace">
    <div className="reports-print-surface print-report">
      <header className="reports-page-head">
        <div className="reports-title-group"><div className="reports-title-icon"><FileBarChart size={24} /></div><div>
          <span className="reports-eyebrow">BUSINESS REPORTS</span><h2>{selectedReport}</h2>
          <p>{descriptions[selectedReport] || "Explore detailed records and totals for your selected report."}</p>
        </div></div>
        <div className="reports-export-actions" aria-label="Export report">
          <button type="button" onClick={() => onAction("Excel")}><FileSpreadsheet size={16} />Excel</button>
          <button type="button" onClick={() => onAction("CSV")}><FileDown size={16} />CSV</button>
          <button type="button" onClick={() => onAction("PDF")}><FileDown size={16} />PDF</button>
          <button type="button" className="reports-print-button" onClick={() => onAction("Print")}><Printer size={16} />Print</button>
        </div>
      </header>

      <section className="reports-filter-card" aria-label="Report filters">
        <div className="reports-primary-filters">
          <label className="reports-report-picker"><span>Report type</span><select value={selectedReport} onChange={(event) => onSelectReport(event.target.value)}>{reports.map((name) => <option key={name}>{name}</option>)}</select></label>
          <div className="reports-period-picker"><span>Report period</span><div className="reports-period-options" role="group" aria-label="Report period">{["Today", "7 days", "Month", "All"].map((option) => <button type="button" key={option} aria-pressed={!reportDate && range === option} onClick={() => { onDateChange(""); onRangeChange(option); }}>{option === "All" ? "All dates" : option === "Month" ? "This month" : option === "7 days" ? "Last 7 days" : option}</button>)}</div></div>
          <label className="reports-date-picker"><span>Specific date</span><div><CalendarDays size={16} /><input aria-label="Specific date" type="date" value={reportDate} onChange={(event) => onDateChange(event.target.value)} />{reportDate && <button type="button" aria-label="Clear date" onClick={() => onDateChange("")}><X size={14} /></button>}</div></label>
        </div>
        <div className="reports-secondary-filters">
          <label className="reports-search"><Search size={18} /><input aria-label="Search report" placeholder="Search within this report…" value={search} onChange={(event) => onSearchChange(event.target.value)} />{search && <button type="button" aria-label="Clear report search" onClick={() => onSearchChange("")}><X size={15} /></button>}</label>
          <label className="reports-value-filter"><ListFilter size={16} /><span>{filterLabel}</span><select aria-label={filterLabel} value={filter} onChange={(event) => onFilterChange(event.target.value)}><option value="All">All</option>{filterOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
          <button type="button" className="reports-reset" disabled={!hasFilters} onClick={resetFilters}><SlidersHorizontal size={15} />Reset filters</button>
        </div>
      </section>

      <section className="reports-summary-grid" aria-label="Report summary">{summaries.map((summary, index) => <article key={summary.label} className={index === 0 ? "reports-summary featured" : "reports-summary"}>
        <span>{summary.label}</span><strong>{summary.value}</strong><small>{index === summaries.length - 1 ? "Matching your selection" : "Total for filtered records"}</small>
      </article>)}</section>

      <section className="reports-data-card" aria-label="Report results">
        <div className="reports-table-heading"><div><h3>Report details</h3><span className="reports-record-count" role="status">{rows.length} {rows.length === 1 ? "record" : "records"}</span></div><span className="reports-period-caption"><CalendarDays size={14} />{period}</span></div>
        <div className="reports-table-scroll" tabIndex={0} role="region" aria-label={`${selectedReport} table`}>
          <table className="reports-data-table"><caption>{selectedReport} · {period}</caption><thead><tr><th scope="col" className="reports-row-index">#</th>{columns.map((column, index) => <th key={column} scope="col" className={isNumericColumn(column) ? "numeric" : ""} aria-sort={sort?.column === index ? sort.direction === "asc" ? "ascending" : "descending" : "none"}>
            <button type="button" onClick={() => setSort({ column: index, direction: sort?.column === index && sort.direction === "asc" ? "desc" : "asc" })}>{column}{sort?.column === index ? sort.direction === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={12} />}</button>
          </th>)}</tr></thead>
          <tbody>{pageRows.map((row, rowIndex) => <tr key={`${rowIndex}-${row.join("-")}`}><td className="reports-row-index">{(printing ? 0 : start) + rowIndex + 1}</td>{columns.map((column, index) => <td key={column} className={isNumericColumn(column) ? "numeric" : ""}>{row[index] ?? "—"}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={columns.length + 1}><div className="reports-empty"><span><FileSearch size={28} /></span><h3>No records to display</h3><p>{hasFilters ? "Try a different search or clear your filters to see more records." : "There are no records for this period. Try a wider date range."}</p><button type="button" onClick={() => { resetFilters(); if (!hasFilters) onRangeChange("All"); }}>{hasFilters ? "Clear filters" : "View all dates"}</button></div></td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td className="reports-row-index"></td>{columns.map((column, index) => <td key={column} className={isNumericColumn(column) ? "numeric" : ""}>{columnTotals[index] === "TOTAL" ? "Total" : columnTotals[index] ?? ""}</td>)}</tr></tfoot>}
          </table>
        </div>
        <footer className="reports-table-footer"><span>{rows.length ? `Showing ${start + 1}–${Math.min(start + pageSize, rows.length)} of ${rows.length} records` : "0 records"}</span><div className="reports-pagination"><label>Rows per page<select aria-label="Rows per page" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label><span>{activePage + 1} / {pages}</span><button type="button" aria-label="Previous page" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" disabled={activePage + 1 >= pages} onClick={() => setPage(activePage + 1)}><ChevronRight size={16} /></button></div></footer>
      </section>
      <p className="reports-export-note">Exports include all filtered records. Summary values follow your current filters.</p>
    </div>
  </section>;
}
