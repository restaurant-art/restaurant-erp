import React, { useEffect, useRef, useState } from 'react';
import { Percent, BadgeIndianRupee, ShoppingCart, Boxes, Sparkles, Layers, Truck, UserPlus, Clock, ReceiptText, SlidersHorizontal, Search, Plus, X, ArrowRight, Pencil, Trash2, Check } from 'lucide-react';
import { useBusinessState } from './use-business-state';
import { buildProductSearchCatalog } from './pos-catalog.js';
import { promotionTemplates, promotionDays, newPromotion, editablePromotion, promotionSummary, promotionScheduleLabel, validatePromotion } from './promotion-rules.js';
import './promotions-workspace.css';

const icons = { percent: Percent, money: BadgeIndianRupee, cart: ShoppingCart, box: Boxes, gift: Sparkles, layers: Layers, truck: Truck, user: UserPlus, clock: Clock, ticket: ReceiptText, sliders: SlidersHorizontal };
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(value || 0));
function ProductSelection({ title, products, value, onChange, single = false, hint }) {
  const [query, setQuery] = useState('');
  const filtered = products.filter(p => `${p.name} ${p.sku || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <fieldset className="promo-product-selection"><legend>{title}</legend>{hint && <p>{hint}</p>}
    <label className="promo-search"><Search size={16}/><input aria-label={`Search ${title}`} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products or SKU" /></label>
    <div className="promo-product-options">{filtered.map(p=><label key={p.id}><input type={single ? 'radio' : 'checkbox'} name={single ? title : undefined} checked={value.includes(p.id)} onChange={()=>onChange(single ? [p.id] : value.includes(p.id) ? value.filter(id=>id!==p.id) : [...value,p.id])}/><span>{p.name}<small>{p.sku || p.category}</small></span><strong>{money(p.price)}</strong></label>)}{!filtered.length && <p>No matching products.</p>}</div>
    <small>{value.length} selected{!single && value.length > 0 && <button type="button" onClick={()=>onChange([])}>Clear selection</button>}</small>
  </fieldset>;
}
function NumberField({ label, value, onChange, min = 0, max, step = '0.01' }) {
  return <label className="promo-field">{label}<input type="number" min={min} max={max} step={step} value={value} onChange={e=>onChange(e.target.value)} required /></label>;
}

export function PromotionsWorkspace({ storeId, productItems = [], canManage, notify, initialOffers = [], canAccessOption = () => true }) {
  const [storedOffers,setOffers] = useBusinessState(`vestora-offers-${storeId}`,initialOffers);
  const permissionFor = template => template === 'happy' ? 'Happy hour offer' : ['bogo','buy-get'].includes(template) ? 'BOGO offers' : template === 'bundle' ? 'Combo discounts' : template === 'coupon' ? 'Coupons' : 'Weekend offers';
  const allowed = template => canAccessOption(permissionFor(template));
  const templates = promotionTemplates.filter(t=>allowed(t.id));
  const offers = storedOffers.filter(o=>allowed(editablePromotion(o).template));
  const [inventory] = useBusinessState(`vestora-inventory-${storeId}`,[]);
  const products = buildProductSearchCatalog(productItems,inventory);
  const [filter,setFilter] = useState('All');
  const [query,setQuery] = useState('');
  const [pickerOpen,setPickerOpen] = useState(false);
  const [draft,setDraft] = useState(null);
  const [error,setError] = useState('');
  const dialogRef = useRef(null);
  const launchRef = useRef(null);
  const template = promotionTemplates.find(t=>t.id===draft?.template);
  const change = (key,value) => setDraft(d=>({...d,[key]:value}));
  const shown = offers.filter(o=>(filter==='All' || o.status===filter) && `${o.name} ${o.type} ${o.discount}`.toLowerCase().includes(query.toLowerCase()));
  function open(templateId, offer) {
    if (!canManage || !allowed(offer ? editablePromotion(offer).template : templateId)) return notify('You do not have permission to manage this offer');
    launchRef.current = document.activeElement;
    setPickerOpen(false);
    setDraft(offer ? editablePromotion(offer) : newPromotion(templateId));
    setError('');
  }
  function openPicker() {
    if (!canManage) return notify('You do not have permission to create promotions');
    launchRef.current = document.activeElement;
    setPickerOpen(true);
  }
  function close() { setDraft(null); launchRef.current?.focus(); }
  useEffect(()=>{
    if (!draft) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialogRef.current?.querySelector('input')?.focus();
    return ()=>{ document.body.style.overflow=previous; };
  },[Boolean(draft)]);
  function keys(e) {
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key!=='Tab') return;
    const fields=[...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter(el=>el.getClientRects().length);
    if(e.shiftKey && document.activeElement===fields[0]){e.preventDefault();fields.at(-1)?.focus();}
    if(!e.shiftKey && document.activeElement===fields.at(-1)){e.preventDefault();fields[0]?.focus();}
  }
  function save(e) {
    e.preventDefault();
    if(!canManage || !allowed(draft.template)) return;
    const message = validatePromotion(draft);
    if(message) return setError(message);
    const selectedIds = [...draft.productIds,...draft.rewardProductIds,...draft.bundleLines.map(l=>l.itemId),...(draft.productDiscounts || []).map(l=>l.itemId)];
    if(selectedIds.some(id=>!products.some(p=>p.id===id))) return setError('A selected product is no longer available. Update the product selection.');
    if(draft.template==='product-discounts') {
      const invalidRate = draft.productDiscounts.find(line=>{
        const product = products.find(item=>item.id===line.itemId);
        return product && Number(line.offerPrice) >= Number(product.price);
      });
      if(invalidRate) {
        const product = products.find(item=>item.id===invalidRate.itemId);
        return setError(`${product.name}: offer rate must be lower than its current rate ${money(product.price)}.`);
      }
    }
    if(draft.template==='coupon' && offers.some(o=>o.id!==draft.id && String(o.couponCode||'').toUpperCase()===draft.couponCode.trim().toUpperCase())) return setError('This coupon code is already in use.');
    const record={...draft, id:draft.id || `OFF-${crypto.randomUUID()}`, type:template.title, name:draft.name.trim(), couponCode:draft.couponCode.trim().toUpperCase(), discount:promotionSummary(draft), days:draft.runDays.length===7 ? 'Every day' : draft.runDays.map(d=>d.slice(0,3)).join(', '), window:promotionScheduleLabel(draft).time, updatedAt:new Date().toISOString()};
    setOffers(current=>draft.id ? current.map(o=>o.id===draft.id ? record : o) : [record,...current]);
    close(); notify(`${record.name} saved`);
  }
  function toggle(offer) {
    if(!canManage || !allowed(editablePromotion(offer).template)) return;
    setOffers(current=>current.map(o=>o.id===offer.id ? {...o,status:o.status==='Active' ? 'Paused' : 'Active'} : o));
  }
  const scoped = draft && !['spend-percent','spend-flat','bundle','product-discounts'].includes(draft.template);
  const hasValue = draft && !['tier','shipping','product-discounts'].includes(draft.template);
  const changeMode = draft && ['bundle','coupon','first','custom','fixed-quantity'].includes(draft.template);
  return <section className="screen promo-workspace promo-compact-workspace">
    <section className="promo-campaigns promo-register" aria-label="Saved offers">
      <header className="promo-register-head">
        <div><span className="promo-eyebrow"><Sparkles size={14}/> OFFER MANAGEMENT</span><h2>Offers &amp; promotions</h2><p>View and manage every promotion for this store.</p></div>
        <button type="button" className="promo-new-button" onClick={openPicker} disabled={!canManage}><Plus size={17}/> New promotion</button>
      </header>
      <div className="promo-register-summary" aria-label="Promotion summary">
        <span><strong>{offers.length}</strong> Total</span>
        <span><strong>{offers.filter(o=>o.status==='Active').length}</strong> Active</span>
        <span><strong>{offers.filter(o=>o.status==='Draft').length}</strong> Draft</span>
        <span><strong>{offers.filter(o=>o.status==='Scheduled').length}</strong> Scheduled</span>
      </div>
      <div className="promo-register-toolbar">
        <label className="promo-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search promotion, type or benefit" aria-label="Search offers"/></label>
        <div className="promo-tabs" aria-label="Filter offers">{['All','Active','Draft','Scheduled','Paused'].map(status=><button type="button" key={status} aria-pressed={filter===status} onClick={()=>setFilter(status)}>{status}<span>{status==='All'?offers.length:offers.filter(o=>o.status===status).length}</span></button>)}</div>
      </div>
      <div className="promo-list-scroll"><div className="promo-list-table" role="table" aria-label="All promotions">
        <div className="promo-list-head" role="row"><span>Promotion</span><span>Type</span><span>Benefit</span><span>Schedule</span><span>Status</span><span>Actions</span></div>
        {shown.map(offer=><article key={offer.id} className="promo-list-row" role="row">
          <div className="promo-list-name"><strong>{offer.name}</strong><small>{offer.id}</small></div>
          <span className="promo-list-type">{offer.type}</span>
          <p>{offer.discount}</p>
          <small className="promo-list-schedule"><Clock size={13}/><span>{promotionScheduleLabel(offer).time}<br/>{offer.days}{promotionScheduleLabel(offer).dates&&<><br/>{promotionScheduleLabel(offer).dates}</>}</span></small>
          <b className={`promo-status promo-status-${offer.status.toLowerCase()}`}>{offer.status}</b>
          <footer><button type="button" onClick={()=>open(null,offer)} disabled={!canManage}><Pencil size={14}/> Edit</button><button type="button" onClick={()=>toggle(offer)} disabled={!canManage}>{offer.status==='Active'?'Pause':'Activate'}</button><button type="button" className="promo-delete" aria-label={`Delete ${offer.name}`} disabled={!canManage} onClick={()=>{if(window.confirm(`Delete ${offer.name}?`)) setOffers(current=>current.filter(o=>o.id!==offer.id));}}><Trash2 size={15}/></button></footer>
        </article>)}
      </div></div>
      {!shown.length && <div className="promo-empty"><Sparkles size={23}/><h4>{query || filter!=='All' ? 'No promotions match this view' : 'No promotions created yet'}</h4><p>Use New promotion to choose an offer type and create one.</p></div>}
    </section>
    {pickerOpen && <div className="promo-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPickerOpen(false);}}>
      <section className="promo-picker" role="dialog" aria-modal="true" aria-labelledby="promo-picker-title">
        <header><div><span className="promo-eyebrow">NEW PROMOTION</span><h2 id="promo-picker-title">Choose a promotion type</h2><p>All available offer types are listed below.</p></div><button type="button" className="promo-close" onClick={()=>setPickerOpen(false)} aria-label="Close promotion type list"><X size={20}/></button></header>
        <div className="promo-picker-list">{templates.map(t=>{const Icon=icons[t.icon];return <button key={t.id} type="button" className={`promo-picker-option promo-template-${t.icon}`} onClick={()=>open(t.id)}><span className="promo-template-icon"><Icon size={18}/></span><span><strong>{t.title}</strong><small>{t.description}</small></span><ArrowRight size={16}/></button>;})}</div>
      </section>
    </div>}
    {draft && <div className="promo-backdrop"><form ref={dialogRef} onSubmit={save} onKeyDown={keys} className="promo-editor" role="dialog" aria-modal="true" aria-labelledby="promo-editor-title"><header><div><span className="promo-eyebrow">{draft.id ? 'EDIT PROMOTION' : 'NEW PROMOTION'} / {template.group}</span><h2 id="promo-editor-title">{template.title}</h2><p>{template.description}</p></div><button type="button" className="promo-close" onClick={close} aria-label="Close promotion editor"><X size={21}/></button></header>
      <div className="promo-editor-body"><div className="promo-editor-fields"><label className="promo-field">Offer name<input value={draft.name} onChange={e=>change('name',e.target.value)} placeholder="Give this offer a name" required maxLength={100}/></label>
      <fieldset className="promo-choice"><legend>Status</legend>{['Draft','Active','Scheduled','Paused'].map(status=><button type="button" key={status} aria-pressed={draft.status===status} onClick={()=>change('status',status)}>{draft.status===status && <Check size={14}/>} {status}</button>)}{draft.status==='Scheduled' && <p>Applies automatically in POS during the dates, days, and times below.</p>}</fieldset>
      <fieldset className="promo-schedule"><legend><Clock size={15}/> Offer schedule</legend><p>Set when this offer can apply. Times follow this device’s local time.</p><div className="promo-rule-fields"><label className="promo-field">Start time<input aria-label="Start time" type="time" value={draft.startTime} onChange={e=>change('startTime',e.target.value)} required/></label><label className="promo-field">End time<input aria-label="End time" type="time" value={draft.endTime} onChange={e=>change('endTime',e.target.value)} required/></label><label className="promo-field">Start date <small>Optional</small><input aria-label="Start date" type="date" value={draft.startDate||''} max={draft.endDate||undefined} onChange={e=>change('startDate',e.target.value)}/></label><label className="promo-field">End date <small>Optional</small><input aria-label="End date" type="date" value={draft.endDate||''} min={draft.startDate||undefined} onChange={e=>change('endDate',e.target.value)}/></label></div><small>{draft.startTime&&draft.endTime&&draft.endTime<draft.startTime?'Ends the following day. Active days and dates refer to the day the offer starts.':'The offer starts at the selected start time and stops at the end time.'}</small></fieldset>
      <div className="promo-rule-fields">
        {changeMode && <fieldset className="promo-choice"><legend>Reward</legend>{[['percent','Percentage'],['amount','Flat amount']].map(([mode,label])=><button type="button" key={mode} aria-pressed={draft.discountMode===mode} onClick={()=>change('discountMode',mode)}>{label}</button>)}</fieldset>}
        {hasValue && <NumberField label={['bogo','buy-get'].includes(draft.template) ? 'Reward discount % (100 = free)' : draft.discountMode==='amount' ? 'Discount amount (₹)' : 'Discount percentage'} value={draft.discountValue} min={0.01} max={draft.discountMode==='percent'?100:undefined} onChange={v=>change('discountValue',v)}/>}
        {['spend-percent','spend-flat','shipping','coupon','custom','first'].includes(draft.template) && <NumberField label="Minimum merchandise spend (₹)" value={draft.minimumOrder || '0'} onChange={v=>change('minimumOrder',v)}/>}
        {['fixed-quantity','custom'].includes(draft.template) && <NumberField label="Minimum eligible quantity" value={draft.minimumQuantity} min={0.01} onChange={v=>change('minimumQuantity',v)}/>}
        {draft.template==='fixed-quantity' && <NumberField label="Maximum discounted quantity" value={draft.quantityCap} min={0.01} onChange={v=>change('quantityCap',v)}/>}
        {['bogo','buy-get'].includes(draft.template) && <><NumberField label="Buy quantity" value={draft.buyQuantity} min={1} step="1" onChange={v=>change('buyQuantity',v)}/><NumberField label="Reward quantity" value={draft.rewardQuantity} min={1} step="1" onChange={v=>change('rewardQuantity',v)}/></>}
        {draft.template==='coupon' && <label className="promo-field">Coupon code<input value={draft.couponCode} onChange={e=>change('couponCode',e.target.value.toUpperCase())} required maxLength={24}/></label>}
      </div>
      {scoped && <ProductSelection title={draft.template==='shipping'?'Delivery charge product':'Eligible products'} products={products} value={draft.productIds} onChange={v=>change('productIds',v)} single={draft.template==='shipping'} hint={draft.template==='shipping'?'Select the delivery charge product used on bills. Add it at POS; this offer waives that line, including its GST. The spend threshold excludes delivery.': ['bogo','buy-get'].includes(draft.template)?'Select the products customers must buy. Reward units must also be added to the bill.':'Leave empty to include all products. Search and tick products to limit this offer.'}/>}
      {draft.template==='buy-get' && <ProductSelection title="Reward products" products={products.filter(p=>!draft.productIds.includes(p.id))} value={draft.rewardProductIds} onChange={v=>change('rewardProductIds',v)} hint="Choose a different selection from the products being bought."/>}
      {draft.template==='bundle' && <><ProductSelection title="Bundle products" products={products} value={draft.bundleLines.map(l=>l.itemId)} onChange={ids=>change('bundleLines',ids.map(itemId=>draft.bundleLines.find(l=>l.itemId===itemId)||{itemId,quantity:'1'}))} hint="Select at least two products, then set the quantity of each per bundle."/><div className="promo-rule-fields">{draft.bundleLines.map(l=><NumberField key={l.itemId} label={`${products.find(p=>p.id===l.itemId)?.name || 'Unavailable product'} quantity`} value={l.quantity} min={0.01} onChange={v=>change('bundleLines',draft.bundleLines.map(x=>x.itemId===l.itemId?{...x,quantity:v}:x))}/>)}</div></>}
      {draft.template==='product-discounts' && <><ProductSelection title="Products with individual offer rates" products={products} value={(draft.productDiscounts || []).map(line=>line.itemId)} onChange={ids=>change('productDiscounts',ids.map(itemId=>(draft.productDiscounts || []).find(line=>line.itemId===itemId)||{itemId,offerPrice:''}))} hint="Choose any number of products. The current rate is shown below; enter the offer rate for each product."/><div className="promo-rule-fields promo-product-discount-fields">{(draft.productDiscounts || []).map(line=>{const product=products.find(item=>item.id===line.itemId);return <label className="promo-field promo-offer-rate-field" key={line.itemId}><span><strong>{product?.name || 'Unavailable product'}</strong><small>Current rate {money(product?.price)}</small></span><input type="number" min="0" max={Math.max(0,Number(product?.price || 0)-0.01)} step="0.01" value={line.offerPrice} placeholder="Enter offer rate" onChange={event=>change('productDiscounts',draft.productDiscounts.map(entry=>entry.itemId===line.itemId?{...entry,offerPrice:event.target.value}:entry))} required/></label>;})}</div></>}
      {draft.template==='tier' && <fieldset className="promo-tiers"><legend>Quantity breaks · per product</legend>{draft.tiers.map((tier,i)=><div key={i}><NumberField label={`Tier ${i+1} minimum quantity`} value={tier.quantity} min={0.01} onChange={v=>change('tiers',draft.tiers.map((t,n)=>n===i?{...t,quantity:v}:t))}/><NumberField label={`Tier ${i+1} discount %`} value={tier.percent} min={0.01} max={100} onChange={v=>change('tiers',draft.tiers.map((t,n)=>n===i?{...t,percent:v}:t))}/><button type="button" aria-label={`Remove tier ${i+1}`} onClick={()=>change('tiers',draft.tiers.filter((_,n)=>n!==i))}><Trash2 size={16}/></button></div>)}<button type="button" onClick={()=>change('tiers',[...draft.tiers,{quantity:'',percent:''}])}><Plus size={16}/> Add tier</button></fieldset>}
      {draft.template==='first' && <p className="promo-help">At POS, enter the customer’s mobile number. Eligibility checks recorded purchases in this store’s available sales history.</p>}
      {['bogo','buy-get','fixed-quantity'].includes(draft.template) && <p className="promo-help">The lowest-priced eligible units receive the reward. Buy/get offers repeat for each complete set.</p>}
      <fieldset className="promo-choice"><legend>Active days</legend><div>{promotionDays.map(day=><button type="button" key={day} aria-pressed={draft.runDays.includes(day)} onClick={()=>change('runDays',draft.runDays.includes(day)?draft.runDays.filter(d=>d!==day):[...draft.runDays,day])}>{day.slice(0,3)}</button>)}</div></fieldset>
      </div><aside className="promo-preview"><span className="promo-eyebrow">AT A GLANCE</span><Sparkles size={30}/><h3>{draft.name || template.title}</h3><p>{promotionSummary(draft)}</p><dl><div><dt>Availability</dt><dd>{draft.status}</dd></div><div><dt>Days</dt><dd>{draft.runDays.length===7?'Every day':draft.runDays.map(d=>d.slice(0,3)).join(', ') || 'Choose days'}</dd></div><div><dt>Time</dt><dd>{promotionScheduleLabel(draft).time}</dd></div>{(draft.startDate||draft.endDate)&&<div><dt>Dates</dt><dd>{promotionScheduleLabel(draft).dates}</dd></div>}</dl><small>POS automatically applies the best eligible offer during its schedule. One promotion per bill.</small></aside></div>
      <footer className="promo-editor-footer">{error && <p role="alert">{error}</p>}<button type="button" onClick={close}>Cancel</button><button type="submit" className="promo-primary"><Check size={17}/> {draft.id?'Save changes':'Save offer'}</button></footer>
    </form></div>}
  </section>;
}
