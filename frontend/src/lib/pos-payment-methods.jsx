import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Banknote, Check, CreditCard, QrCode, ReceiptText, SlidersHorizontal, UserRound, X } from "lucide-react";
import "./pos-split-payment.css";
import "./pos-payment-methods.css";

const methods = [
  { name: "Cash", icon: Banknote, hint: "Cash at counter" },
  { name: "UPI", icon: QrCode, hint: "UPI app or QR" },
  { name: "Card", icon: CreditCard, hint: "Debit / credit card" },
  { name: "Credit", icon: UserRound, hint: "Pay later" },
  { name: "Split", icon: SlidersHorizontal, hint: "Two or more methods" },
];
const money = (amount) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(amount) || 0);
const signedMoney = (amount) => `${Number(amount) >= 0 ? "+" : "−"}${money(Math.abs(Number(amount) || 0))}`;

export function PaymentMethodDialog({ training = false, terminal = false, cloudUpi = false, total, exactTotal = total, roundOffEnabled = false, roundOffAdjustment = 0, itemCount, orderNumber, initialMethod = "", customer = null, error, couponInput = "", appliedCouponCode = "", couponMessage = "", couponSavings = 0, couponName = "", onCouponInputChange, onApplyCoupon, onRemoveCoupon, onRoundOffChange, onClose, onConfirm }) {
  const [selected, setSelected] = useState(initialMethod);
  const [keepChangeInWallet, setKeepChangeInWallet] = useState(false);
  const [cashReceived, setCashReceived] = useState(() => String(Math.ceil(Number(exactTotal || total || 0))));
  const titleId = useId();
  const descriptionId = useId();
  const radioName = useId();
  const formRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    (formRef.current?.querySelector("input:checked") || formRef.current?.querySelector("input"))?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  function handleKeys(event) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = [...formRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')]
      .filter((control) => control.type !== "radio" || control.checked);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  function selectMethod(method) {
    setSelected(method);
    setKeepChangeInWallet(false);
    if (method === "Cash") {
      onRoundOffChange?.(true);
    } else if (roundOffEnabled) {
      onRoundOffChange?.(false);
    }
  }

  const cashReceivedAmount = Number(cashReceived);
  const validWalletChange = Number.isFinite(cashReceivedAmount) && cashReceivedAmount + 0.005 >= Number(total || 0);
  const walletChange = validWalletChange ? Math.max(0, Math.round((cashReceivedAmount - Number(total || 0) + Number.EPSILON) * 100) / 100) : 0;

  return (
    <div className="shift-modal-backdrop pos-split-backdrop" role="presentation">
      <form ref={formRef} className="pos-split-dialog pos-payment-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleKeys} onSubmit={(event) => { event.preventDefault(); if (selected) onConfirm(selected, { cashReceived: selected === "Cash" && keepChangeInWallet ? cashReceivedAmount : undefined, changeToWallet: selected === "Cash" && keepChangeInWallet }); }}>
        <header className="pos-split-head">
          <span className="pos-split-head-icon"><CreditCard size={22} strokeWidth={1.7} /></span>
          <div><span className="pos-split-eyebrow">CHECKOUT</span><h2 id={titleId}>Choose payment</h2></div>
          <button className="pos-split-close" type="button" aria-label="Close payment selection" onClick={onClose}><X size={19} /></button>
        </header>
        <p className="pos-split-intro" id={descriptionId}>{training ? "TRAINING ONLY — payments are simulated. Do not collect money." : "Select how the customer will pay for this bill."}</p>
        <div className="pos-split-total">
          <div><span>Amount to collect</span><small><ReceiptText size={13} /> {orderNumber} · {itemCount} {itemCount === 1 ? "item" : "items"}</small></div>
          <strong>{money(total)}</strong>
        </div>
        <div className={`pos-roundoff-control${roundOffEnabled ? " is-enabled" : ""}`}>
          <div className="pos-roundoff-copy">
            <strong>Round off bill</strong>
            <small>{roundOffEnabled
              ? Math.abs(roundOffAdjustment) >= 0.005
                ? `${signedMoney(roundOffAdjustment)} adjustment from ${money(exactTotal)}`
                : "Bill is already at a whole rupee"
              : `Keep exact amount ${money(exactTotal)}`}</small>
          </div>
          <label className="pos-roundoff-switch">
            <input type="checkbox" role="switch" aria-label="Enable bill round off" checked={roundOffEnabled} disabled={keepChangeInWallet} onChange={(event) => onRoundOffChange?.(event.target.checked)} />
            <span aria-hidden="true"><i /></span>
            <em>{roundOffEnabled ? "Enabled" : "Disabled"}</em>
          </label>
        </div>
        <div className={`pos-payment-coupon${appliedCouponCode ? " is-applied" : ""}`} role="group" aria-label="Coupon code">
          {appliedCouponCode ? <>
            <span className="pos-payment-coupon-icon"><ReceiptText size={16} /></span>
            <span className="pos-payment-coupon-copy"><strong>{appliedCouponCode}</strong><small>{couponName ? `${couponName} · ` : ""}{money(couponSavings)} saved</small></span>
            <button type="button" className="pos-payment-coupon-remove" onClick={onRemoveCoupon}>Remove</button>
          </> : <>
            <label className="pos-payment-coupon-input"><ReceiptText size={16} /><input aria-label="Coupon code" placeholder="Enter coupon code" value={couponInput} onChange={(event) => onCouponInputChange?.(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onApplyCoupon?.(); } }} /></label>
            <button type="button" className="pos-payment-coupon-apply" onClick={onApplyCoupon} disabled={!couponInput.trim()}>Apply</button>
          </>}
        </div>
        {couponMessage && <p className="pos-payment-coupon-message" role="status">{couponMessage}</p>}
        {selected === "Cash" && <div className={`pos-change-wallet${keepChangeInWallet ? " is-enabled" : ""}`}>
          <label className="pos-change-wallet-toggle"><input type="checkbox" checked={keepChangeInWallet} disabled={!customer?.key} onChange={(event) => {
            const enabled = event.target.checked;
            setKeepChangeInWallet(enabled);
            onRoundOffChange?.(enabled ? false : true);
          }} /><span><strong>Keep change in customer wallet</strong><small>{customer?.key ? "Credit extra cash to their wallet balance" : "Select a saved customer to use this"}</small></span></label>
          {keepChangeInWallet && <div className="pos-change-wallet-entry"><label>Cash received<input type="number" min={total} step="0.01" value={cashReceived} onChange={(event) => setCashReceived(event.target.value)} autoFocus /></label><strong>{walletChange > 0 ? `${money(walletChange)} to wallet` : validWalletChange ? "No change to add" : "Enter the cash received"}</strong></div>}
        </div>}
        <fieldset className="pos-payment-options">
          <legend>Payment method</legend>
          <div className="pos-payment-option-grid">
            {methods.map(({ name, icon: Icon, hint }) => (
              <label className={`pos-payment-option${selected === name ? " is-selected" : ""}`} key={name}>
                <input type="radio" name={radioName} value={name} checked={selected === name} onChange={() => selectMethod(name)} />
                <span className="pos-payment-option-icon"><Icon size={21} strokeWidth={1.7} /></span>
                <span className="pos-payment-option-copy"><strong>{name}</strong><small>{(terminal && ["Card", "UPI"].includes(name) || cloudUpi && name === "UPI") ? "Pay on Pine Labs terminal" : hint}</small></span>
                <span className="pos-payment-option-check" aria-hidden="true">{selected === name && <Check size={11} strokeWidth={3} />}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && selected === initialMethod && <p className="pos-payment-error" role="alert">{error}</p>}
        <p className="pos-payment-help" role="status">{selected === "Split" ? "Next, enter the amount for each payment method." : selected === "Credit" ? "Customer name and mobile are required for a credit sale." : keepChangeInWallet && selected === "Cash" ? "The bill stays at its exact amount; only the extra cash goes into the customer's wallet." : (terminal && ["Card", "UPI"].includes(selected) || cloudUpi && selected === "UPI") ? "The terminal will open with this amount. The bill completes after payment confirmation." : selected ? `${selected} selected. Confirm payment to finish the sale.` : "Choose a payment method to continue."}</p>
        <footer className="pos-split-footer">
          <button className="pos-split-cancel" type="button" onClick={onClose}>Back to bill</button>
          <button className="pos-split-submit" type="submit" disabled={!selected || (keepChangeInWallet && selected === "Cash" && !validWalletChange)}><span>{selected === "Split" ? "Continue to split" : training ? "Simulate payment" : (terminal && ["Card", "UPI"].includes(selected) || cloudUpi && selected === "UPI") ? "Pay on Pine Labs" : "Confirm payment"}</span><ArrowRight size={18} /></button>
        </footer>
      </form>
    </div>
  );
}
