import React from "react";
import { BarChart3, Clock, ReceiptText, PackageSearch, Percent, History, Building2, Boxes, ChefHat, TrendingUp, Users, Truck, FileBarChart } from "lucide-react";
import { financeReportGroups } from "./finance-reports.js";
import { productionReportCatalog } from "./production-reports-hub.jsx";
import { ReportDirectory } from "./report-directory.jsx";

export const salesReportGroups = [
  { title: "Sales & billing", reports: [
    ["Daily sales", "Bills, payments, GST, discounts, and daily totals.", ReceiptText, "green"],
    ["Item-wise sales", "Products sold, quantities, selling rates, and sales values.", PackageSearch, "blue"],
    ["Category-wise sales", "Gross and net sales, discounts, refunds, and GST by product or menu category.", BarChart3, "green"],
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
  const available = { sales: availableReports, finance: availableFinanceReports, production: availableProductionReports };
  const catalogGroups = [
    ...salesReportGroups.map((group) => ({ ...group, module: "sales" })),
    ...financeReportGroups.map((group) => ({
      title: group.title,
      module: "finance",
      reports: group.reports.map(([name, description, icon]) => [name, description, financeIcons[icon] || FileBarChart, "violet"]),
    })),
    { title: "Production reports", module: "production", reports: productionReportCatalog },
  ];
  const groups = catalogGroups.map((group) => ({
    ...group,
    reports: group.reports.filter(([name]) => available[group.module].includes(name)),
  }));
  const open = { sales: onSelect, finance: onSelectFinance, production: onSelectProduction };
  return <ReportDirectory className="screen" title="All reports" description="Sales, finance, and production reports in one searchable directory."
    groups={groups} onSelect={(name, module) => open[module]?.(name)} />;
}
