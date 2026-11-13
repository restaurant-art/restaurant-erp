import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  FileSearch,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { buildLedgerAccountReport, defaultLedgerReportDates, filterLedgerReportAccounts, ledgerReportAccountOptions, ledgerReportDatePreset } from "./ledger-report.js";
import { ReportColumnControls, useReportColumns } from "./report-columns.jsx";
import { projectReportTable, quoteReportCsv } from "./report-columns.js";
import "./ledger-report-workspace.css";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));
const displayDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const ledgerColumns = ["Date", "Transaction type", "Party", "Details", "Reference", "Debit", "Credit", "Running balance"];

export function LedgerReportWorkspace({ data, notify, onBack, initialAccount = "" }) {
  const initialDates = useMemo(() => defaultLedgerReportDates(), []);
  const accountOptions = useMemo(() => ledgerReportAccountOptions(data.ledgerRows, data.ledgerMasters), [data]);
  const transactionTypes = useMemo(() => [...new Set((data.ledgerRows || []).map((entry) => entry.source).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [data]);
  const [filters, setFilters] = useState({ account: initialAccount, ...initialDates, party: "", transactionType: "All", direction: "All", minimum: "", maximum: "" });
  const [accountQuery, setAccountQuery] = useState(initialAccount);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [highlightedAccount, setHighlightedAccount] = useState(0);
  const accountPickerRef = useRef(null);
  const filteredAccountOptions = useMemo(() => filterLedgerReportAccounts(accountOptions, accountQuery), [accountOptions, accountQuery]);
  const datesAreValid = !filters.from || !filters.to || filters.from <= filters.to;
  const report = useMemo(() => filters.account && datesAreValid ? buildLedgerAccountReport(data.ledgerRows, filters) : null, [data, filters, datesAreValid]);
  const columnSelection = useReportColumns("finance:ledger", ledgerColumns);
  const visibleColumns = columnSelection.indices;
  const update = (name, value) => setFilters((current) => ({ ...current, [name]: value }));
  const selectPreset = (preset) => setFilters((current) => ({ ...current, ...ledgerReportDatePreset(preset) }));
  const clearFilters = () => setFilters((current) => ({ ...current, party: "", transactionType: "All", direction: "All", minimum: "", maximum: "" }));
  const selectAccount = (account) => {
    update("account", account);
    setAccountQuery(account);
    setAccountMenuOpen(false);
    setHighlightedAccount(0);
  };
  const openAccountMenu = () => {
    const selectedIndex = filteredAccountOptions.findIndex((account) => account === filters.account);
    setHighlightedAccount(Math.max(0, selectedIndex));
    setAccountMenuOpen(true);
  };
  const changeAccountQuery = (value) => {
    setAccountQuery(value);
    setHighlightedAccount(0);
    setAccountMenuOpen(true);
    if (filters.account) update("account", "");
  };
  const handleAccountKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setAccountMenuOpen(true);
      setHighlightedAccount((current) => Math.min(current + 1, Math.max(0, filteredAccountOptions.length - 1)));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setAccountMenuOpen(true);
      setHighlightedAccount((current) => Math.max(0, current - 1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (!accountMenuOpen) openAccountMenu();
      else if (filteredAccountOptions[highlightedAccount]) selectAccount(filteredAccountOptions[highlightedAccount]);
    }
    if (event.key === "Escape") {
      setAccountQuery(filters.account);
      setAccountMenuOpen(false);
    }
  };

  useEffect(() => {
    const closeAccountMenu = (event) => {
      if (accountPickerRef.current && !accountPickerRef.current.contains(event.target)) {
        setAccountQuery(filters.account);
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeAccountMenu);
    return () => document.removeEventListener("pointerdown", closeAccountMenu);
  }, [filters.account]);
  const download = () => {
    if (!report) return;
    const table = projectReportTable(ledgerColumns, report.rows.map((entry) =>
      [entry.date, entry.transactionType, entry.party, entry.details, entry.reference, entry.debit, entry.credit, entry.balance]), visibleColumns);
    const rows = [
      ["Ledger account", report.account],
      ["Period", `${report.from || "Beginning"} to ${report.to || "Today"}`],
      [],
      table.columns,
      ...table.rows,
    ];
    const blob = new Blob(["\ufeff", rows.map((row) => row.map(quoteReportCsv).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${report.account.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-ledger.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    notify?.("Ledger report downloaded");
  };

  return <section className="screen ledger-report-workspace">
    <div className="ledger-report-print print-report">
      <div className="ledger-report-breadcrumb"><button type="button" onClick={onBack}><ArrowLeft size={15} />Reports Centre</button><span>/</span><strong>Finance &amp; Tax</strong><span>/</span><span>Ledger Report</span></div>
      <header className="ledger-report-titlebar">
        <div><button type="button" onClick={onBack} aria-label="Back to finance reports"><ArrowLeft size={22} /></button><div><span>FINANCE &amp; TAX</span><h2>Ledger Report</h2><p>Review the complete transaction history and running balance for one ledger account.</p></div></div>
        <div className="ledger-report-toolbar">
          <span className="ledger-auto-update"><RefreshCw size={16} />Updates automatically</span>
          <button type="button" disabled={!report} onClick={() => window.print()}><Printer size={17} /><span>Print preview</span></button>
          <button type="button" disabled={!report} onClick={download}><Download size={17} /><span>Download</span></button>
        </div>
      </header>

      <section className="ledger-report-filters" aria-label="Ledger report filters">
        <div className="ledger-report-primary-filters">
          <div className="ledger-account-field">
            <span>Ledger account <b>*</b></span>
            <div className={`ledger-account-picker ${accountMenuOpen ? "is-open" : ""}`} ref={accountPickerRef}>
              <div className="ledger-account-input">
                <Search size={17} />
                <input
                  aria-label="Search ledger account"
                  aria-autocomplete="list"
                  aria-controls="ledger-account-options"
                  aria-expanded={accountMenuOpen}
                  aria-activedescendant={accountMenuOpen && filteredAccountOptions.length ? `ledger-account-option-${highlightedAccount}` : undefined}
                  autoComplete="off"
                  placeholder="Search or select ledger account"
                  role="combobox"
                  value={accountQuery}
                  onChange={(event) => changeAccountQuery(event.target.value)}
                  onClick={openAccountMenu}
                  onFocus={openAccountMenu}
                  onKeyDown={handleAccountKeyDown}
                />
                {accountQuery && <button type="button" className="ledger-account-clear" aria-label="Clear ledger account" onClick={() => { setAccountQuery(""); update("account", ""); setAccountMenuOpen(true); }}><X size={15} /></button>}
                <button type="button" className="ledger-account-toggle" aria-label="Show ledger accounts" aria-expanded={accountMenuOpen} onClick={() => accountMenuOpen ? setAccountMenuOpen(false) : openAccountMenu()}><ChevronDown size={17} /></button>
              </div>
              {accountMenuOpen && <div className="ledger-account-menu" id="ledger-account-options" role="listbox">
                <div className="ledger-account-menu-head"><span>LEDGER ACCOUNTS</span><strong>{filteredAccountOptions.length}</strong></div>
                <div className="ledger-account-options">
                  {filteredAccountOptions.map((account, index) => <button
                    type="button"
                    id={`ledger-account-option-${index}`}
                    className={`${index === highlightedAccount ? "is-highlighted" : ""} ${account === filters.account ? "is-selected" : ""}`}
                    key={account}
                    role="option"
                    aria-selected={account === filters.account}
                    onMouseEnter={() => setHighlightedAccount(index)}
                    onClick={() => selectAccount(account)}
                  ><span><BookOpen size={15} />{account}</span>{account === filters.account && <Check size={16} />}</button>)}
                  {!filteredAccountOptions.length && <div className="ledger-account-empty"><FileSearch size={22} /><strong>No ledger account found</strong><span>Try another account name.</span></div>}
                </div>
              </div>}
            </div>
          </div>
          <label><span>From date <b>*</b></span><div><CalendarDays size={17} /><input aria-label="From date" type="date" value={filters.from} onChange={(event) => update("from", event.target.value)} /></div></label>
          <label><span>To date <b>*</b></span><div><CalendarDays size={17} /><input aria-label="To date" type="date" value={filters.to} onChange={(event) => update("to", event.target.value)} /></div></label>
        </div>
        <div className="ledger-date-presets" role="group" aria-label="Quick date range">{["Today", "This month", "Previous month", "Financial year to date"].map((preset) => <button type="button" key={preset} onClick={() => selectPreset(preset)}>{preset}</button>)}</div>
        <div className="ledger-report-secondary-filters">
          <label><Search size={16} /><input aria-label="Party contains" placeholder="Party contains" value={filters.party} onChange={(event) => update("party", event.target.value)} /></label>
          <label><SlidersHorizontal size={16} /><select aria-label="Transaction type" value={filters.transactionType} onChange={(event) => update("transactionType", event.target.value)}><option>All</option>{transactionTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><select aria-label="Debit or credit" value={filters.direction} onChange={(event) => update("direction", event.target.value)}><option>All</option><option>Debit</option><option>Credit</option></select></label>
          <label><input aria-label="Minimum amount" type="number" min="0" step="0.01" placeholder="Minimum amount" value={filters.minimum} onChange={(event) => update("minimum", event.target.value)} /></label>
          <label><input aria-label="Maximum amount" type="number" min="0" step="0.01" placeholder="Maximum amount" value={filters.maximum} onChange={(event) => update("maximum", event.target.value)} /></label>
          <button type="button" className="ledger-clear-filters" onClick={clearFilters}>Clear filters</button>
        </div>
      </section>

      {!datesAreValid && <section className="ledger-report-empty"><span><CalendarDays size={42} /></span><h3>Check the Date Range</h3><p>The From date must be before or the same as the To date. The report will update automatically after correction.</p></section>}
      {datesAreValid && !report && <section className="ledger-report-empty"><span><BookOpen size={42} /></span><h3>Select a Ledger Account</h3><p>Choose a ledger account from the dropdown above. Its transaction history will appear automatically.</p></section>}

      {report && <section className="ledger-report-results">
        <div className="ledger-report-summary-head"><div><span>LEDGER ACCOUNT</span><h3>{report.account}</h3><p>{displayDate(report.from)} to {displayDate(report.to)}</p></div><em>{report.rows.length} {report.rows.length === 1 ? "transaction" : "transactions"}</em></div>
        <div className="ledger-report-metrics"><article><span>Opening balance</span><strong>{money(report.openingBalance)}</strong></article><article><span>Total debits</span><strong className="debit">{money(report.totalDebit)}</strong></article><article><span>Total credits</span><strong className="credit">{money(report.totalCredit)}</strong></article><article><span>Closing balance</span><strong>{money(report.closingBalance)}</strong></article></div>
        <ReportColumnControls label="Ledger transactions" columns={ledgerColumns} selection={columnSelection} />
        <div className="ledger-report-table-wrap"><table className="ledger-report-table">
          <thead><tr><th scope="col">#</th>{visibleColumns.map((index) => <th key={index} scope="col" className={index >= 5 ? "numeric" : ""}>{ledgerColumns[index]}</th>)}</tr></thead>
          <tbody>{report.rows.map((entry, index) => {
            const cells = [displayDate(entry.date), <span className="ledger-type-pill">{entry.transactionType}</span>, <strong>{entry.party}</strong>,
              entry.details || "—", entry.reference, entry.debit ? money(entry.debit) : "—", entry.credit ? money(entry.credit) : "—", <strong>{money(entry.balance)}</strong>];
            return <tr key={`${entry.date}-${entry.reference}-${index}`}><td>{index + 1}</td>{visibleColumns.map((column) =>
              <td key={column} className={column === 5 ? "numeric debit" : column === 6 ? "numeric credit" : column === 7 ? "numeric" : ""}>{cells[column]}</td>)}</tr>;
          })}
          {!report.rows.length && <tr><td colSpan={visibleColumns.length + 1}><div className="ledger-no-records"><FileSearch size={28} /><h3>No transactions match these filters</h3><p>Change the date range or clear the optional filters. The report will update automatically.</p></div></td></tr>}</tbody>
          <tfoot><tr><td>Total</td>{visibleColumns.map((index) => <td key={index} className={index >= 5 ? "numeric" : ""}>{index >= 5 ? money([report.totalDebit, report.totalCredit, report.closingBalance][index - 5]) : ""}</td>)}</tr></tfoot>
        </table></div>
      </section>}
    </div>
  </section>;
}
