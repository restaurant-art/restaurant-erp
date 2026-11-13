import React, { useEffect, useId, useRef } from "react";
import { ArrowRight, Banknote, Check, CircleCheck, CreditCard, QrCode, ReceiptText, SlidersHorizontal, UserRound, X } from "lucide-react";
import "./pos-split-payment.css";

const methodIcons = { Cash: Banknote, UPI: QrCode, Card: CreditCard, Credit: UserRound };
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(amount) || 0);

export function SplitPaymentDialog({ training = false, total, amounts, paidTotal, methodCount, difference, valid, orderNumber, error, onAmountChange, onClose, onSubmit }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const progress = total > 0 ? Math.max(0, Math.min(100, paidTotal / total * 100)) : 0;
  const balanced = Math.abs(difference) < 0.01;
  const excess = difference < -0.009;
  const status = valid ? "Ready to collect" : balanced ? "Use two or more methods" : excess ? "Check the amounts" : "Amount left to assign";

  useEffect(() => {
    const previousFocus = document.activeElement;
    dialogRef.current?.querySelector("input")?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  function handleKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), [tabindex='0']")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return (
    <div className="shift-modal-backdrop pos-split-backdrop" role="presentation">
      <form ref={dialogRef} className="pos-split-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onSubmit={onSubmit} onKeyDown={handleKeys}>
        <header className="pos-split-head">
          <span className="pos-split-head-icon"><SlidersHorizontal size={22} strokeWidth={1.7} /></span>
          <div><span className="pos-split-eyebrow">CHECKOUT</span><h2 id={titleId}>Split payment</h2></div>
          <button className="pos-split-close" type="button" aria-label="Close split payment" onClick={onClose}><X size={19} /></button>
        </header>
        <p id={descriptionId} className="pos-split-intro">{training ? "TRAINING ONLY — split payments are simulated. Do not collect money." : "Divide this bill across two or more payment methods."}</p>
        <div className="pos-split-total">
          <div><span>Bill total</span><small><ReceiptText size={13} /> {orderNumber || "Current bill"}</small></div>
          <strong>{money(total)}</strong>
        </div>
        <div className="pos-split-section-title"><h3>Payment methods</h3><span>{methodCount} selected</span></div>
        <div className="pos-split-methods">
          {Object.keys(amounts).map((method) => {
            const Icon = methodIcons[method] || CreditCard;
            const selected = Number(amounts[method] || 0) > 0;
            return (
              <label className={`pos-split-method${selected ? " is-selected" : ""}${method === "Credit" ? " is-credit" : ""}`} key={method}>
                <span className="pos-split-method-title"><span className="pos-split-method-icon"><Icon size={18} strokeWidth={1.7} /></span><span>{method}</span><span className="pos-split-method-check" aria-hidden="true">{selected && <Check size={11} strokeWidth={3} />}</span></span>
                <span className="pos-split-input"><span aria-hidden="true">₹</span><input aria-label={`${method} amount`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={amounts[method]} onChange={(event) => onAmountChange(method, event.target.value)} /></span>
              </label>
            );
          })}
        </div>
        <section className={`pos-split-balance${valid ? " is-balanced" : excess ? " is-excess" : ""}`} aria-label="Payment allocation">
          <div className="pos-split-balance-row"><span>Allocated <strong>{money(paidTotal)}</strong></span><span>{excess ? "Excess" : "Remaining"}<strong>{money(Math.abs(difference))}</strong></span></div>
          <div className="pos-split-progress" role="progressbar" aria-label="Bill amount allocated" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
          <p role="status" aria-live="polite">{valid ? <CircleCheck size={14} /> : <span className="pos-split-status-dot" />}{status}</p>
        </section>
        {error && <p className="pos-payment-error" role="alert">{error}</p>}
        <footer className="pos-split-footer">
          <button className="pos-split-cancel" type="button" onClick={onClose}>Cancel</button>
          <button className="pos-split-submit" type="submit" disabled={!valid}><span>{training ? "Simulate payment" : "Complete payment"}</span><ArrowRight size={18} /></button>
        </footer>
      </form>
    </div>
  );
}
