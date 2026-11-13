import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  BookOpen,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  CircleDollarSign,
  FileBarChart,
  FileCheck2,
  FileSpreadsheet,
  Landmark,
  PackageSearch,
  ReceiptIndianRupee,
  Scale,
  Search,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { ReportsWorkspace } from "./reports-workspace.jsx";
import { buildFinanceReport, financeReportGroups, financeReportNames, postedSaleReference, saleDate, summarizeFinanceReport } from "./finance-reports.js";
import { defaultLedgerReportDates, ledgerReportDatePreset } from "./ledger-report.js";
import { LedgerReportWorkspace } from "./ledger-report-workspace.jsx";
import { loadPostedSaleCosts } from "./production-api.js";
import "./finance-reports-hub.css";

const icons = {
  scale: Scale,
  balance: FileCheck2,
  trend: TrendingUp,
  book: BookOpen,
  ledger: FileSpreadsheet,
  cash: CircleDollarSign,
  trade: Users,
  calendar: CalendarClock,
  daily: BarChart3,
  monthly: ChartNoAxesCombined,
  tax: ReceiptIndianRupee,
  truck: Truck,
  bank: Landmark,
  vendor: Building2,
  customer: Users,
  expense: Banknote,
  payment: WalletCards,
  stock: PackageSearch,
  analysis: ShoppingBag,
};

const reportTone = (icon) => ["tax", "trend", "analysis"].includes(icon) ? "amber" : ["bank", "cash", "balance"] .includes(icon) ? "blue" : ["vendor", "customer", "trade"] .includes(icon) ? "violet" : "green";
const safeFileName = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const quoteCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const reportDescription = (name) => financeReportGroups.flatMap((group) => group.reports).find(([reportName]) => reportName === name)?.[1] || "Live financial records and totals for your selected period.";

export function FinanceReportsHub({ data, storeId, notify, reportRequest = null }) {
  const initialDates = useMemo(() => defaultLedgerReportDates(), []);
  const [selectedReport, setSelectedReport] = useState("");
  const [hubSearch, setHubSearch] = useState("");
  const [fromDate, setFromDate] = useState(initialDates.from);
  const [toDate, setToDate] = useState(initialDates.to);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [postedCosts, setPostedCosts] = useState(null);
  const costsRequired = storeId && ["Profit & Loss", "Balance Sheet"].includes(selectedReport);
  const costReferences = JSON.stringify(costsRequired ? [...new Set((data.salesLedger || [])
    .filter((bill) => !saleDate(bill) || ((!toDate || saleDate(bill) <= toDate) &&
      (selectedReport === "Balance Sheet" || !fromDate || saleDate(bill) >= fromDate)))
    .map(postedSaleReference).filter(Boolean))] : []);
  const costKey = JSON.stringify([storeId, costReferences]);
  useEffect(() => {
    if (!costsRequired) return;
    let active = true;
    let revision = 0;
    const refresh = async (event) => {
      if (event?.detail && String(event.detail.storeId) !== String(storeId)) return;
      const current = ++revision;
      const references = JSON.parse(costReferences);
      try {
        const batches = [];
        for (let index = 0; index < references.length; index += 500) {
          batches.push(await loadPostedSaleCosts(storeId, references.slice(index, index + 500)));
          if (!active || current !== revision) return;
        }
        if (active) setPostedCosts({
          key: costKey, enabled: batches.some((batch) => batch.enabled),
          costs: Object.assign({}, ...batches.map((batch) => batch.costs)),
        });
      } catch {
        if (active && current === revision) setPostedCosts(null);
      }
    };
    refresh();
    window.addEventListener("uvpro-kitchen-updated", refresh);
    return () => { active = false; window.removeEventListener("uvpro-kitchen-updated", refresh); };
  }, [costKey, costReferences, costsRequired, storeId]);
  useEffect(() => {
    if (!reportRequest?.report) return;
    const dates = defaultLedgerReportDates();
    setSelectedReport(reportRequest.report);
    setFromDate(dates.from);
    setToDate(dates.to);
    setSearch("");
    setFilter("All");
  }, [reportRequest]);
  const datesAreValid = !fromDate || !toDate || fromDate <= toDate;
  const costState = postedCosts?.key === costKey ? postedCosts : null;
  const report = useMemo(() => selectedReport ? buildFinanceReport(selectedReport, {
    ...data, requirePostedCosts: Boolean(costsRequired && costState?.enabled !== false), postedSaleCosts: costState?.costs,
  }, { from: fromDate, to: toDate }) : null, [selectedReport, data, fromDate, toDate, costsRequired, costState]);
  const filteredRecords = useMemo(() => {
    if (!report || !datesAreValid) return [];
    const needle = search.trim().toLowerCase();
    return report.records.filter((record) => {
      if (filter !== "All" && record.filter !== filter) return false;
      return !needle || record.cells.some((cell) => String(cell ?? "").toLowerCase().includes(needle));
    });
  }, [report, datesAreValid, filter, search]);

  const selectReport = (name) => {
    const dates = defaultLedgerReportDates();
    setSelectedReport(name);
    setFromDate(dates.from);
    setToDate(dates.to);
    setSearch("");
    setFilter("All");
  };
  const selectDatePreset = (preset) => {
    if (preset === "All time") {
      setFromDate("");
      setToDate("");
      return;
    }
    const dates = ledgerReportDatePreset(preset);
    setFromDate(dates.from);
    setToDate(dates.to);
  };
  const exportReport = (type) => {
    if (["PDF", "Print"].includes(type)) {
      window.print();
      return;
    }
    const delimiter = type === "Excel" ? "\t" : ",";
    const rows = [report.columns, ...filteredRecords.map((record) => record.cells)];
    const content = rows.map((values) => values.map((value) => type === "Excel" ? String(value ?? "") : quoteCsv(value)).join(delimiter)).join("\r\n");
    const extension = type === "Excel" ? "xls" : "csv";
    const blob = new Blob(["\ufeff", content], { type: type === "Excel" ? "application/vnd.ms-excel;charset=utf-8" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFileName(selectedReport)}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify?.(`${selectedReport} ${type} export downloaded`);
  };

  if (selectedReport === "Ledger Report") return <LedgerReportWorkspace data={data} notify={notify} onBack={() => setSelectedReport("")} />;

  if (selectedReport && report) return <div className="finance-report-detail">
    <ReportsWorkspace
      selectedReport={selectedReport}
      reports={financeReportNames}
      onSelectReport={selectReport}
      onBack={() => setSelectedReport("")}
      eyebrow="FINANCE & TAX"
      description={reportDescription(selectedReport)}
      autoUpdate
      fromDate={fromDate}
      toDate={toDate}
      onFromDateChange={setFromDate}
      onToDateChange={setToDate}
      onDatePreset={selectDatePreset}
      dateRangeValid={datesAreValid}
      search={search}
      onSearchChange={setSearch}
      filter={filter}
      onFilterChange={setFilter}
      filterLabel={report.filterLabel}
      filterOptions={report.filterOptions}
      columns={report.columns}
      rows={filteredRecords.map((record) => record.cells)}
      columnTotals={summarizeFinanceReport(report, filteredRecords)}
      onAction={exportReport}
    />
  </div>;

  const normalizedSearch = hubSearch.trim().toLowerCase();
  const visibleGroups = financeReportGroups.map((group) => ({
    ...group,
    reports: group.reports.filter(([name, description]) => !normalizedSearch || `${name} ${description}`.toLowerCase().includes(normalizedSearch)),
  })).filter((group) => group.reports.length);

  return <section className="screen finance-reports-hub" aria-label="Finance reports">
    <header className="finance-reports-head">
      <div className="finance-reports-hero-copy"><span>UVPRO REPORT LIBRARY</span><h2>Every financial answer,<br />in one place.</h2><p>Review accounting, tax, cash, party, payment, and stock reports generated live from your business records.</p><div className="finance-reports-hero-tags"><span>12 Financial</span><span>9 GST</span><span>10 Statements</span></div></div>
      <label className="finance-reports-search"><Search size={18} /><input aria-label="Find a finance report" value={hubSearch} onChange={(event) => setHubSearch(event.target.value)} placeholder="Find a report…" />{hubSearch && <button type="button" aria-label="Clear report search" onClick={() => setHubSearch("")}><X size={15} /></button>}</label>
    </header>
    <div className="finance-reports-count"><span className="finance-reports-count-icon"><FileBarChart size={19} /></span><div><strong>{financeReportNames.length}</strong><span>live reports</span></div><p>Select any report to open its filters, totals, detailed records, print view, and exports.</p><span className="finance-reports-live"><i />Live business data</span></div>
    {visibleGroups.map((group) => <section className="finance-report-group" key={group.title} aria-labelledby={`finance-${safeFileName(group.title)}`}>
      <div className="finance-report-group-head"><div><h3 id={`finance-${safeFileName(group.title)}`}>{group.title}</h3><p>{group.title === "Financial reports" ? "Core financial statements, books, and management summaries" : group.title === "GST registers" ? "GST-ready sales, purchase, tax, HSN, and compliance registers" : "Cash, bank, party, payment, expense, and inventory records"}</p></div><span>{group.reports.length} reports</span></div>
      <div className="finance-report-card-grid">{group.reports.map(([name, description, icon], index) => {
        const Icon = icons[icon] || FileBarChart;
        return <button type="button" className={`finance-report-card ${reportTone(icon)}`} key={name} onClick={() => selectReport(name)}>
          <span className="finance-report-card-number">{String(index + 1).padStart(2, "0")}</span><span className="finance-report-card-icon"><Icon size={21} /></span><span className="finance-report-card-copy"><strong>{name}</strong><small>{description}</small></span><span className="finance-report-card-arrow">Open report <ArrowUpRight size={14} /></span>
        </button>;
      })}</div>
    </section>)}
    {!visibleGroups.length && <div className="finance-reports-empty"><Search size={28} /><h3>No report found</h3><p>Try a different report name or keyword.</p><button type="button" onClick={() => setHubSearch("")}>Show all reports</button></div>}
  </section>;
}
