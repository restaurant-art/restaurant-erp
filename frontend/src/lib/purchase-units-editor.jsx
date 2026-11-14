import React from "react";
import { productStockMeasure } from "./purchase-units.js";
import "./purchase-units.css";

export function PurchaseSizePreview({ product, line }) {
  const size = line.purchaseUnit;
  const stock = productStockMeasure(product);
  const label = size ? `${size.quantity || "?"} ${size.unit}` : stock && Number(stock.factor) > 0 ? `${stock.factor.toLocaleString("en-IN", { maximumFractionDigits: 6 })} ${stock.base}` : stock ? "Enter actual size" : "Not configured";
  return <span className="purchase-pack-fixed" title={size?.mode === "delivery" ? "Actual size recorded on this invoice." : "Usual contents of one purchase unit, saved in Product Master."}>{product ? label : "—"}</span>;
}
