import React, { useState } from "react";
import { ArrowUpRight, Boxes, ChefHat, ClipboardList, PackageCheck, Search, Trash2, X } from "lucide-react";
import "./production-reports-hub.css";

export const productionReportCatalog = [
  ["Daily Production", "Production batches, quantities, status, and material cost.", ClipboardList, "green"],
  ["Ingredient Consumption", "Ingredients used across production and their total cost.", Boxes, "blue"],
  ["Food Cost Report", "Recipe cost, selling price, gross profit, and margin.", ChefHat, "violet"],
  ["Wastage Report", "Recorded wastage, reasons, quantities, and approval status.", Trash2, "amber"],
  ["Finished Goods Stock", "Available finished goods, quantities, and production cost.", PackageCheck, "rose"],
];
export const productionReportNames = productionReportCatalog.map(([name]) => name);

export function ProductionReportsHub({ availableReports, onSelect }) {
  const [query, setQuery] = useState("");
  const visible = productionReportCatalog.filter(([name, description]) =>
    availableReports.includes(name) && `${name} ${description}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="production-reports-hub" aria-label="Production reports">
    <header className="production-reports-hub-head">
      <div><span>PRODUCTION CENTRE</span><h2>Production reports</h2><p>Choose a report to review production, ingredient use, food cost, wastage, or finished stock.</p></div>
      <label className="production-reports-hub-search"><Search size={18} /><input aria-label="Find a production report" type="search" placeholder="Find a report…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear production report search" onClick={() => setQuery("")}><X size={16} /></button>}</label>
    </header>
    <div className="production-reports-hub-subhead"><h3>All production reports</h3><span>{visible.length} of {availableReports.length} reports</span></div>
    {visible.length ? <div className="production-reports-hub-grid">{visible.map(([name, description, Icon, tone]) =>
      <button type="button" key={name} className={`production-reports-hub-card tone-${tone}`} onClick={() => onSelect(name)}>
        <span className="production-reports-hub-icon"><Icon size={22} /></span><strong>{name}</strong><small>{description}</small><span className="production-reports-hub-open">View report <ArrowUpRight size={17} /></span>
      </button>)}</div> : <div className="production-reports-hub-empty"><Search size={28} /><h3>No reports found</h3><p>{query ? "Try another report name." : "No production reports are available for your role."}</p>{query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}</div>}
  </section>;
}
