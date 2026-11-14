import React, { useEffect, useState } from "react";
import { ArrowLeft, LockKeyhole, MessageCircle, Save, ShieldCheck } from "lucide-react";
import { useBusinessState } from "./use-business-state.js";
import "./otp-access-settings.css";

const makeDefaults = () => ({
  trainingMode: { requireOtp: true, recipientPhone: "" },
  posItemAdd: { requireOtp: false, recipientPhone: "" },
  posItemDelete: { requireOtp: true, recipientPhone: "" },
  grnDelete: { requireOtp: false, recipientPhone: "" },
});

const controls = [
  { key: "trainingMode", title: "POS training mode", detail: "Verify before opening the isolated training POS.", defaultOtp: true },
  { key: "posItemDelete", title: "Remove item from POS bill", detail: "Verify when an item is removed from a live bill.", defaultOtp: true },
  { key: "grnDelete", title: "Delete a GRN", detail: "Verify before removing a receipt from the register.", defaultOtp: false },
];

function normalize(value = {}) {
  const defaults = makeDefaults();
  return Object.fromEntries(controls.map(({ key }) => [key, {
    ...defaults[key], ...(value?.[key] || {}),
    requireOtp: value?.[key]?.requireOtp ?? defaults[key].requireOtp,
    recipientPhone: String(value?.[key]?.recipientPhone || ""),
  }]));
}

export function OtpAccessSettings({ activeStore, canManage, notify, onBack }) {
  const storeId = String(activeStore?.id || "");
  const stateKey = `vestora-security-controls-${storeId}`;
  const [saved, setSaved] = useBusinessState(stateKey, makeDefaults);
  const [draft, setDraft] = useState(() => normalize(saved));

  useEffect(() => setDraft(normalize(saved)), [saved]);

  function update(key, field, value) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }

  function save() {
    if (!canManage) return notify("Administrator permission required to change OTP controls.");
    const missing = controls.find(({ key }) => draft[key].requireOtp && !draft[key].recipientPhone.trim());
    if (missing) return notify(`Enter the WhatsApp recipient number for ${missing.title}.`);
    const invalid = controls.find(({ key }) => draft[key].requireOtp && !/^\+?[0-9 ()-]{10,20}$/.test(draft[key].recipientPhone.trim()));
    if (invalid) return notify(`Enter a valid WhatsApp number for ${invalid.title}, including country code.`);
    setSaved(normalize(draft));
    notify("OTP and access controls saved for this branch.");
  }

  return <section className="screen settings-detail-screen otp-access-screen">
    <button className="settings-back-button" type="button" onClick={onBack}><ArrowLeft size={17} /> Back to settings</button>
    <div className="panel settings-detail-panel otp-access-panel">
      <header className="otp-access-heading"><span className="otp-access-icon"><ShieldCheck size={22} /></span><div><span>Security / authorization</span><h2>OTP &amp; access controls</h2><p>Choose which actions require a WhatsApp verification code and where each code is sent.</p></div></header>
      {!canManage && <p className="otp-access-readonly">Only a restaurant administrator can change these controls.</p>}
      <div className="otp-access-cards">
        {controls.map(({ key, title, detail, defaultOtp }) => <article className="otp-access-card" key={key}>
          <div className="otp-access-card-heading"><span className="otp-access-card-icon"><LockKeyhole size={17} /></span><div><h3>{title}</h3><p>{detail}</p></div></div>
          <label className="otp-access-toggle"><input type="checkbox" checked={Boolean(draft[key].requireOtp)} onChange={(event) => update(key, "requireOtp", event.target.checked)} disabled={!canManage} /><span>Require OTP</span><strong>{draft[key].requireOtp ? "On" : "Off"}</strong></label>
          <label className="otp-access-phone"><span>Send code to WhatsApp number</span><input type="tel" autoComplete="tel" value={draft[key].recipientPhone} onChange={(event) => update(key, "recipientPhone", event.target.value.slice(0, 30))} placeholder="+91 98765 43210" disabled={!canManage || !draft[key].requireOtp} /></label>
          <small className="otp-access-help">{draft[key].requireOtp ? "A code is sent to this approver before the action continues." : `OTP is not required. ${defaultOtp ? "Turn it on to protect this action." : "The action opens immediately."}`}</small>
        </article>)}
      </div>
      <div className="otp-access-provider-note"><MessageCircle size={17} /><span>WhatsApp delivery also needs Meta Cloud API credentials and an approved authentication template configured on the backend. Never put the Meta access token in the browser.</span></div>
      <footer className="otp-access-footer"><span>Settings apply to {activeStore?.name || "this business"} / {activeStore?.branch || "this branch"}.</span><button type="button" className="otp-access-save" onClick={save} disabled={!canManage}><Save size={16} /> Save access controls</button></footer>
    </div>
  </section>;
}
