import React, { useEffect, useId, useRef, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Gift, LockKeyhole, QrCode, Ticket, X } from "lucide-react";
import { SHIFT_CASH_DENOMINATIONS, calculateCashDenominations, validateShiftClosingEntry } from "./shift-closing.js";
import "./pos-shift-closing.css";

const money = (value) => Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

// Intentionally receives no sales, expected totals or variance values. Cashiers
// submit their own count; reconciliation is recorded outside this dialog.
export function PosShiftClosing({ onConfirm, onClose }) {
  const [cashMode, setCashMode] = useState("denominations");
  const [denominations, setDenominations] = useState({});
  const [cashTotal, setCashTotal] = useState("");
  const [upiTotal, setUpiTotal] = useState("");
  const [cardTotal, setCardTotal] = useState("");
  const [mealPassTotal, setMealPassTotal] = useState("0");
  const [couponTotal, setCouponTotal] = useState("0");
  const [sodexoTotal, setSodexoTotal] = useState("0");
  const [giftVoucherTotal, setGiftVoucherTotal] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submissionRef = useRef(false);
  const formRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();
  const countedCash = calculateCashDenominations(denominations);

  useEffect(() => {
    const previousFocus = document.activeElement;
    formRef.current?.querySelector("input")?.focus();
    return () => previousFocus?.focus?.();
  }, []);

  function handleKeys(event) {
    if (event.key === "Escape" && !submissionRef.current) { event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab") return;
    const controls = [...formRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), textarea:not(:disabled)")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  async function submit(event) {
    event.preventDefault();
    if (submissionRef.current) return;
    const result = validateShiftClosingEntry({ cashMode, cashTotal, denominations, upiTotal, cardTotal, mealPassTotal, couponTotal, sodexoTotal, giftVoucherTotal });
    if (!result.valid) { setError(result.error); return; }
    setError("");
    submissionRef.current = true;
    setSubmitting(true);
    try {
      const saved = await onConfirm({ ...result, note: note.trim() });
      if (saved === false) {
        submissionRef.current = false;
        setSubmitting(false);
        setError("The shift was not closed. Please try again.");
      }
    } catch {
      submissionRef.current = false;
      setSubmitting(false);
      setError("Could not save the closing count. Your entries are still here; please try again.");
    }
  }

  return <div className="shift-modal-backdrop pos-blind-close-backdrop" role="presentation">
    <form ref={formRef} className="pos-blind-close" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={handleKeys} onSubmit={submit} noValidate>
      <header className="pos-blind-close-head">
        <span className="pos-blind-close-icon"><LockKeyhole size={23} /></span>
        <div><small>END OF SHIFT</small><h2 id={titleId}>Enter your closing count</h2></div>
        <button type="button" className="pos-blind-close-dismiss" onClick={onClose} disabled={submitting} aria-label="Close shift closing form"><X size={19} /></button>
      </header>
      <p className="pos-blind-close-intro" id={descriptionId}>Count the cash in your drawer and enter totals from your payment records. Leave UPI or card blank when none was collected; it will be saved as ₹0.</p>
      <fieldset className="pos-blind-close-fields" disabled={submitting}>
        <section className="pos-close-cash-section" aria-label="Cash count">
          <div className="pos-close-section-heading"><h3><Banknote size={18} />Cash in drawer</h3><div className="pos-cash-mode" role="group" aria-label="Cash entry method">
            <button type="button" aria-pressed={cashMode === "denominations"} onClick={() => { setCashMode("denominations"); setError(""); }}>By denomination</button>
            <button type="button" aria-pressed={cashMode === "total"} onClick={() => { setCashMode("total"); setError(""); }}>Total cash</button>
          </div></div>
          {cashMode === "denominations" ? <>
            <p className="pos-cash-count-hint">Enter the number of coins or notes. Blank denominations count as zero.</p>
            <div className="pos-cash-denominations">
              {SHIFT_CASH_DENOMINATIONS.map((denomination) => <label key={denomination}><span>₹{denomination}</span><span className="pos-cash-count-input"><span aria-hidden="true">×</span><input type="number" inputMode="numeric" min="0" step="1" placeholder="0" aria-label={`Number of ₹${denomination} coins or notes`} value={denominations[denomination] ?? ""} onChange={(event) => setDenominations((current) => ({ ...current, [denomination]: event.target.value }))} /></span></label>)}
            </div>
            <div className="pos-cash-count-total"><span>Your counted cash</span><strong aria-live="polite">{countedCash.valid ? money(countedCash.total) : Object.values(denominations).some((value) => value !== "") ? "Check counts" : "—"}</strong></div>
          </> : <label className="pos-close-money-label">Total cash amount<span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={cashTotal} onChange={(event) => setCashTotal(event.target.value)} aria-label="Total cash amount" /></span></label>}
        </section>
        <div className="pos-close-digital-totals">
          <label className="pos-close-money-label"><span className="pos-close-label"><QrCode size={17} />UPI total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={upiTotal} onChange={(event) => setUpiTotal(event.target.value)} aria-label="UPI total" /></span></label>
          <label className="pos-close-money-label"><span className="pos-close-label"><CreditCard size={17} />Card total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={cardTotal} onChange={(event) => setCardTotal(event.target.value)} aria-label="Card total" /></span></label>
        </div>
        <section className="pos-close-other-tenders" aria-label="Other payment totals">
          <div className="pos-close-other-heading"><Ticket size={17} /><div><strong>Other payment totals</strong><small>Enter the value collected for each type.</small></div></div>
          <div className="pos-close-digital-totals">
            <label className="pos-close-money-label"><span className="pos-close-label">Meal Pass total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" value={mealPassTotal} onChange={(event) => setMealPassTotal(event.target.value)} aria-label="Meal Pass total" /></span></label>
            <label className="pos-close-money-label"><span className="pos-close-label">Coupon total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" value={couponTotal} onChange={(event) => setCouponTotal(event.target.value)} aria-label="Coupon total" /></span></label>
            <label className="pos-close-money-label"><span className="pos-close-label">Sodexo total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" value={sodexoTotal} onChange={(event) => setSodexoTotal(event.target.value)} aria-label="Sodexo total" /></span></label>
            <label className="pos-close-money-label"><span className="pos-close-label"><Gift size={16} />Gift voucher total</span><span><span aria-hidden="true">₹</span><input type="number" inputMode="decimal" min="0" step="0.01" value={giftVoucherTotal} onChange={(event) => setGiftVoucherTotal(event.target.value)} aria-label="Gift voucher total" /></span></label>
          </div>
        </section>
        <label className="pos-close-note">Closing note <small>(optional)</small><input type="text" maxLength={500} placeholder="Handover details or other notes" value={note} onChange={(event) => setNote(event.target.value)} /></label>
      </fieldset>
      {error && <p className="pos-close-entry-error" id={errorId} role="alert">{error}</p>}
      <footer className="pos-blind-close-footer"><small><LockKeyhole size={14} />Your count is saved for back-office review.</small><div><button type="button" onClick={onClose} disabled={submitting}>Cancel</button><button type="submit" disabled={submitting}><CheckCircle2 size={17} />{submitting ? "Saving…" : "Submit & close shift"}</button></div></footer>
    </form>
  </div>;
}
