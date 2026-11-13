import React from "react";
import { Boxes, ChefHat, ClipboardCheck, ClipboardList, PackageCheck, ReceiptText, TrendingUp, Trash2 } from "lucide-react";
import { ReportDirectory } from "./report-directory.jsx";

export const productionReportCatalog = [
  ["Daily Production", "Batches made, output quantities, and production cost.", ClipboardList, "green"],
  ["Ingredient Consumption", "Actual ingredients used and their cost by batch.", Boxes, "blue"],
  ["Food Cost Report", "Estimated and posted serving costs, gross profit, and margin.", ChefHat, "violet"],
  ["Serving category profitability", "Portions served, posted food costs, and gross food margin by menu category.", TrendingUp, "amber"],
  ["Batch profitability", "Actual sales, serving rates, cost, and margin by batch.", TrendingUp, "green"],
  ["Serving & component consumption", "Servings posted, ingredients used, and bills awaiting service.", ReceiptText, "violet"],
  ["Wastage Report", "Waste, other stock usage, transfers, and serving dispositions.", Trash2, "rose"],
  ["Finished Goods Stock", "Opening stock, receipts, issues, and closing value.", PackageCheck, "blue"],
  ["Stock count reconciliation", "Compare expected stock with physical counts and posted adjustments.", ClipboardCheck, "amber"],
];
export const productionReportNames = productionReportCatalog.map(([name]) => name);

export function ProductionReportsHub({ availableReports, onSelect }) {
  const reports = productionReportCatalog.filter(([name]) => availableReports.includes(name));
  return <ReportDirectory title="Production reports" description="Review production batches, serving costs, sales margins, and stock."
    groups={[{ title: "Kitchen operations", reports }]} onSelect={onSelect} />;
}
