import React, { useState } from "react";
import { ArrowUpRight, BarChart3, Search, X } from "lucide-react";
import "./sales-reports-hub.css";

export function ReportDirectory({ title, description, groups, onSelect, className = "" }) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const visibleGroups = groups.map((group) => ({
    ...group,
    reports: group.reports.filter(([name, summary]) => `${name} ${summary}`.toLowerCase().includes(search)),
  })).filter((group) => group.reports.length);
  const count = visibleGroups.reduce((sum, group) => sum + group.reports.length, 0);

  return <section className={`sales-reports-hub ${className}`.trim()} aria-label={title}>
    <header className="sales-reports-hub-head">
      <div><span>REPORTS CENTRE</span><h2><BarChart3 size={25} />{title}</h2><p>{description}</p></div>
      <label className="sales-reports-hub-search">
        <Search size={18} />
        <input type="search" aria-label="Find a report" placeholder="Find a report…" value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" aria-label="Clear report search" onClick={() => setQuery("")}><X size={16} /></button>}
      </label>
    </header>
    <p className="sales-reports-hub-count" role="status">{count} {count === 1 ? "report" : "reports"} available</p>
    {visibleGroups.map(({ title, module, reports }) => <section className="sales-reports-hub-group" key={title} aria-label={title}>
      <h3>{title}</h3>
      <div className="sales-reports-hub-grid">
        {reports.map(([name, summary, Icon, tone]) => <button type="button" key={name}
          className={`sales-reports-hub-card tone-${tone}`} onClick={() => onSelect(name, module)}>
          <span className="sales-reports-hub-icon"><Icon size={23} /></span>
          <strong>{name === "GST" ? "GST report" : name === "Void and refund" ? "Void & refunds" : name}</strong>
          <small>{summary}</small>
          <span className="sales-reports-hub-open">View report <ArrowUpRight size={17} /></span>
        </button>)}
      </div>
    </section>)}
    {!count && <div className="sales-reports-hub-empty">
      <Search size={28} /><h3>No reports found</h3>
      <p>{search ? "Try another report name." : "No reports are available for your role."}</p>
      {search && <button type="button" onClick={() => setQuery("")}>Clear search</button>}
    </div>}
  </section>;
}
