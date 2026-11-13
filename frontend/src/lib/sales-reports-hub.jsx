import React, { useState } from "react";
import { ArrowUpRight, BarChart3, Clock, ReceiptText, PackageSearch, Percent, History, Building2, Boxes, ChefHat, TrendingUp, Users, Truck, Search, X, FileBarChart } from "lucide-react";
import { financeReportGroups } from "./finance-reports.js";
import { productionReportCatalog } from "./production-reports-hub.jsx";
import "./sales-reports-hub.css";

export const salesReportGroups = [
  { title: "Sales & billing", reports: [
    ["Daily sales", "Bills, payments, GST, discounts, and daily totals.", ReceiptText, "green"],
    ["Item-wise sales", "Products sold, quantities, selling rates, and sales values.", PackageSearch, "blue"],
    ["Hourly sales", "Sales and bill counts by time of day.", Clock, "violet"],
    ["GST", "Recorded sales tax and taxable amounts.", Percent, "amber"],
    ["Cashier closing", "Shift closing balances and cash variances.", History, "blue"],
    ["Void and refund", "Cancelled items and recorded refunds with reasons.", ReceiptText, "rose"],
    ["Branch comparison", "Compare sales performance across accessible branches.", Building2, "violet"],
  ] },
  { title: "Stock & profitability", reports: [
    ["Inventory valuation", "Stock quantities, unit costs, and inventory value.", Boxes, "blue"],
    ["Food cost analysis", "Recipe costs and food cost against recorded sales.", ChefHat, "amber"],
    ["Menu profitability", "Item sales, costs, gross profit, and margins.", TrendingUp, "green"],
  ] },
  { title: "Other business reports", reports: [
    ["Payroll", "Review recorded payroll values.", Users, "violet"],
    ["Supplier outstanding", "Supplier balances and unpaid purchase amounts.", Truck, "rose"],
  ] },
];
export const salesReportNames = salesReportGroups.flatMap((group) => group.reports.map(([name]) => name));

const financeIcons = { scale: BarChart3, balance: FileBarChart, trend: TrendingUp, book: ReceiptText, ledger: FileBarChart, cash: ReceiptText, trade: Users, calendar: Clock, daily: BarChart3, monthly: TrendingUp, tax: Percent, truck: Truck, bank: ReceiptText, vendor: Building2, customer: Users, expense: ReceiptText, payment: History, stock: Boxes, analysis: PackageSearch };

export function SalesReportsHub({ availableReports, availableFinanceReports = [], availableProductionReports = [], onSelect, onSelectFinance, onSelectProduction }) {
  const [query, setQuery] = useState("");
  const catalogGroups = [
    ...salesReportGroups.map((group) => ({ ...group, module: "sales" })),
    ...financeReportGroups.map((group) => ({
      title: group.title,
      module: "finance",
      reports: group.reports.map(([name, description, icon]) => [name, description, financeIcons[icon] || FileBarChart, "violet"]),
    })),
    { title: "Production reports", module: "production", reports: productionReportCatalog },
  ];
  const visibleGroups = catalogGroups.map((group) => ({ ...group, reports: group.reports.filter(([name, description]) => {
    const available = group.module === "sales" ? availableReports.includes(name)
      : group.module === "finance" ? availableFinanceReports.includes(name)
        : availableProductionReports.includes(name);
    return available && `${name} ${description}`.toLowerCase().includes(query.trim().toLowerCase());
  }) })).filter(group => group.reports.length);
  const count = visibleGroups.reduce((sum, group) => sum + group.reports.length, 0);
  return <section className="screen sales-reports-hub" aria-label="Business reports">
    <header className="sales-reports-hub-head"><div><span>REPORTS CENTRE</span><h2><BarChart3 size={25} />All reports</h2><p>Sales, finance, and production reports in one searchable directory.</p></div>
      <label className="sales-reports-hub-search"><Search size={18} /><input type="search" aria-label="Find a report" placeholder="Find a report…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Clear report search" onClick={() => setQuery("")}><X size={16} /></button>}</label>
    </header>
    <p className="sales-reports-hub-count" role="status">{count} reports available</p>
    {visibleGroups.map(group => <section className="sales-reports-hub-group" key={group.title} aria-label={group.title}><h3>{group.title}</h3><div className="sales-reports-hub-grid">
      {group.reports.map(([name, description, Icon, tone]) => <button type="button" key={`${group.module}-${name}`} className={`sales-reports-hub-card tone-${tone}`} onClick={() => {
        if (group.module === "finance") onSelectFinance?.(name);
        else if (group.module === "production") onSelectProduction?.(name);
        else onSelect(name);
      }}>
        <span className="sales-reports-hub-icon"><Icon size={23} /></span><strong>{name === "GST" ? "GST report" : name === "Void and refund" ? "Void & refunds" : name}</strong><small>{description}</small><span className="sales-reports-hub-open">View report <ArrowUpRight size={17} /></span>
      </button>)}
    </div></section>)}
    {!count && <div className="sales-reports-hub-empty"><Search size={28} /><h3>No reports found</h3><p>{query ? "Try another report name." : "No reports are available for your role."}</p>{query && <button type="button" onClick={() => setQuery("")}>Clear search</button>}</div>}
  </section>;
}
