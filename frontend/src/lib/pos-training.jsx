import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { FlaskConical, LockKeyhole, LogOut, MessageCircle, X } from "lucide-react";
import { businessStorage, cloudApiRequest } from "./cloud.js";
import { BusinessStateContext, useBusinessState } from "./use-business-state.js";
import { createTrainingSession, requestTrainingOtp, verifyTrainingOtp } from "./pos-training.js";
import "./pos-training.css";

const TrainingLauncher = createContext(null);

export function PosTrainingButton() {
  const launcher = useContext(TrainingLauncher);
  if (!launcher || launcher.active) return null;
  return <button className="pos-training-launch" type="button" onClick={launcher.open}><FlaskConical size={17} /> Test / Training</button>;
}

function TrainingOtpDialog({ cashiers, initialCashier, storeId, onClose, onVerified }) {
  const [email, setEmail] = useState(initialCashier?.email || cashiers[0]?.email || "");
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement;
    dialog.current.showModal();
    dialog.current.querySelector("select")?.focus();
    return () => { alive.current = false; previous?.focus?.(); };
  }, []);
  async function sendCode(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const cashier = cashiers.find((entry) => entry.email === email);
      const sent = await requestTrainingOtp(cashier, storeId, cloudApiRequest);
      if (alive.current) {
        if (sent.otpRequired === false) { setCode(""); onVerified({ ...cashier, ...(sent.cashier || {}) }); }
        else { setChallenge(sent); setCode(""); }
      }
    } catch (failure) {
      if (alive.current) setError(failure.message || "Could not send the WhatsApp code. Try again when connected.");
    } finally { if (alive.current) setBusy(false); }
  }
  async function verifyCode(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const cashier = cashiers.find((entry) => entry.email === email);
      const verified = await verifyTrainingOtp(cashier, storeId, challenge?.challengeId, code, cloudApiRequest);
      if (alive.current) { setCode(""); onVerified({ ...cashier, ...verified }); }
    } catch (failure) {
      if (alive.current) { setError(failure.message || "Could not verify the code."); setCode(""); }
    } finally { if (alive.current) setBusy(false); }
  }
  return <dialog ref={dialog} className="pos-training-gate" onCancel={(event) => { event.preventDefault(); onClose(); }} aria-labelledby="training-gate-title">
    <form onSubmit={challenge ? verifyCode : sendCode}>
      <header><span className="training-gate-icon"><FlaskConical size={25} /></span><button type="button" aria-label="Close training sign-in" onClick={onClose}><X size={20} /></button></header>
      <span className="training-eyebrow">SAFE PRACTICE SPACE</span><h2 id="training-gate-title">Enter Training Mode</h2>
      <p>Practice with a copy of your products and customer accounts. Nothing you do here changes live stock, sales, wallets, or reports.</p>
      <label>Cashier<select value={email} onChange={(event) => { setEmail(event.target.value); setChallenge(null); setCode(""); setError(""); }} disabled={busy} required>{!cashiers.length && <option value="">No active cashiers</option>}{cashiers.map((cashier) => <option key={cashier.id} value={cashier.email}>{cashier.name}</option>)}</select></label>
      {challenge ? <><p className="training-gate-delivery"><MessageCircle size={16} /> Code sent to WhatsApp {challenge.maskedPhone}. It expires in 5 minutes.</p>
        <label>WhatsApp code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" required disabled={busy} /></label>
        <button className="training-gate-resend" type="button" disabled={busy} onClick={sendCode}>Resend code (after 1 minute)</button></> : <p className="training-gate-delivery"><MessageCircle size={16} /> A one-time code will be sent to the number configured in Settings. If OTP is turned off, training opens directly.</p>}
      {error && <p className="training-gate-error" role="alert">{error}</p>}
      <small><LockKeyhole size={14} /> WhatsApp verification needs a connection. Practice records are discarded on exit or refresh.</small>
      <footer><button type="button" onClick={onClose}>Cancel</button><button className="training-gate-submit" type="submit" disabled={busy || !email || (challenge && code.length !== 6)}>{busy ? "Please wait…" : challenge ? "Verify & start training" : "Continue / send code"}</button></footer>
    </form>
  </dialog>;
}

function PracticePos({ session, mode, billTemplate, PosComponent, ShiftComponent, notify, onExit }) {
  const [cart, setCart] = useState([]);
  const [orderType, setOrderType] = useState("Dine-in");
  const [shift] = useBusinessState("training-current-shift", null);
  const [sales] = useBusinessState("vestora-sales-ledger", []);
  const [refunds] = useBusinessState("vestora-refund-ledger", []);
  const [foodStock] = useBusinessState(`vestora-food-stock-${session.store.id}`, []);
  const [tableOrders] = useBusinessState("vestora-table-orders", []);
  const practiceSales = sales.filter((bill) => bill.training);
  const practiceNotify = (message) => notify(`Training: ${message}`);
  if (!shift) return <ShiftComponent cashier={session.cashier} online={false} onOpenShift={(balance) => { session.actions.openShift(balance); practiceNotify("practice shift opened"); }} onExit={onExit} onLogout={onExit} training />;
  return <PosComponent key={shift.id} training mode={mode} cart={cart} setCart={setCart} items={session.items} storeId={session.store.id}
    foodStock={foodStock} onFoodStockChange={session.actions.foodStock} orderType={orderType} setOrderType={setOrderType} online={false}
    notify={practiceNotify} billTemplate={{ ...billTemplate, training: true, billTitle: "TRAINING — NOT A VALID RECEIPT", footer: "Practice transaction only · No payment collected", terms: "", showQrBox: false }} billingPrinter={{ enabled: false }}
    onSale={session.actions.sale} onVoidItem={session.actions.voidItem} onExit={onExit} onLogout={onExit} currentShift={shift}
    onCloseShift={(amount, details) => { session.actions.closeShift(amount, details); setCart([]); practiceNotify("practice shift closed; the live shift is unchanged"); }}
    shiftBills={practiceSales.filter((bill) => bill.shiftId === shift.id)} shiftRefunds={refunds.filter((refund) => refund.training && refund.shiftId === shift.id)}
    refundLedger={refunds} onRefund={(refund) => { session.actions.refund(refund); practiceNotify("refund simulated; no money was returned"); }}
    orderHistory={practiceSales} currentUser={session.cashier} pendingTableOrders={tableOrders.filter((order) => order.status === "Ready for billing")} onTableOrderPaid={session.actions.tablePaid} />;
}

export function PosTrainingWorkspace({ mode, store, cashier, cashiers, items, foodStock, pendingTableOrders, billTemplate, PosComponent, ShiftComponent, notify, children }) {
  const [prompt, setPrompt] = useState(false);
  const [session, setSession] = useState(null);
  const sessionRef = useRef(null);
  useEffect(() => () => sessionRef.current?.adapter.dispose(), []);
  // A refresh never resumes training silently. Each fresh session requires a new OTP.
  useEffect(() => {
    if (!session) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session]);
  function exit() {
    if (!window.confirm("Exit Training Mode? All practice bills, stock changes, wallets and shifts will be discarded. Your live POS will be restored.")) return;
    session.adapter.dispose();
    sessionRef.current = null;
    setSession(null);
    notify("Training ended. Practice data discarded; live POS restored.");
  }
  function start(verifiedCashier) {
    const next = createTrainingSession({ liveStorage: businessStorage, store, cashier: verifiedCashier, items, foodStock, pendingTableOrders });
    sessionRef.current = next;
    setSession(next);
    setPrompt(false);
  }
  return <TrainingLauncher.Provider value={{ active: Boolean(session), open: () => setPrompt(true) }}>
    {/* Keep the live draft mounted but inaccessible; training gets separate state and callbacks. */}
    <div className="pos-live-workspace" hidden={Boolean(session)} inert={Boolean(session)}>{children}</div>
    {session && <div className="pos-training-workspace">
      <div className="pos-training-banner" role="status"><FlaskConical size={18} /><strong>TRAINING MODE</strong><span>Practice only · No live changes · Discarded on exit</span><button type="button" onClick={exit}><LogOut size={15} /> Exit training</button></div>
      <BusinessStateContext.Provider value={session.adapter}><PracticePos session={session} mode={mode} billTemplate={billTemplate} PosComponent={PosComponent} ShiftComponent={ShiftComponent} notify={notify} onExit={exit} /></BusinessStateContext.Provider>
    </div>}
    {prompt && <TrainingOtpDialog cashiers={cashiers} initialCashier={cashier} storeId={store.id} onClose={() => setPrompt(false)} onVerified={start} />}
  </TrainingLauncher.Provider>;
}
