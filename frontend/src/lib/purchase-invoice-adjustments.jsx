import React from "react";
import "./purchase-invoice-adjustments.css";

export function PurchaseInvoiceAdjustments({ value, onChange, gstRates, errors, totals, formatMoney }) {
  const rateOptions = (current) => [...new Set([...gstRates, Number(current || 0)])].filter(Number.isFinite).sort((a, b) => a - b);
  const afterGst = value.billDiscountBasis === "after_gst";
  const withoutTax = value.billType === "urd";
  return <section className="purchase-bill-adjustments" aria-label="Bill adjustments">
    <div><h4>Bill discount & charges</h4><p>{afterGst ? "Bill discount reduces the final total after GST. GST stays unchanged." : "Bill discount applies after item discounts, before GST. GST is recalculated on the reduced item values."} Enter freight and other charges before their GST.</p></div>
    <label className="purchase-discount-basis"><span>Apply bill discount</span><select aria-label="Apply bill discount" value={value.billDiscountBasis || "before_gst"} onChange={(event) => onChange({ billDiscountBasis: event.target.value })}>
      <option value="after_gst">After GST — deduct from final total</option><option value="before_gst">Before GST — recalculate GST</option>
    </select><small>{afterGst ? "Amount discounts deduct the exact amount entered. Percentage discounts use the total including GST and charges, before round off." : "Percentage discounts use the item value after item discounts, before GST and charges."}</small></label>
    {afterGst && <label className="purchase-discount-split">
      <input type="checkbox" aria-label="Split bill discount across items" checked={value.billDiscountSplit ?? false} onChange={(event) => onChange({ billDiscountSplit: event.target.checked })} />
      <span><strong>Split bill discount across items</strong><small>{value.billDiscountSplit ? "The discount is allocated proportionally to item lines and reduces each item's recorded purchase cost. GST stays unchanged." : "Keep it as one invoice-level discount; item lines and recorded item costs stay unchanged."}</small></span>
    </label>}
    <div className="purchase-bill-adjustments-grid">
      <label><span>Bill discount type</span><select aria-label="Bill discount type" value={value.billDiscountType || "amount"} onChange={(event) => onChange({ billDiscountType: event.target.value })}><option value="amount">Amount (₹)</option><option value="percent">Percentage (%)</option></select></label>
      <label><span>Bill discount</span><input aria-label="Bill discount" type="number" min="0" max={value.billDiscountType === "percent" ? 100 : undefined} step="0.01" placeholder="0" value={value.billDiscountValue ?? ""} onChange={(event) => onChange({ billDiscountValue: event.target.value })} /></label>
      <label><span>Freight / delivery charge (₹)</span><input type="number" min="0" step="0.01" placeholder="0" value={value.freightCharge ?? ""} onChange={(event) => onChange({ freightCharge: event.target.value })} /></label>
      <label><span>Freight GST %</span><select aria-label="Freight GST %" disabled={withoutTax} value={withoutTax ? "0" : value.freightGstRate || "0"} onChange={(event) => onChange({ freightGstRate: event.target.value })}>{rateOptions(withoutTax ? 0 : value.freightGstRate).map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
      <label><span>Other charges (₹)</span><input type="number" min="0" step="0.01" placeholder="0" value={value.otherCharges ?? ""} onChange={(event) => onChange({ otherCharges: event.target.value })} /></label>
      <label><span>Other charges GST %</span><select aria-label="Other charges GST %" disabled={withoutTax} value={withoutTax ? "0" : value.otherChargesGstRate || "0"} onChange={(event) => onChange({ otherChargesGstRate: event.target.value })}>{rateOptions(withoutTax ? 0 : value.otherChargesGstRate).map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>
    </div>
    {totals?.billDiscount > 0 && errors.length === 0 && <div className="purchase-discount-explanation" role="status">
      <strong>How this discount changes your bill</strong>
      {afterGst ? <><p>{formatMoney(totals.beforeBillDiscount)} − {formatMoney(totals.billDiscount)} bill discount = <strong>{formatMoney(totals.beforeRoundOff)} before round off.</strong></p><p>GST stays at {formatMoney(totals.tax)}. {value.billDiscountSplit ? "The discount is split proportionally across item totals and recorded purchase costs." : "The discount remains at invoice level; item totals and recorded costs stay unchanged."}</p></>
        : <><p>{formatMoney(totals.billDiscount)} bill discount + {formatMoney(totals.billDiscountTaxReduction)} lower GST = <strong>{formatMoney(totals.billDiscount + totals.billDiscountTaxReduction)} reduction before round off.</strong></p><p>The discount is shared across items in proportion to their value after item discounts. GST is recalculated at each item's rate. Line totals include these adjustments.</p></>}
    </div>}
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
