import React from "react";
import "./purchase-invoice-adjustments.css";

export function PurchaseInvoiceAdjustments({ value, onChange, gstRates, errors, totals }) {
  const rateOptions = (current) => [...new Set([...gstRates, Number(current || 0)])].filter(Number.isFinite).sort((a, b) => a - b);
  return <section className="purchase-bill-adjustments" aria-label="Bill adjustments">
    <div><h4>Bill discount & charges</h4><p>Bill discount applies after item discounts, before GST. Enter freight and other charges before their GST.</p></div>
    <div className="purchase-bill-adjustments-grid">
      <label><span>Bill discount type</span><select aria-label="Bill discount type" value={value.billDiscountType || "amount"} onChange={(event) => onChange({ billDiscountType: event.target.value })}><option value="amount">Amount (₹)</option><option value="percent">Percentage (%)</option></select></label>
      <label><span>Bill discount</span><input aria-label="Bill discount" type="number" min="0" max={value.billDiscountType === "percent" ? 100 : undefined} step="0.01" placeholder="0" value={value.billDiscountValue ?? ""} onChange={(event) => onChange({ billDiscountValue: event.target.value })} /></label>
      <label><span>Freight / delivery charge (₹)</span><input type="number" min="0" step="0.01" placeholder="0" value={value.freightCharge ?? ""} onChange={(event) => onChange({ freightCharge: event.target.value })} /></label>
      <label><span>Freight GST %</span><select aria-label="Freight GST %" value={value.freightGstRate || "0"} onChange={(event) => onChange({ freightGstRate: event.target.value })}>{rateOptions(value.freightGstRate).map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
      <label><span>Other charges (₹)</span><input type="number" min="0" step="0.01" placeholder="0" value={value.otherCharges ?? ""} onChange={(event) => onChange({ otherCharges: event.target.value })} /></label>
      <label><span>Other charges GST %</span><select aria-label="Other charges GST %" value={value.otherChargesGstRate || "0"} onChange={(event) => onChange({ otherChargesGstRate: event.target.value })}>{rateOptions(value.otherChargesGstRate).map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
    </div>
    <div className="purchase-round-off">
      <label><span>Round off</span><select aria-label="Round off" value={value.roundOffMode || "none"} onChange={(event) => onChange({ roundOffMode: event.target.value })}>
        <option value="none">No rounding</option><option value="nearest">Nearest rupee (automatic)</option><option value="manual">Manual adjustment</option>
      </select></label>
      <label><span>Round-off adjustment (₹)</span><input aria-label="Round-off adjustment (₹)" type="number" step="0.01" placeholder="0" readOnly={value.roundOffMode !== "manual"} value={value.roundOffMode === "manual" ? value.roundOffValue ?? "" : totals?.roundOff ?? 0} onChange={(event) => onChange({ roundOffValue: event.target.value })} /></label>
      <p>Applied after GST. Use a positive amount to add or a negative amount to deduct. Automatic rounding updates when the bill changes.</p>
    </div>
    {errors.length > 0 && <p role="alert" className="purchase-adjustment-error">{errors[0]}</p>}
  </section>;
}
