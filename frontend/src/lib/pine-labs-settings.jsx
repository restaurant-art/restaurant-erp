import React, { useEffect, useState } from "react";
import { CreditCard, RefreshCw, ArrowLeft } from "lucide-react";
import { hasPineLabsBridge, pineLabsRequest } from "./pine-labs.js";
import { pineCloudConnection, pineCloudEnabled, pineCloudPreferenceKey } from "./pine-cloud.js";
import "./pine-labs.css";

export function PineLabsSettings({ onBack, canManage, storeId, billingPrinter, onOpenPrinter }) {
  const native = hasPineLabsBridge();
  const [enabled, setEnabled] = useState(() => pineCloudEnabled(localStorage, storeId));
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setError("");
    setBusy(true);
    try { setInfo(native ? await pineLabsRequest("info", {}, { timeout: 10000 }) : await pineCloudConnection(storeId)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => { refresh(); }, [storeId]);
  if (!native) return <section className="screen settings-detail-screen pine-settings">
    <button className="settings-back-button" onClick={onBack}><ArrowLeft size={17} /> Back to settings</button>
    <div className="panel settings-detail-panel">
      <span className="pine-eyebrow">WINDOWS BILLING · PINE LABS CLOUD</span>
      <h2><CreditCard size={24} /> UPI QR & automatic bills</h2>
      <p>Create the bill on this computer. The customer pays using the QR on your A910S, then the customer bill prints on your USB printer.</p>
      <label className="kot-toggle"><input type="checkbox" checked={enabled} disabled={!canManage} onChange={event => { const value = event.target.checked; localStorage.setItem(pineCloudPreferenceKey(storeId), String(value)); setEnabled(value); }} /> Send UPI payments to Pine Labs from this counter</label>
      <div className="pine-status" role="status"><strong>{!info ? "Checking server setup…" : info.ready ? `Cloud configuration ready · ${info.environment === "production" ? "LIVE" : "UAT / test"}` : "Pine Labs credentials needed"}</strong><p>{info?.message || "Checking this branch's server configuration."}</p></div>
      {info?.pending && <p className="pine-warning">A payment is unfinished. Recover its saved checkout before starting another QR payment on this terminal.</p>}
      <div className="pine-status"><strong>Bill printer: {billingPrinter?.name || "Not selected"}</strong><p>{billingPrinter?.autoPrintUpi ? "Automatic printing is selected for confirmed Pine Labs UPI bills." : "Enable automatic UPI bill printing in Billing printer connection."} {billingPrinter?.enabled ? "Printer route enabled; a test print is still needed to verify paper output." : "Connect the printer and finish QZ secure printing setup."}</p></div>
      <div className="pine-actions"><button disabled={busy} onClick={refresh}><RefreshCw size={16} /> Check setup</button><button onClick={onOpenPrinter}>Set up bill printer</button></div>
      {error && <p role="alert" className="pine-warning">{error}</p>}
      <ol className="pine-steps"><li>Configure Pine Labs cloud access for this branch on the server. Keep the security token out of the browser.</li><li>Keep the A910S online and activated for Cloud-based Integration.</li><li>Select UPI at checkout. The exact amount is sent to the A910S for payment.</li><li>After payment confirmation and bill saving, UVPRO sends the bill to the selected printer.</li></ol>
      <p className="pine-note">Check setup does not take a payment or prove terminal connectivity. Pending payments stay recoverable. A printer failure never collects money again. Card payments keep their existing workflow. Complete UAT testing before live use.</p>
    </div>
  </section>;
  return <section className="screen settings-detail-screen pine-settings">
    <button className="settings-back-button" onClick={onBack}><ArrowLeft size={17} /> Back to settings</button>
    <div className="panel settings-detail-panel">
      <span className="pine-eyebrow">ANDROID TERMINAL · PINE LABS</span>
      <h2><CreditCard size={24} /> Pine Labs A910S</h2>
      <p>Send the bill amount to the terminal. Complete the sale after the payment result returns to UVPRO.</p>
      <div className="pine-status" role="status"><strong>{!info ? "Checking terminal…" : info.ready ? "Terminal connection available" : info.available === false ? "Android terminal app required" : "Terminal setup incomplete"}</strong>
        <p>{info?.available === false ? "This browser can record external payments manually. Direct Pine Labs payments require the UVPRO Android app on your A910S." : info?.message || "Checking the installed payment app and Application ID."}</p>
      </div>
      {info?.model && <p>Device: <strong>{info.model}</strong> · Plutus app: <strong>{info.installed ? "Installed" : "Not found"}</strong></p>}
      {info?.pending && <p className="pine-warning">A payment needs reconciliation. Recover its saved POS checkout before starting another terminal payment.</p>}
      <div className="pine-actions"><button disabled={busy} onClick={refresh}><RefreshCw size={16} /> Check connection</button>
        {hasPineLabsBridge() && canManage && <button disabled={busy} onClick={async () => { try { await pineLabsRequest("configure"); await refresh(); } catch (e) { setError(e.message); } }}>Enter Pine Labs Application ID</button>}
      </div>
      {error && <p role="alert" className="pine-warning">{error}</p>}
      <ol className="pine-steps"><li>Install the UVPRO Android app using Pine Labs’ approved installation process.</li><li>Enter the Application ID issued by Pine Labs and ensure Plutus is activated for billing integration.</li><li>In POS, choose Card or UPI. The payment app opens with the exact amount.</li><li>UVPRO checks the response against the saved bill. Pending or interrupted results stay recoverable.</li></ol>
      <p className="pine-note">Check connection does not take a payment. Training Mode never opens the terminal. Refunds and settlement must be handled in Pine Labs; recording a UVPRO refund does not send money back automatically.</p>
    </div>
  </section>;
}
