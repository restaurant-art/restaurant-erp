import React, { useState } from "react";
import { ArrowUpRight, FileBarChart, Search, X } from "lucide-react";
import { sortOperationalReportsByPriority } from "./dashboard-operational-reports.js";
import "./dashboard-operational-reports.css";

const categories = [
  { id: "all", label: "All reports" },
  { id: "overview", label: "Daily overview" },
  { id: "approvals", label: "Approvals & counters" },
  { id: "inventory", label: "Inventory" },
  { id: "pricing", label: "Pricing" },
  { id: "purchasing", label: "Purchases & transfers" },
  { id: "finance", label: "Payments & receipts" },
];

const categoryFor = (icon) => ({
  approval: "approvals", counter: "approvals",
  inventory: "inventory", expiry: "inventory",
  pricing: "pricing", mapping: "purchasing", purchase: "purchasing", transfer: "purchasing", return: "purchasing",
  dues: "finance", receipt: "finance",
}[icon] || "inventory");

export function DashboardOperationalReports({ reports, icons, onOpen }) {
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const visible = sortOperationalReportsByPriority(reports.filter((report) => (
    (category === "all" || (report.category || categoryFor(report.icon)) === category)
    && (!search || `${report.title} ${report.description}`.toLowerCase().includes(search))
  )));

  return (
    <section className="operations-report-center" aria-labelledby="operations-report-title">
      <header className="operations-report-header">
        <div className="operations-report-title-group">
          <span className="operations-report-header-icon"><FileBarChart size={20} aria-hidden="true" /></span>
          <h2 id="operations-report-title">Operational reports</h2>
        </div>
        <div className="operations-report-header-meta"><span className="operations-live"><i aria-hidden="true" />Live branch data</span></div>
      </header>
      <div className="operations-report-toolbar">
        <div className="operations-report-tabs" role="group" aria-label="Report category">
          {categories.map((entry) => <button key={entry.id} type="button" aria-pressed={category === entry.id} onClick={() => setCategory(entry.id)}>{entry.label}</button>)}
        </div>
        <label className="operations-report-search"><Search size={17} aria-hidden="true" /><input type="search" aria-label="Search operational reports" placeholder="Find a report…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear report search" onClick={() => setQuery("")}><X size={15} /></button>}</label>
      </div>
      <div className="operations-report-results"><span>{category === "all" ? "All operational reports" : categories.find((entry) => entry.id === category)?.label}</span><small aria-live="polite">{visible.length} of {reports.length} reports</small></div>
      <div className="operations-report-cards">
        {visible.map((report) => {
          const Icon = icons[report.icon] || FileBarChart;
          const categoryLabel = categories.find((entry) => entry.id === (report.category || categoryFor(report.icon)))?.label;
          return <button key={report.id} type="button" className={`operations-report-tile palette-${report.icon}`} onClick={() => onOpen(report)}>
            <span className="operations-tile-top"><span className="operations-tile-category">{categoryLabel}</span><span className="operations-tile-icon"><Icon size={22} aria-hidden="true" /></span></span>
            <span className="operations-tile-count">{report.displayValue ?? report.count.toLocaleString("en-IN")}</span>
            <span className="operations-tile-title">{report.title}</span>
            <span className="operations-tile-description">{report.description}</span>
            <span className="operations-tile-footer"><span>View report</span><ArrowUpRight size={17} aria-hidden="true" /></span>
          </button>;
        })}
      </div>
      {!visible.length && <div className="operations-report-empty"><Search size={28} aria-hidden="true" /><strong>No matching reports</strong><p>Try another name or select a different category.</p><button type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Show all reports</button></div>}
    </section>
  );
}
