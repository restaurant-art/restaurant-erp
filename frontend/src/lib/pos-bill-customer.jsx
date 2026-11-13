import React, { useId, useRef, useState } from "react";
import { BadgeIndianRupee, CreditCard, MapPin, Pencil, Phone, Plus, Search, User, UserPlus, Wallet, X } from "lucide-react";
import { searchBillCustomers, validateBillCustomer } from "./pos-customer.js";
import { walletDepositAllocation } from "./customer-wallet-credit.js";
import "./pos-bill-customer.css";

export function PosBillCustomer({ training = false, name, mobile, location = "", customers = [], onChange, onSaveCustomer, onRedeem, onCredit, onSettle, onAddWalletFunds, showOnReceipt = true, compact = false }) {
  const [draft, setDraft] = useState({ name: "", mobile: "", location: "" });
  const [customerQuery, setCustomerQuery] = useState("");
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [errors, setErrors] = useState({});
  const dialogRef = useRef(null);
  const walletDialogRef = useRef(null);
  const [walletDraft, setWalletDraft] = useState({ amount: "", method: "Cash", reference: "" });
  const titleId = useId();
  const nameErrorId = useId();
  const mobileErrorId = useId();
  const hasCustomer = Boolean(name || mobile);
  const matchingCustomers = customerQuery.trim() ? searchBillCustomers(customers, customerQuery) : [];
  const selectedCustomer = customers.find((customer) => (
    (mobile && String(customer.mobile || "").replace(/\D/g, "").slice(-10) === String(mobile).replace(/\D/g, "").slice(-10))
    || (!mobile && name && String(customer.name || "").trim().toLowerCase() === String(name).trim().toLowerCase())
  ));
  const walletBalance = Math.max(0, Number(selectedCustomer?.walletBalance || 0));
  const creditBalance = Math.max(0, Number(selectedCustomer?.creditBalance || 0));
  const depositPreview = walletDepositAllocation({ creditBalance, walletBalance, amount: walletDraft.amount });
  const money = (value) => value.toLocaleString("en-IN", { style: "currency", currency: "INR" });

  function showCustomerDialog(nextDraft, editing) {
    setDraft(nextDraft);
    setEditingCustomer(editing);
    setErrors({});
    dialogRef.current.showModal();
    dialogRef.current.querySelector("input")?.focus();
  }

  function openNewCustomer() {
    showCustomerDialog({ name: "", mobile: "", location: "" }, false);
  }

  function openEditCustomer() {
    showCustomerDialog({ name: name || "", mobile: mobile || "", location: location || "" }, true);
  }

  function saveCustomer(event) {
    event.preventDefault();
    const result = validateBillCustomer(draft);
    setErrors(result.errors);
    if (!result.valid) return;
    const savedCustomer = { ...result.customer, location: result.customer.location || "" };
    onSaveCustomer?.(savedCustomer);
    onChange(savedCustomer);
    setCustomerQuery("");
    dialogRef.current.close();
  }

  function chooseExistingCustomer(customer) {
    onChange({ name: customer.name, mobile: customer.mobile, location: customer.location || "" });
    setCustomerQuery("");
  }

  function openWalletDeposit() {
    if (!selectedCustomer?.key) return;
    setWalletDraft({ amount: "", method: "Cash", reference: "" });
    walletDialogRef.current?.showModal();
    walletDialogRef.current?.querySelector("input")?.focus();
  }

  function saveWalletDeposit(event) {
    event.preventDefault();
    const amount = Number(walletDraft.amount);
    if (!selectedCustomer?.key || !Number.isFinite(amount) || amount <= 0) return;
    const saved = onAddWalletFunds?.(selectedCustomer, { amount, method: walletDraft.method, reference: walletDraft.reference.trim() });
    if (saved !== false) walletDialogRef.current?.close();
  }

  return <>
    <section className={`pos-bill-customer${compact ? " pos-bill-customer-compact" : ""}`} aria-label="Bill customer">
      <div className="pos-customer-quick-row">
        <button type="button" className="pos-add-customer-icon" onClick={openNewCustomer} aria-label="Add customer" title="Add customer"><UserPlus size={19} /></button>
        <div className="pos-customer-quick-search">
          <label><Search size={16} /><input type="search" autoComplete="off" placeholder="Search customer name or mobile" value={customerQuery} onChange={(event) => setCustomerQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setCustomerQuery(""); }} aria-label="Search customers by name or mobile number" /></label>
          {customerQuery.trim() && <div className="pos-customer-inline-results" aria-label="Matching customers">
            {matchingCustomers.length ? matchingCustomers.map((customer) => <button type="button" key={customer.id} onClick={() => chooseExistingCustomer(customer)}><span className="pos-customer-result-avatar"><User size={15} /></span><span><strong>{customer.name || "Customer"}</strong><small>{customer.mobile ? "+91 " + customer.mobile : "No mobile"}{customer.location ? ` · ${customer.location}` : ""}</small></span><span className="pos-customer-select">Select</span></button>) : <p role="status">No customer found. Use the + icon to add one.</p>}
          </div>}
        </div>
      </div>
      {hasCustomer && <div className="pos-bill-customer-card">
        <span className="pos-customer-avatar"><User size={18} /></span>
        <div className="pos-selected-customer-info">
          <small>Selected customer</small>
          <div className="pos-selected-customer-name"><strong title={name || "Customer"}>{name || "Customer"}</strong>{walletBalance > 0 && <span className="pos-customer-wallet-balance">Wallet {walletBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span>}</div>
          <div className="pos-selected-customer-meta">{mobile && <span className="pos-customer-mobile" title={`+91 ${mobile}`}><Phone size={12} />+91 {mobile}</span>}{location && <span className="pos-customer-location" title={location}><MapPin size={12} />{location}</span>}{creditBalance > 0 && <span className="pos-customer-credit-due"><BadgeIndianRupee size={12} />Credit due ₹{creditBalance.toFixed(2)}</span>}</div>
        </div>
        <div className="pos-selected-customer-actions">
          <button type="button" className="pos-customer-edit" onClick={openEditCustomer} aria-label="Edit customer"><Pencil size={14} /><span>Edit</span></button>
          <button type="button" className="pos-customer-remove" onClick={() => onChange({ name: "", mobile: "", location: "" })} aria-label="Remove customer from bill" title="Remove customer"><X size={16} /></button>
        </div>
        <div className="pos-customer-account-actions" aria-label="Customer account actions">
          <button type="button" className="pos-customer-wallet-add" disabled={!selectedCustomer?.key} onClick={openWalletDeposit} title="Add prepaid funds to this customer's wallet"><Plus size={14} /> Add funds</button>
          <button type="button" className="pos-customer-redeem" disabled={!walletBalance} onClick={() => onRedeem?.(selectedCustomer)} title={walletBalance ? `Use up to ${walletBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })} from this wallet` : "No customer wallet balance available"}><Wallet size={14} /> {walletBalance ? `Use ${walletBalance.toLocaleString("en-IN", { style: "currency", currency: "INR" })}` : "Use wallet"}</button>
          <button type="button" className="pos-customer-credit" onClick={() => onCredit?.(selectedCustomer)}><CreditCard size={14} /> Credit sale</button>
          <button type="button" className="pos-customer-settle" disabled={!creditBalance} onClick={() => onSettle?.(selectedCustomer)} title={creditBalance ? `Settle ₹${creditBalance.toFixed(2)} credit` : "No outstanding credit"}><BadgeIndianRupee size={14} /> Settle</button>
        </div>
      </div>}
    </section>
    {showOnReceipt && hasCustomer && <div className="pos-receipt-customer bill-order-details">{name && <span><small>Customer name</small><strong>{name}</strong></span>}{mobile && <span><small>Mobile</small><strong>{mobile}</strong></span>}{location && <span><small>Location</small><strong>{location}</strong></span>}</div>}
    <dialog ref={dialogRef} className="pos-customer-dialog" aria-labelledby={titleId}>
      <form onSubmit={saveCustomer} noValidate>
        {training && <p className="pos-training-bill-note">TRAINING ONLY · Customer changes stay in this practice session.</p>}
        <header><span className="pos-customer-avatar"><UserPlus size={22} /></span><div><small>BILL CUSTOMER</small><h2 id={titleId}>{editingCustomer ? "Edit customer" : "Add customer"}</h2></div><button type="button" onClick={() => dialogRef.current.close()} aria-label="Close customer dialog"><X size={20} /></button></header>
        <p>Enter the customer details for this bill. Location is optional.</p>
        <label>Customer name<input type="text" autoComplete="name" maxLength={60} placeholder="Enter customer name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? nameErrorId : undefined} /></label>
        {errors.name && <p className="pos-customer-error" id={nameErrorId} role="alert">{errors.name}</p>}
        <label>Mobile number<input type="tel" inputMode="numeric" autoComplete="tel" maxLength={10} placeholder="10-digit mobile number" value={draft.mobile} onChange={(event) => setDraft({ ...draft, mobile: event.target.value.replace(/\D/g, "").slice(0, 10) })} aria-invalid={Boolean(errors.mobile)} aria-describedby={errors.mobile ? mobileErrorId : undefined} /></label>
        {errors.mobile && <p className="pos-customer-error" id={mobileErrorId} role="alert">{errors.mobile}</p>}
        <label>Location <small>(optional)</small><input type="text" autoComplete="address-level2" maxLength={100} placeholder="Area, city, or delivery location" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
        <footer><button type="button" onClick={() => dialogRef.current.close()}>Cancel</button><button type="submit" className="pos-customer-save">{editingCustomer ? "Save customer" : "Add customer"}</button></footer>
      </form>
    </dialog>
    <dialog ref={walletDialogRef} className="pos-customer-dialog pos-wallet-dialog" aria-labelledby={`${titleId}-wallet`}>
      <form onSubmit={saveWalletDeposit}>
        {training && <p className="pos-training-bill-note">TRAINING ONLY · Simulated funds. Do not collect money.</p>}
        <header><span className="pos-customer-avatar"><Wallet size={22} /></span><div><small>PREPAID CUSTOMER FUNDS</small><h2 id={`${titleId}-wallet`}>Add to wallet</h2></div><button type="button" onClick={() => walletDialogRef.current?.close()} aria-label="Close wallet deposit dialog"><X size={20} /></button></header>
        <p>Add funds for <strong>{name || selectedCustomer?.name || "this customer"}</strong>. Outstanding credit is cleared first; the remaining amount stays in the wallet. All movements appear in the customer ledger.</p>
        <label>Amount to add<input type="number" min="0.01" step="0.01" required autoFocus inputMode="decimal" placeholder="Enter amount" value={walletDraft.amount} onChange={(event) => setWalletDraft({ ...walletDraft, amount: event.target.value })} /></label>
        {Number(walletDraft.amount) > 0 && <div className="pos-wallet-allocation" role="status"><span>Applied to credit<strong>{money(depositPreview.settled)}</strong></span><span>Credit due after deposit<strong>{money(depositPreview.creditBalance)}</strong></span><span>Wallet after deposit<strong>{money(depositPreview.walletBalance)}</strong></span></div>}
        <label>Payment method<select value={walletDraft.method} onChange={(event) => setWalletDraft({ ...walletDraft, method: event.target.value })}><option>Cash</option><option>UPI</option><option>Card</option></select></label>
        <label>Reference <small>(optional)</small><input type="text" maxLength={80} placeholder="Receipt or transaction reference" value={walletDraft.reference} onChange={(event) => setWalletDraft({ ...walletDraft, reference: event.target.value })} /></label>
        <footer><button type="button" onClick={() => walletDialogRef.current?.close()}>Cancel</button><button type="submit" className="pos-customer-save">Add funds</button></footer>
      </form>
    </dialog>
  </>;
}
