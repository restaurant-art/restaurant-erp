import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { ClipboardCheck, FileText, ImagePlus, Pencil, Printer, Search, Settings2, Plus, Trash2, X } from "lucide-react";
import { createGrnRecord, deleteGrnRecord, updateGrnRecord } from "./grn.js";
import { GrnSupplierPicker } from "./grn-supplier-picker.jsx";
import { cloudApiRequest, setGrnOtpApproval } from "./cloud.js";
import "./grn-workspace.css";

const localDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
const localTime = (date = new Date()) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
const blankDraft = () => ({ date: localDate(), time: localTime(), supplierName: "", supplierPhone: "", supplierAddress: "", supplierGstin: "", invoiceNo: "", invoiceDate: "", billAmount: "", items: [], vehicleNo: "", remarks: "", paidDate: "", receiverName: "" });

const money = (value) => `₹${Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const readableDate = (value) => {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};

export function GrnWorkspace({ storeId, records = [], setRecords, template = {}, setTemplate, vendors = [], canSave = false, notify = () => {} }) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState(blankDraft);
  const [templateDraft, setTemplateDraft] = useState(template);
  const [printingId, setPrintingId] = useState("");
  const [otpDialog, setOtpDialog] = useState(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpBusy, setOtpBusy] = useState(false);
  const otpContinuation = useRef(null);
  const logoInput = useRef(null);
  const supplierInputId = useId();
  const activeRecords = useMemo(() => records.filter((record) => !record.deletedAt), [records]);
  const printingRecord = activeRecords.find((record) => record.id === printingId);
  const visibleRecords = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return [...activeRecords]
      .filter((record) => !needle || [record.grnNo, record.supplierName, record.invoiceNo, record.vehicleNo].some((value) => String(value || "").toLocaleLowerCase().includes(needle)))
      .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));
  }, [activeRecords, query]);
  const totalReceived = activeRecords.reduce((sum, record) => sum + Number(record.billAmount || 0), 0);

  useEffect(() => {
    const finishPrint = () => {
      document.body.classList.remove("printing-grn");
      setPrintingId("");
    };
    window.addEventListener("afterprint", finishPrint);
    return () => {
      window.removeEventListener("afterprint", finishPrint);
      document.body.classList.remove("printing-grn");
    };
  }, []);

  useEffect(() => setTemplateDraft(template), [template]);

  const updateDraft = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const updateTemplate = (field, value) => setTemplateDraft((current) => ({ ...current, [field]: value }));

  function updateSupplierName(name) {
    setDraft((current) => {
      const previousVendor = vendors.find((vendor) => String(vendor.name || "").trim().toLowerCase() === current.supplierName.trim().toLowerCase());
      const changedSavedVendor = previousVendor && name.trim().toLowerCase() !== current.supplierName.trim().toLowerCase();
      return { ...current, supplierName: name, ...(changedSavedVendor ? { supplierPhone: "", supplierAddress: "", supplierGstin: "" } : {}) };
    });
  }

  function selectSupplier(vendor) {
    setDraft((current) => ({ ...current, supplierName: vendor.name || "", supplierPhone: vendor.phone || "", supplierAddress: vendor.address || "", supplierGstin: vendor.gstin || "" }));
  }

  function saveTemplate() {
    if (!canSave) return;
    setTemplate(templateDraft);
    setSettingsOpen(false);
    notify("GRN print details saved for this branch.");
  }

  function closeForm() {
    setFormOpen(false);
    setEditingId("");
    setDraft(blankDraft());
  }

  function openEdit(record) {
    setEditingId(record.id);
    setDraft({ ...blankDraft(), ...record, billAmount: String(record.billAmount ?? ""), items: (record.items || []).map((line) => ({ ...line })) });
    setFormOpen(true);
  }

  async function requireActionOtp(action, continuation) {
    if (!canSave) return;
    otpContinuation.current = continuation;
    setOtpCode("");
    try {
      const result = await cloudApiRequest("action-otp/request", { method: "POST", body: JSON.stringify({ storeId: String(storeId), action }) });
      if (result.otpRequired === false) {
        otpContinuation.current = null;
        continuation();
        return;
      }
      setOtpDialog({ action, challengeId: result.challengeId, maskedPhone: result.maskedPhone, error: "" });
    } catch (error) {
      otpContinuation.current = null;
      notify(error.message || "Could not request the WhatsApp approval code.", 9000);
    }
  }

  async function verifyActionOtp(event) {
    event.preventDefault();
    if (!otpDialog || otpBusy || otpCode.length !== 6) return;
    setOtpBusy(true);
    try {
      const result = await cloudApiRequest("action-otp/verify", { method: "POST", body: JSON.stringify({ storeId: String(storeId), action: otpDialog.action, challengeId: otpDialog.challengeId, code: otpCode }) });
      setGrnOtpApproval(storeId, otpDialog.action, result.approvalToken);
      const continuation = otpContinuation.current;
      otpContinuation.current = null;
      setOtpDialog(null);
      setOtpCode("");
      continuation?.();
    } catch (error) {
      setOtpDialog((current) => current ? { ...current, error: error.message || "The code could not be verified." } : current);
      setOtpCode("");
    } finally { setOtpBusy(false); }
  }

  function deleteRecord(record) {
    if (!canSave || !window.confirm(`Delete ${record.grnNo}? It will be removed from the GRN register and can no longer be printed.`)) return;
    requireActionOtp("grn_delete", () => {
      setRecords((current) => current.map((entry) => entry.id === record.id ? deleteGrnRecord(entry) : entry));
      notify(`${record.grnNo} deleted from the GRN register.`);
    });
  }

  function commitSaveRecord() {
    if (!canSave) return;
    try {
      if (editingId) {
        setRecords((current) => current.map((record) => record.id === editingId && !record.deletedAt ? updateGrnRecord(record, draft) : record));
        const grnNo = records.find((record) => record.id === editingId)?.grnNo || "GRN";
        closeForm();
        notify(`${grnNo} updated.`);
        return;
      }
      const record = createGrnRecord(draft, records, template);
      setRecords((current) => [record, ...current]);
      closeForm();
      notify(`${record.grnNo} generated. It is ready to print.`);
    } catch (error) {
      notify(error.message || "Enter the supplier and invoice number to save the GRN.");
    }
  }

  function saveRecord(event) {
    event.preventDefault();
    if (!canSave) return;
    commitSaveRecord();
  }

  function printRecord(record) {
    setPrintingId(record.id);
    document.body.classList.add("printing-grn");
    window.setTimeout(() => window.print(), 120);
  }

  function loadLogo(event) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return notify("Choose a PNG, JPG, or other image file for the GRN logo.");
    if (file.size > 500 * 1024) return notify("Choose a logo image under 500 KB.");
    const reader = new FileReader();
    reader.onload = () => updateTemplate("logoData", String(reader.result || ""));
    reader.onerror = () => notify("The logo could not be read. Please choose the image again.");
    reader.readAsDataURL(file);
  }

  return <section className="screen grn-workspace-screen">
    <div className="grn-page-head">
      <div className="grn-title-block"><span className="grn-title-icon"><ClipboardCheck size={23} /></span><div><span>Purchase / Goods receipt</span><h2>Goods Receipt Notes</h2><p>Generate, keep, and print supplier receipt records. Supplier details can be entered manually.</p></div></div>
      <div className="grn-head-actions"><button type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}><Settings2 size={17} /> GRN logo &amp; details</button><button type="button" className="grn-primary" onClick={() => { setEditingId(""); setDraft(blankDraft()); setFormOpen(true); }} disabled={!canSave}><Plus size={17} /> Generate GRN</button></div>
    </div>

    {settingsOpen && <section className="grn-settings-card" aria-label="GRN print settings">
      <div className="grn-settings-heading"><div><span>Print settings</span><h3>Receipt header and logo</h3><p>These details and the optional logo appear on printed GRNs. Settings are stored separately for this branch.</p></div><button type="button" className="grn-icon-button" onClick={() => { setTemplateDraft(template); setSettingsOpen(false); }} aria-label="Close GRN settings"><X size={18} /></button></div>
      <div className="grn-settings-grid">
        <label><span>Business / company name</span><input value={templateDraft.companyName || ""} onChange={(event) => updateTemplate("companyName", event.target.value)} placeholder="Business name" disabled={!canSave} /></label>
        <label><span>Branch</span><input value={templateDraft.branchName || ""} onChange={(event) => updateTemplate("branchName", event.target.value)} placeholder="Branch name" disabled={!canSave} /></label>
        <label><span>GSTIN</span><input value={templateDraft.gstin || ""} onChange={(event) => updateTemplate("gstin", event.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 15))} placeholder="15-character GSTIN" maxLength="15" disabled={!canSave} /></label>
        <label className="grn-wide-field"><span>Corporate / branch address</span><input value={templateDraft.address || ""} onChange={(event) => updateTemplate("address", event.target.value)} placeholder="Address to print on the receipt" disabled={!canSave} /></label>
        <div className="grn-logo-settings"><div className="grn-logo-preview">{templateDraft.logoData ? <img src={templateDraft.logoData} alt="GRN logo preview" /> : <ImagePlus size={23} />}</div><div className="grn-logo-copy"><strong>Receipt logo</strong><small>Optional image, up to 500 KB</small><div><button type="button" onClick={() => logoInput.current?.click()} disabled={!canSave}><ImagePlus size={15} /> {templateDraft.logoData ? "Change logo" : "Upload logo"}</button>{templateDraft.logoData && <button type="button" className="grn-remove-logo" onClick={() => updateTemplate("logoData", "")} disabled={!canSave}><Trash2 size={14} /> Remove</button>}</div></div><input ref={logoInput} type="file" accept="image/*" hidden onChange={loadLogo} /><label className="grn-logo-toggle"><input type="checkbox" checked={templateDraft.showLogo !== false} onChange={(event) => updateTemplate("showLogo", event.target.checked)} disabled={!canSave} /> Show logo when printing</label></div>
      </div>
      <div className="grn-settings-actions"><span>Only new GRNs use updated company details; existing GRNs keep their saved print header.</span><button type="button" className="grn-primary" onClick={saveTemplate} disabled={!canSave}>Save print settings</button></div>
    </section>}

    <div className="grn-metrics"><article><span><FileText size={19} /></span><div><small>GRNs in register</small><strong>{activeRecords.length}</strong></div></article><article><span><ClipboardCheck size={19} /></span><div><small>Receipt value recorded</small><strong>{money(totalReceived)}</strong></div></article><article><span><Printer size={19} /></span><div><small>Print status</small><strong>Ready to print</strong></div></article></div>

    <section className="grn-list-card">
      <div className="grn-list-heading"><div><span>Goods receipt register</span><h3>Generated GRNs</h3></div><label className="grn-search"><Search size={17} /><input aria-label="Search GRNs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search GRN, supplier, or invoice" /></label></div>
      <div className="grn-table-wrap"><table className="grn-table"><thead><tr><th>GRN number</th><th>Date</th><th>Supplier</th><th>Invoice no.</th><th>Items</th><th>Bill amount</th><th>Actions</th></tr></thead><tbody>
        {visibleRecords.map((record) => <tr key={record.id}><td><strong>{record.grnNo}</strong></td><td>{readableDate(record.date)}</td><td><div className="grn-vendor-cell"><strong>{record.supplierName}</strong><small>{record.supplierPhone || record.supplierAddress || "Supplier"}</small></div></td><td>{record.invoiceNo || "—"}</td><td>{(record.items || []).length || "—"}</td><td><strong>{money(record.billAmount)}</strong></td><td><div className="grn-row-actions"><button type="button" className="grn-action-button" onClick={() => printRecord(record)}><Printer size={15} /> Print</button><button type="button" className="grn-action-button" onClick={() => openEdit(record)} disabled={!canSave}><Pencil size={15} /> Edit</button><button type="button" className="grn-action-button grn-delete-button" onClick={() => deleteRecord(record)} disabled={!canSave} aria-label={`Delete ${record.grnNo}`} title={`Delete ${record.grnNo}`}><Trash2 size={15} /></button></div></td></tr>)}
        {!visibleRecords.length && <tr><td colSpan="7" className="grn-empty"><ClipboardCheck size={28} /><strong>{activeRecords.length ? "No matching GRNs" : "No GRNs generated yet"}</strong><span>{activeRecords.length ? "Try another supplier, GRN number, or invoice search." : "Generate the first receipt note to add it to this register."}</span>{!activeRecords.length && <button type="button" className="grn-primary" onClick={() => { setEditingId(""); setDraft(blankDraft()); setFormOpen(true); }} disabled={!canSave}><Plus size={16} /> Generate GRN</button>}</td></tr>}
      </tbody></table></div>
      <p className="grn-register-note">GRNs are receipt documents; submitting a GRN does not change inventory stock.</p>
    </section>

    {formOpen && <div className="grn-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}><form className="grn-form-modal" onSubmit={saveRecord} role="dialog" aria-modal="true" aria-label={editingId ? "Edit Goods Receipt Note" : "Generate Goods Receipt Note"}>
      <div className="grn-form-header"><div><span>Purchase / Goods receipt</span><h3>{editingId ? `Edit ${records.find((record) => record.id === editingId)?.grnNo || "GRN"}` : "Generate a GRN"}</h3><p>{editingId ? "Update supplier, invoice, and receiving details. The GRN number stays the same." : "Type a supplier name or choose a saved vendor; supplier details remain editable."}</p></div><button type="button" className="grn-icon-button" onClick={closeForm} aria-label="Close GRN form"><X size={19} /></button></div>
      <div className="grn-form-body">
        <section className="grn-form-section"><h4>Receipt and supplier</h4><div className="grn-form-grid">
          <label><span>GRN date</span><input type="date" value={draft.date} onChange={(event) => updateDraft("date", event.target.value)} required /></label><label><span>Time</span><input type="time" value={draft.time} onChange={(event) => updateDraft("time", event.target.value)} /></label>
          <div className="grn-supplier-field"><label htmlFor={supplierInputId}>Supplier / vendor name</label><GrnSupplierPicker id={supplierInputId} vendors={vendors} value={draft.supplierName} onChange={updateSupplierName} onSelect={selectSupplier} /></div>
          <label><span>Supplier phone</span><input type="tel" value={draft.supplierPhone} onChange={(event) => updateDraft("supplierPhone", event.target.value)} placeholder="Contact number" /></label><label className="grn-wide-field"><span>Supplier address</span><input value={draft.supplierAddress} onChange={(event) => updateDraft("supplierAddress", event.target.value)} placeholder="Supplier address" /></label><label><span>Supplier GSTIN</span><input value={draft.supplierGstin} onChange={(event) => updateDraft("supplierGstin", event.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 15))} placeholder="GSTIN (optional)" maxLength="15" /></label>
        </div></section>
        <section className="grn-form-section"><h4>Supplier invoice</h4><div className="grn-form-grid"><label><span>Invoice number</span><input value={draft.invoiceNo} onChange={(event) => updateDraft("invoiceNo", event.target.value)} placeholder="Supplier invoice no." required /></label><label><span>Invoice date</span><input type="date" value={draft.invoiceDate} onChange={(event) => updateDraft("invoiceDate", event.target.value)} /></label><label><span>Bill amount (₹)</span><input type="number" min="0" step="0.01" value={draft.billAmount} onChange={(event) => updateDraft("billAmount", event.target.value)} placeholder="0.00" /></label><label><span>Paid date</span><input type="date" value={draft.paidDate} onChange={(event) => updateDraft("paidDate", event.target.value)} /></label></div></section>
        <section className="grn-form-section"><h4>Delivery and receiving</h4><div className="grn-form-grid"><label><span>Vehicle number</span><input value={draft.vehicleNo} onChange={(event) => updateDraft("vehicleNo", event.target.value.toUpperCase())} placeholder="Vehicle registration" /></label><label><span>Receiver name</span><input value={draft.receiverName} onChange={(event) => updateDraft("receiverName", event.target.value)} placeholder="Name of receiver" /></label><label className="grn-wide-field"><span>Remarks</span><textarea value={draft.remarks} onChange={(event) => updateDraft("remarks", event.target.value)} placeholder="Condition, shortages, or other notes" rows="2" /></label></div></section>
      </div>
      <div className="grn-form-footer"><span>{editingId ? "The saved GRN number and print header remain unchanged." : "Logo and company header are configured in “GRN logo & details”."}</span><div><button type="button" onClick={closeForm}>Cancel</button><button type="submit" className="grn-primary" disabled={!canSave}><ClipboardCheck size={16} /> {editingId ? "Save changes" : "Generate GRN"}</button></div></div>
    </form></div>}

    {otpDialog && <div className="grn-modal-backdrop grn-otp-backdrop" role="presentation"><form className="grn-otp-dialog" onSubmit={verifyActionOtp} role="dialog" aria-modal="true" aria-labelledby="grn-otp-title">
      <span className="grn-otp-icon"><ClipboardCheck size={21} /></span><h3 id="grn-otp-title">WhatsApp approval required</h3>
      <p>A one-time code was sent to {otpDialog.maskedPhone}. It expires in 5 minutes.</p>
      <label><span>6-digit code</span><input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter code" disabled={otpBusy} required /></label>
      {otpDialog.error && <p className="grn-otp-error" role="alert">{otpDialog.error}</p>}
      <div className="grn-otp-actions"><button type="button" onClick={() => { otpContinuation.current = null; setOtpDialog(null); setOtpCode(""); }} disabled={otpBusy}>Cancel</button><button type="submit" className="grn-primary" disabled={otpBusy || otpCode.length !== 6}>{otpBusy ? "Verifying…" : "Verify & continue"}</button></div>
    </form></div>}

    {printingRecord && <article className="grn-print-page" aria-label={`Print ${printingRecord.grnNo}`}>
      <header className="grn-print-header"><div className="grn-print-brand">{printingRecord.company?.showLogo !== false && printingRecord.company?.logoData && <img className="grn-print-logo" src={printingRecord.company.logoData} alt="Business logo" />}<div><h1>{printingRecord.company?.companyName || "Goods Receipt Note"}</h1>{printingRecord.company?.branchName && <p><strong>Branch:</strong> {printingRecord.company.branchName}</p>}{printingRecord.company?.address && <p>{printingRecord.company.address}</p>}{printingRecord.company?.gstin && <p><strong>GSTIN:</strong> {printingRecord.company.gstin}</p>}</div></div><div className="grn-print-header-mark"><span>Purchase document</span><strong>GRN</strong></div></header>
      <div className="grn-print-title"><span>Goods received from supplier</span><h2>Goods Receipt Note</h2><p>Supplier and invoice acknowledgement</p></div>
      <div className="grn-print-meta grn-print-overview"><div><span>GRN number</span><strong>{printingRecord.grnNo}</strong></div><div><span>Receipt date</span><strong>{readableDate(printingRecord.date)}</strong></div><div><span>Receipt time</span><strong>{printingRecord.time || "—"}</strong></div></div>
      <section className="grn-print-supplier grn-print-card"><h3><span className="grn-print-section-number">01</span> Supplier details</h3><div className="grn-print-meta"><div><span>Supplier name</span><strong>{printingRecord.supplierName}</strong></div><div><span>Phone</span><strong>{printingRecord.supplierPhone || "—"}</strong></div><div><span>Supplier GSTIN</span><strong>{printingRecord.supplierGstin || "—"}</strong></div><div className="grn-print-address"><span>Address</span><strong>{printingRecord.supplierAddress || "—"}</strong></div></div></section>
      <section className="grn-print-invoice grn-print-card"><h3><span className="grn-print-section-number">02</span> Supplier invoice</h3><div className="grn-print-meta"><div><span>Invoice number</span><strong>{printingRecord.invoiceNo || "—"}</strong></div><div><span>Invoice date</span><strong>{readableDate(printingRecord.invoiceDate)}</strong></div><div className="grn-print-amount"><span>Bill amount</span><strong>{money(printingRecord.billAmount)}</strong></div><div><span>Paid date</span><strong>{readableDate(printingRecord.paidDate)}</strong></div></div></section>
      {(printingRecord.items || []).length > 0 && <table className="grn-print-items"><thead><tr><th>#</th><th>Item type / brand</th><th>Quantity received</th><th>Unit</th></tr></thead><tbody>{printingRecord.items.map((line, index) => <tr key={`${line.itemTypeBrand}-${index}`}><td>{index + 1}</td><td>{line.itemTypeBrand}</td><td>{line.quantity}</td><td>{line.unit}</td></tr>)}</tbody></table>}
      <section className="grn-print-delivery grn-print-card"><h3><span className="grn-print-section-number">03</span> Delivery &amp; receiving</h3><div className="grn-print-meta"><div><span>Vehicle number</span><strong>{printingRecord.vehicleNo || "—"}</strong></div><div className="grn-print-remarks"><span>Remarks</span><strong>{printingRecord.remarks || "—"}</strong></div></div></section>
      <footer className="grn-print-signoff"><p>Received and verified by</p><div className="grn-print-signatures"><div><strong>{printingRecord.receiverName || "\u00a0"}</strong><span>Receiver’s name</span></div><div><strong>&nbsp;</strong><span>Receiver’s signature</span></div><div><strong>&nbsp;</strong><span>Supplier seal / signature</span></div></div></footer>
      <small className="grn-print-footnote"><span>Goods Receipt Note</span><span>{printingRecord.grnNo}</span></small>
    </article>}
  </section>;
}
