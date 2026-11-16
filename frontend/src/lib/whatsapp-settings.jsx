import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { cloudRequestJson } from "./cloud";
import { billingMobile, launchMetaSignup, loadMetaSdk, validBillingMobile } from "./whatsapp-billing";
import "./whatsapp-settings.css";

export const META_WHATSAPP_SETTINGS = "Meta WhatsApp Integration";

const statusLabel = {
  disconnected: "Disconnected", connected: "Connected", pending: "Action required", reconnect: "Reconnect required",
  queued: "Queued", sending: "Sending", accepted: "Accepted by Meta", sent: "Sent", delivered: "Delivered",
  read: "Read", failed: "Failed", uncertain: "Awaiting confirmation", cancelled: "Cancelled",
};
const actionsRequired = {
  register_number: "Register this number with Meta using its six-digit two-step PIN.",
  display_name_review: "Meta is reviewing this number’s display name. Refresh its status after approval.",
  cloud_api_required: "Choose a number registered with WhatsApp Cloud API in Meta.",
  reauthorize: "Reconnect the store’s Meta account to renew its authorization.",
};

async function request(storeId, action = "", method = "GET", body) {
  const response = await cloudRequestJson(`/api/cloud/whatsapp/${encodeURIComponent(storeId)}/${action}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result?.error || result?.detail || (Array.isArray(result) && result[0]) || `WhatsApp request failed (${response.status}).`;
    throw new Error(message + (result?.code ? ` (${result.code})` : ""));
  }
  return result;
}

function templateKey(template) {
  return template ? `${template.name}:${template.language}` : "";
}

export function WhatsAppSettings({ store, onBack }) {
  const storeId = store.id;
  const [settings, setSettings] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [chosen, setChosen] = useState("");
  const [autoSend, setAutoSend] = useState(false);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);
  const [testNumber, setTestNumber] = useState("");
  const [testOptIn, setTestOptIn] = useState(false);
  const [pin, setPin] = useState("");
  const [sdk, setSdk] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const session = useRef(null);

  function applySettings(data) {
    setSettings(data);
    setChosen(templateKey(data.template));
    setAutoSend(data.autoSend);
  }

  useEffect(() => {
    let active = true;
    request(storeId).then((data) => {
      if (active) applySettings(data);
    }).catch((failure) => {
      if (active) setError(failure.message);
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => { active = false; session.current?.abort(); };
  }, [storeId]);

  const appId = settings?.signup?.appId;
  const graphVersion = settings?.signup?.graphVersion;
  useEffect(() => {
    if (!appId || !graphVersion) return undefined;
    let active = true;
    loadMetaSdk({ appId, graphVersion }).then((api) => {
      if (active) setSdk(api);
    }).catch((failure) => {
      if (active) setError(failure.message);
    });
    return () => { active = false; };
  }, [appId, graphVersion]);

  async function run(action, success = "") {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      await action();
      setFeedback(success);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  function connect() {
    run(async () => {
      session.current = new AbortController();
      // Launch synchronously within the click, so the browser permits Meta's popup.
      const [authorization, { sessionId }] = await Promise.all([
        launchMetaSignup(sdk, settings.signup.configId, session.current.signal),
        request(storeId, "signup/", "POST", {}),
      ]).catch((failure) => {
        session.current.abort();
        throw failure;
      });
      if (session.current.signal.aborted) return;
      applySettings(await request(storeId, "signup/complete/", "POST", { sessionId, ...authorization }));
      setTemplates([]);
    });
  }

  async function loadHistory(nextPage = page) {
    setHistory(await request(storeId, `history/?page=${nextPage}`));
    setPage(nextPage);
  }

  const connected = settings?.status === "connected";
  const templateChoices = settings?.template && !templates.some((template) => templateKey(template) === templateKey(settings.template))
    ? [settings.template, ...templates] : templates;
  const selected = templateChoices.find((template) => templateKey(template) === chosen);
  return (
    <section className="screen settings-detail-screen whatsapp-settings" aria-busy={busy}>
      <button type="button" className="settings-back-button" onClick={onBack}><ChevronLeft size={17} /> Back to settings</button>
      <header className="panel wa-connection">
        <div className="wa-heading">
          <span className="settings-card-icon"><MessageCircle size={22} /></span>
          <div><h2>{META_WHATSAPP_SETTINGS}</h2><p>{store.name}{store.branch ? ` / ${store.branch}` : ""}</p></div>
          {settings && <span className="wa-status" data-state={settings.status}>{statusLabel[settings.status]}</span>}
        </div>
        {error && <p role="alert" className="wa-error">{error}</p>}
        {feedback && <p role="status">{feedback}</p>}
        {!settings && !busy && <button type="button" className="secondary" onClick={() => run(async () => applySettings(await request(storeId)))}>Retry</button>}
        {settings && <>
          <dl className="wa-identity">
            <div><dt>Connected business</dt><dd>{settings.businessName || "—"}</dd></div>
            <div><dt>Registered WhatsApp number</dt><dd>{settings.registeredNumber || "—"}</dd></div>
            <div><dt>Approved display name</dt><dd>{settings.displayName || "—"}</dd></div>
          </dl>
          {settings.actionRequired && <p className="wa-note">{actionsRequired[settings.actionRequired]}</p>}
          {!settings.signup && <p className="wa-note">The platform administrator needs to configure Meta Embedded Signup.</p>}
          <div className="wa-actions">
            <button type="button" className="primary" disabled={busy || !settings.signup || !sdk} onClick={connect}>
              <ExternalLink size={16} /> {settings.status === "disconnected" ? "Connect Meta Account" : "Reconnect Meta Account"}
            </button>
            {settings.status !== "disconnected" && <>
              <button type="button" className="secondary" disabled={busy} onClick={() => run(async () => applySettings(await request(storeId, "verify/", "POST", {})))}><RefreshCw size={16} /> Refresh connection</button>
              <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmDisconnect(true)}>Disconnect</button>
            </>}
          </div>
          {confirmDisconnect && <div className="wa-inline" role="group" aria-label="Confirm disconnect">
            <p>Disconnect this store and cancel its queued messages?</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => setConfirmDisconnect(false)}>Keep connected</button>
            <button type="button" className="primary" disabled={busy} onClick={() => run(async () => {
              applySettings(await request(storeId, "disconnect/", "POST", {}));
              setConfirmDisconnect(false);
              setTemplates([]);
              if (history) await loadHistory(1);
            }, "Store disconnected.")}>Confirm disconnect</button>
          </div>}
          {settings.actionRequired === "register_number" && <form className="wa-inline" onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              try { applySettings(await request(storeId, "verify/", "POST", { pin })); }
              finally { setPin(""); }
            });
          }}>
            <label>Registration PIN<input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/[^0-9]/g, ""))} /></label>
            <button type="submit" className="primary" disabled={busy || pin.length !== 6}>Register number</button>
          </form>}
        </>}
      </header>

      {connected && <div className="wa-settings-grid">
        <form className="panel wa-section" onSubmit={(event) => {
          event.preventDefault();
          run(async () => applySettings(await request(storeId, "", "PATCH", {
            autoSend,
            ...(selected && (autoSend || chosen !== templateKey(settings.template))
              ? { templateName: selected.name, templateLanguage: selected.language } : {}),
          })), "Billing settings saved.");
        }}>
          <div className="wa-section-heading"><h3>Message template settings</h3><button type="button" className="secondary" disabled={busy} onClick={() => run(async () => setTemplates(await request(storeId, "templates/")))}>Load approved templates</button></div>
          <label>Utility receipt template<select value={chosen} onChange={(event) => setChosen(event.target.value)}>
            <option value="" disabled>Choose a template</option>
            {templateChoices.map((template) => <option key={templateKey(template)} value={templateKey(template)}>{template.name} · {template.language}</option>)}
          </select></label>
          {selected?.body && <p className="wa-template-preview">{selected.body}</p>}
          <label className="wa-check"><input type="checkbox" checked={autoSend} disabled={!selected} onChange={(event) => setAutoSend(event.target.checked)} /> Enable automatic WhatsApp billing</label>
          <button type="submit" className="primary" disabled={busy || (autoSend && !selected)}>Save billing settings</button>
        </form>
        <form className="panel wa-section" onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await request(storeId, "test/", "POST", { recipient: testNumber, optIn: testOptIn });
            setTestOptIn(false);
            await loadHistory(1);
          }, "Test message queued. Check Message history for delivery.");
        }}>
          <h3>Send test message</h3>
          <label>Recipient’s WhatsApp number<input type="tel" autoComplete="off" value={testNumber} placeholder="Include country code for international numbers" onChange={(event) => {
            setTestNumber(billingMobile(event.target.value));
            setTestOptIn(false);
          }} /></label>
          <label className="wa-check"><input type="checkbox" checked={testOptIn} onChange={(event) => setTestOptIn(event.target.checked)} /> Recipient agreed to this test</label>
          <button type="submit" className="primary" disabled={busy || !settings.template || !validBillingMobile(testNumber) || !testOptIn}>Queue test message</button>
        </form>
      </div>}

      {settings && <section className="panel wa-section">
        <div className="wa-section-heading"><h3>Message history</h3><button type="button" className="secondary" disabled={busy} onClick={() => run(() => loadHistory())}><RefreshCw size={16} /> {history ? "Refresh history" : "Load history"}</button></div>
        {history && <>
          <div className="wa-table"><table>
            <thead><tr><th scope="col">Receipt</th><th scope="col">Recipient</th><th scope="col">Queued</th><th scope="col">Status</th><th scope="col">Meta message ID</th><th scope="col">Action</th></tr></thead>
            <tbody>{history.messages.map((message) => <tr key={message.id}>
              <td>{message.invoice}</td><td>{message.recipient}</td><td>{new Date(message.createdAt).toLocaleString()}</td>
              <td>{statusLabel[message.status]}{message.errorCode && <small>{message.errorCode}</small>}</td>
              <td className="wa-message-id" title={message.metaMessageId || ""}>{message.metaMessageId || "—"}</td>
              <td>{message.status === "failed" && <button type="button" className="secondary" disabled={busy || !connected} onClick={() => run(async () => {
                await request(storeId, `history/${message.id}/resend/`, "POST", {});
                await loadHistory();
              }, "Receipt queued for resend.")}>Resend</button>}</td>
            </tr>)}{history.messages.length === 0 && <tr><td colSpan={6}>No store WhatsApp messages yet.</td></tr>}</tbody>
          </table></div>
          {(page > 1 || history.hasNext) && <div className="wa-actions">
            <button type="button" className="secondary" disabled={busy || page === 1} onClick={() => run(() => loadHistory(page - 1))}>Previous</button>
            <span>Page {page}</span>
            <button type="button" className="secondary" disabled={busy || !history.hasNext} onClick={() => run(() => loadHistory(page + 1))}>Next</button>
          </div>}
          {history.legacyMessages.length > 0 && <details className="wa-legacy">
            <summary>Earlier WhatsApp receipts</summary>
            <div className="wa-table"><table><thead><tr><th scope="col">Bill</th><th scope="col">Status</th><th scope="col">Meta message ID</th></tr></thead>
              <tbody>{history.legacyMessages.map((message) => <tr key={message.invoice}><td>{message.invoice}</td><td>{statusLabel[message.status] || message.status}</td><td className="wa-message-id" title={message.metaMessageId}>{message.metaMessageId || "—"}</td></tr>)}</tbody>
            </table></div>
          </details>}
        </>}
      </section>}
    </section>
  );
}
