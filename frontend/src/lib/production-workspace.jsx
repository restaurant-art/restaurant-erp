import React, { useCallback, useEffect, useRef, useState } from "react";
import { loadKitchen, kitchenCommand, setupKitchen, loadKitchenReport, loadBatchProfit, reliableKitchenCommand, pendingKitchenCommand, resumeKitchenCommand } from "./production-api.js";
import "./production-workspace.css";
import { isProductEnabled } from "./product-availability.js";
import { newProductionRecipe, productionRecipePayload, loadProductionRecipeDraft, saveProductionRecipeDraft } from "./production-recipe-editor.js";
import { inventoryStockRows, decorateInventoryStockRows, filterInventoryStockRows, inventoryCountPhysical } from "./inventory-stock-list.js";
import { InventoryProductTable } from "./inventory-product-table.jsx";

const today = () => new Date().toLocaleDateString("en-CA");
const fmt = (value, digits = 3) => Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: digits });
const rupees = (value) => `₹${fmt(value, 2)}`;
const blankRow = () => ({ item: "", quantity: "", unit: "", weight: "1" });
const tabs = ["Setup", "Recipes", "Servings", "Production", "Batches", "Stock", "Service", "Usage", "Stock count", "Reports"];
const navMap = { Planning: "Production", "Food Stock": "Stock", Wastage: "Usage", Closing: "Stock count" };

export function useKitchen(storeId, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!enabled) return null;
    try { const next = await loadKitchen(storeId); setData(next); setError(""); return next; }
    catch (err) { setError(err.message); throw err; }
  }, [storeId, enabled]);
  useEffect(() => {
    setData(null);
    if (!enabled) return;
    reload().catch(() => {});
    const update = (event) => { if (!event.detail || String(event.detail.storeId) === String(storeId)) reload().catch(() => {}); };
    const timer = setInterval(() => reload().catch(() => {}), 30000);
    window.addEventListener("uvpro-kitchen-updated", update);
    return () => { clearInterval(timer); window.removeEventListener("uvpro-kitchen-updated", update); };
  }, [storeId, reload, enabled]);
  return { data, error, reload };
}

function Field({ label, children, hint }) { return <label className="kp-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function Select({ value, onChange, options, placeholder = "Select…", ...props }) { return <select value={value} onChange={(e) => onChange(e.target.value)} {...props}><option value="">{placeholder}</option>{options.map((o) => <option key={o.id} value={o.id} disabled={o.disabled}>{o.name}</option>)}</select>; }
function SearchSelect({ id, label, value, onChange, options, placeholder = "Click to browse or type to search", hint }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const matches = options.filter((option) => String(option.name).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = options.find((option) => String(option.id) === String(value));
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);
  const openPicker = () => {
    if (open) return;
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };
  const closePicker = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (option) => {
    onChange(String(option.id));
    closePicker();
  };
  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        closePicker();
      }
      return;
    }
    if (event.key === "Tab") {
      closePicker();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openPicker();
        return;
      }
      if (matches.length) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((current) => (current + direction + matches.length) % matches.length);
      }
      return;
    }
    if (event.key === "Enter") {
      if (!open) {
        event.preventDefault();
        openPicker();
      } else if (matches.length) {
        event.preventDefault();
        choose(matches[activeIndex] || matches[0]);
      }
    }
  };
  return <div className="kp-field kp-search-select">
    <label htmlFor={id}>{label}</label>
    <div className="kp-combobox" ref={rootRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) closePicker();
    }}>
      <input id={id} ref={inputRef} type="search" role="combobox" aria-autocomplete="list"
        aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open && matches[activeIndex] ? `${id}-option-${activeIndex}` : undefined}
        value={open ? query : selected?.name || ""}
        onFocus={openPicker} onClick={openPicker}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true); }}
        onKeyDown={handleKeyDown} placeholder={placeholder} autoComplete="off" />
      <button className="kp-combobox-toggle" type="button" aria-label={open ? "Close item list" : "Open item list"}
        aria-expanded={open} onPointerDown={(event) => event.preventDefault()}
        onClick={() => { if (open) closePicker(); else { openPicker(); inputRef.current?.focus(); } }}>
        <span aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && <div className="kp-combobox-menu">
        <div id={`${id}-options`} className="kp-combobox-options" role="listbox">
          {matches.map((option, index) => <button id={`${id}-option-${index}`} key={option.id} type="button" role="option"
            aria-selected={String(option.id) === String(value)} className={activeIndex === index ? "active" : ""}
            onMouseEnter={() => setActiveIndex(index)} onPointerDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}>{option.name}</button>)}
        </div>
        {!matches.length && <div className="kp-combobox-empty" role="status">No matching items</div>}
      </div>}
    </div>
    {open && query && <small role="status">{matches.length ? `${matches.length} matching item${matches.length === 1 ? "" : "s"}` : "No matching items"}</small>}
    {hint && <small>{hint}</small>}
  </div>;
}
function Qty({ value, onChange, ...props }) { return <input type="number" min="0" step="any" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...props} />; }
function Table({ columns, rows, empty = "No records yet." }) { return <div className="kp-table"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index}>{row.map((cell, i) => <td key={i}>{cell}</td>)}</tr>) : <tr><td colSpan={columns.length}>{empty}</td></tr>}</tbody></table></div>; }
function Card({ title, subtitle, children }) { return <section className="kp-card"><div className="kp-card-head"><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{children}</section>; }

function Components({ label, items, rows, setRows, outputs = false, actual = false, suggestions = [] }) {
  const update = (index, patch) => setRows(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  return <div className="kp-components"><h4>{label}</h4>
    <Table columns={["Stock item", ...(actual ? ["Suggested"] : []), actual ? "Actual quantity" : "Quantity", "Unit", ...(outputs && !actual ? ["Shared cost weight"] : []), ""]}
      rows={rows.map((row, index) => {
        const item = items.find((entry) => String(entry.id) === String(row.item));
        const units = item ? [item.unit, ...(item.unit === "g" ? ["kg"] : item.unit === "ml" ? ["litre"] : []), ...Object.keys(item.measures || {})] : ["g", "ml", "piece"];
        return [actual ? item?.name || row.name : <Select aria-label={`${label} item ${index + 1}`} value={row.item} options={items} onChange={(id) => update(index, { item: id, unit: items.find((i) => String(i.id) === id)?.unit || "" })} />,
          ...(actual ? [`${fmt(suggestions[index]?.quantity)} ${suggestions[index]?.unit || row.unit}`] : []),
          <Qty aria-label={`${label} quantity ${index + 1}`} value={row.quantity} onChange={(quantity) => update(index, { quantity })} required />,
          actual ? row.unit : <select aria-label={`${label} unit ${index + 1}`} value={row.unit || item?.unit || ""} onChange={(e) => update(index, { unit: e.target.value })}>{units.map((u) => <option key={u}>{u}</option>)}</select>,
          ...(outputs && !actual ? [<Qty aria-label={`Allocation weight ${index + 1}`} value={row.weight} onChange={(weight) => update(index, { weight })} />] : []),
          actual ? null : <button type="button" className="kp-quiet" onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label={`Remove component ${index + 1}`}>Remove</button>];
      })} />
    {!actual && <button className="kp-quiet" type="button" onClick={() => setRows([...rows, blankRow()])}>+ Add component</button>}
  </div>;
}

function Effects({ preview }) {
  if (!preview) return null;
  return <Card title="Posting preview" subtitle="Review the stock movements and carrying values before posting. This preview does not change stock.">
    {preview.shortages?.length > 0 && <div className="kp-banner" role="status">
      <strong>Shortage will be posted to negative stock.</strong>
      <Table columns={["Item", "Location", "Short quantity", "Last known cost", "Estimated cost"]} rows={preview.shortages.map((row) => [row.itemName || row.item_name || row.item, row.locationName || row.location_name || row.location, `${fmt(row.quantity, 6)} ${row.unit}`, `${rupees(row.unit_cost)} / ${row.unit}`, rupees(row.estimated_cost)])} />
      <p>Shortages use the last known carrying cost per base unit. If the item has never had a cost, the estimate is ₹0. Later receipts clear negative stock first; any remaining stock uses the weighted-average cost.</p>
    </div>}
    <Table columns={["Item", "Location", "Movement", "Quantity", "Value"]} rows={(preview.effects || []).map((row) => [row.itemName || row.item, row.locationName || row.location, row.category.replaceAll("_", " "), fmt(row.quantity, 6), rupees(row.value)])} />
    {preview.total_cost && <p>Batch cost <strong>{rupees(preview.total_cost)}</strong> · Separately recognized loss {rupees(preview.loss_cost)}</p>}
  </Card>;
}

export function InventoryStockCount(props) {
  if (props.cloudStateReady === false) return <section className="screen kitchen-workspace"><p role="status">Loading Inventory stock…</p></section>;
  return <ProductionWorkspace {...props} activeView="Stock count" countContext="inventory" />;
}

export function ProductionWorkspace({ storeId, notify = () => {}, activeView = "Production", onViewChange,
  activeReport = "Production reports", onReportChange, canViewBatchProfit = false, countContext = "production", salesLedger = [] }) {
  const { data, error, reload } = useKitchen(storeId);
  const [tab, setTab] = useState(navMap[activeView] || activeView);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);
  const [reportRefresh, setReportRefresh] = useState(0);
  const retained = useRef(null);
  const flight = useRef(false);
  const inventoryCount = countContext === "inventory";
  const logicalKey = inventoryCount ? "inventory-stock-count" : "workspace";
  const countCommand = (command) => inventoryCount && ["start_count", "record_count", "adjust_count"].includes(command) ? "inventory_" + command : command;
  useEffect(() => setTab(navMap[activeView] || (tabs.includes(activeView) ? activeView : "Production")), [activeView]);
  const run = async (command, payload, previewOnly = false, onError = null) => {
    if (flight.current) return null;
    flight.current = true; setBusy(true); setMessage("");
    command = countCommand(command);
    const signature = JSON.stringify({ command, payload });
    if (!retained.current || retained.current.signature !== signature) retained.current = { signature, key: crypto.randomUUID() };
    try {
      const result = previewOnly ? await kitchenCommand(storeId, command, payload, retained.current.key, true)
        : await reliableKitchenCommand(storeId, command, payload, logicalKey);
      if (previewOnly) setPreview({ ...result,
        effects: result.effects.map((e) => ({ ...e, itemName: data.items.find((i) => i.id === e.item)?.name, locationName: data.locations.find((l) => l.id === e.location)?.name })),
        shortages: (result.shortages || []).map((row) => ({ ...row,
          itemName: data.items.find((i) => i.id === row.item)?.name || row.item_name,
          locationName: data.locations.find((l) => l.id === row.location)?.name || row.location_name })) });
      else { retained.current = null; setPreview(null); setMessage("Saved successfully."); notify(inventoryCount ? "Inventory stock count updated" : "Production ledger updated"); await reload().catch(() => setMessage("Saved successfully, but the list could not refresh. Use Refresh to load the saved record.")); }
      return result;
    } catch (err) { setMessage(err.message); onError?.(err); return null; }
    finally { flight.current = false; setBusy(false); }
  };
  const go = (next) => { setTab(next); onViewChange?.(next); setPreview(null); setMessage(""); };
  if (!data) return <section className="screen kitchen-workspace"><h2>Production & prepared stock</h2><p role="status">{error || "Loading the kitchen ledger…"}</p><button onClick={() => reload().catch(() => {})}>Retry</button></section>;
  if (!data.configured) return <section className="screen kitchen-workspace"><Card title="Set up the production ledger" subtitle="Choose the existing branch for this store. Setup preserves legacy data and starts with an opening reconciliation."><SetupBranch data={data} storeId={storeId} reload={reload} /></Card></section>;
  const can = (action) => data.capabilities.includes(countCommand(action));
  const batchProfitOpen = canViewBatchProfit && activeReport === "Batch profitability";
  return <section className="screen kitchen-workspace" aria-busy={busy}>
    <header className="kp-heading"><div><span className="kp-eyebrow">{inventoryCount ? "INVENTORY" : "KITCHEN OPERATIONS"} · {data.branch}</span><h2>{inventoryCount ? "Inventory items" : "Production & prepared stock"}</h2><p>{inventoryCount ? "View Product Master items, edit stock quantities, or take a full stock count." : "Actual batch yields. Independent serving portions. One stock ledger."}</p></div><button className="kp-quiet" onClick={() => { reload().catch(() => {}); if (tab === "Reports") setReportRefresh((revision) => revision + 1); }}>Refresh</button></header>
    {!data.enabled && <div className="kp-banner">Opening reconciliation is in progress. Production posting and serving will start after activation. <button onClick={() => go("Setup")}>Review setup</button></div>}
    {error && <p className="kp-error" role="alert">{error}</p>}
    {pendingKitchenCommand(storeId, logicalKey) && <div className="kp-banner">A stock request needs acknowledgement. Recover the saved request before starting another action. <button disabled={busy} onClick={async () => { setBusy(true); try { await resumeKitchenCommand(storeId, logicalKey); await reload(); setMessage("Saved request recovered. Review the updated ledger before posting anything else."); } catch (e) { setMessage(e.message); } finally { setBusy(false); } }}>Recover saved request</button></div>}
    {!inventoryCount && <nav className="kp-tabs" aria-label="Production workspace">{tabs.map((name) => <button key={name} className={name === tab ? "active" : ""} onClick={() => go(name)}>{name}</button>)}</nav>}
    {message && <p className="kp-message" role="status">{message}</p>}
    <fieldset className="kp-work" disabled={busy}>
      {tab === "Production" && <BatchEntry data={data} run={run} can={can} onSaved={() => go("Batches")} onRecipes={() => go("Recipes")} clearPreview={() => setPreview(null)} />}
      {tab === "Batches" && <BatchList data={data} run={run} can={can} storeId={storeId} />}
      {tab === "Stock" && <StockView data={data} run={run} can={can} onCount={() => go("Stock count")} />}
      {tab === "Recipes" && <RecipeEditor data={data} run={run} can={can} message={message} onSetup={() => go("Setup")} />}
      {tab === "Servings" && <ServingEditor data={data} run={run} can={can} />}
      {tab === "Service" && <ServiceEntry data={data} run={run} can={can} />}
      {tab === "Usage" && <UsageEntry data={data} run={run} can={can} />}
      {tab === "Stock count" && (inventoryCount ? <InventoryItemsBrowser data={data} run={run} can={can} storeId={storeId} /> : <ClosingEntry data={data} run={run} can={can} storeId={storeId} scope={countContext} />)}
      {tab === "Reports" && <>
        {canViewBatchProfit && <div className="kp-tabs kp-report-tabs" role="group" aria-label="Production reports">
          <button type="button" className={!batchProfitOpen ? "active" : ""} aria-pressed={!batchProfitOpen}
            onClick={() => onReportChange?.("Production reports")}>Daily reports</button>
          <button type="button" className={batchProfitOpen ? "active" : ""} aria-pressed={batchProfitOpen}
            onClick={() => onReportChange?.("Batch profitability")}>Batch profitability</button>
        </div>}
        {batchProfitOpen
          ? <BatchProfitReport storeId={storeId} reportRefresh={reportRefresh}
              initialDay={data.batches.find((batch) => batch.status === "posted")?.date} />
          : <Reports data={data} storeId={storeId} salesLedger={salesLedger} reportRefresh={reportRefresh} />}
      </>}
      {tab === "Setup" && <Setup data={data} run={run} can={can} />}
    </fieldset>
    <Effects preview={preview} />
  </section>;
}

function SetupBranch({ data, storeId, reload }) {
  const [branch, setBranch] = useState(""); const [error, setError] = useState("");
  return <form className="kp-form" onSubmit={async (e) => { e.preventDefault(); try { await setupKitchen(storeId, branch); await reload(); } catch (err) { setError(err.message); } }}>
    <Field label="Branch"><Select value={branch} onChange={setBranch} options={data.branches.map((b) => ({ ...b, name: `${b.restaurant__name} / ${b.name}` }))} required /></Field>
    <button type="submit">Create branch ledger</button>{error && <p role="alert">{error}</p>}
  </form>;
}

function OutputItemForm({ run }) {
  const blank = { name: "", kind: "prepared", base_unit: "g", measures: {} };
  const [output, setOutput] = useState(blank);
  return <details>
    <summary>Create output stock item</summary>
    <p className="kp-help">Save the item, then select it under Expected good outputs.</p>
    <form onSubmit={async (event) => {
      event.preventDefault();
      const name = output.name.trim();
      if (name && await run("item", { ...output, name })) setOutput(blank);
    }}>
      <div className="kp-form">
        <Field label="Output name"><input value={output.name} onChange={(event) => setOutput({ ...output, name: event.target.value })} required /></Field>
        <Field label="Output type">
          <select value={output.kind} onChange={(event) => setOutput({ ...output, kind: event.target.value })}>
            <option value="prepared">Prepared</option><option value="intermediate">Intermediate</option>
          </select>
        </Field>
        <Field label="Output stock unit">
          <select value={output.base_unit} onChange={(event) => setOutput({ ...output, base_unit: event.target.value })}>
            <option value="g">g — weight</option><option value="ml">ml — volume</option><option value="piece">piece — whole count</option>
          </select>
        </Field>
      </div>
      <button type="submit" disabled={!output.name.trim()}>Save output item</button>
    </form>
  </details>;
}

function RecipeEditor({ data, run, can, message, onSetup }) {
  let storage = null;
  try { if (typeof window !== "undefined") storage = window.sessionStorage; } catch {}
  const [draft, setDraft] = useState(() => loadProductionRecipeDraft(storage, data.storeId));
  const [validation, setValidation] = useState("");
  const [saved, setSaved] = useState("");
  const nameInput = useRef(null);
  useEffect(() => { if (draft) nameInput.current?.focus(); }, [draft?.key]);
  const keepDraft = (next) => { saveProductionRecipeDraft(storage, data.storeId, next); setDraft(next); };
  const choose = (next) => { keepDraft(next); setValidation(""); setSaved(""); };
  const change = (field, value) => { keepDraft({ ...draft, [field]: value }); setValidation(""); setSaved(""); };
  return <Card title="Production recipes" subtitle="The standard batch supplies planning suggestions. Actual ingredients and actual good output are confirmed when the batch is posted.">
    <div className="kp-toolbar"><Select aria-label="Existing production recipe" placeholder="Choose a saved recipe…" value={draft?.expected_version ? draft.key : ""} options={data.recipes.map((r) => ({ id: r.key, name: `${r.name} · v${r.version}` }))} onChange={(key) => { const r = data.recipes.find((r) => r.key === key); choose(r ? { ...r, expected_version: r.version } : null); }} /><button type="button" disabled={!can("recipe")} onClick={() => choose(newProductionRecipe())}>New recipe</button></div>
    {!draft && <p className="kp-help">{data.recipes.length ? "Choose a saved recipe to view it, or select New recipe to add ingredients and expected output." : "No production recipes yet. Select New recipe to add your own ingredients and expected output."}</p>}
    {!can("recipe") && <p className="kp-help">Your account can view recipes. Recipe editing requires production recipe permission.</p>}
    {saved && <p className="kp-message" role="status">{saved}</p>}
    {draft && can("item") && <OutputItemForm run={run} />}
    {draft && <form id="production-recipe-form" onSubmit={async (e) => {
      e.preventDefault(); setValidation(""); setSaved("");
      let payload;
      try { payload = productionRecipePayload(draft); } catch (err) { setValidation(err.message); return; }
      const result = await run("recipe", payload);
      if (result) { keepDraft(draft.expected_version ? { ...result, expected_version: result.version } : null); setSaved(`${result.name} saved · version ${result.version}. You can now select it in Production.`); }
    }}>
      <div className="kp-recipe-actions"><strong>{draft.expected_version ? `Edit recipe · version ${draft.expected_version}` : "New recipe"}</strong><div><button type="button" className="kp-quiet" onClick={() => choose(null)}>Cancel</button><button disabled={!can("recipe")} type="submit">{draft.expected_version ? "Save new version" : "Save recipe"}</button></div></div>
      {validation && <p className="kp-error" role="alert">{validation}</p>}
      {!saved && message && message !== "Saved successfully." && <p className="kp-error" role="alert">{message}</p>}
      <Field label="Recipe name"><input ref={nameInput} placeholder="Enter your recipe name" value={draft.name} onChange={(e) => change("name", e.target.value)} required /></Field>
      {!data.items.some((item) => item.production_consumption !== false) && <p className="kp-banner">Add your raw ingredients in Setup before saving this recipe. <button type="button" onClick={onSetup}>Open stock item setup</button></p>}
      <Components label="Standard ingredients" items={data.items.filter((item) => item.production_consumption !== false)} rows={draft.inputs} setRows={(rows) => change("inputs", rows)} />
      <Components label="Expected good outputs" items={data.items.filter((i) => i.kind !== "raw")} rows={draft.outputs} setRows={(rows) => change("outputs", rows)} outputs />
      <p className="kp-help">Measure each output separately without counting the same contents twice. Cost weights allocate shared costs proportionally; grams and pieces are never added together.</p>
      <div className="kp-form"><Field label="Preparation instructions"><textarea value={draft.instructions} onChange={(e) => change("instructions", e.target.value)} /></Field><Field label="Normal-loss reference (optional)"><input value={draft.normal_loss_reference} onChange={(e) => change("normal_loss_reference", e.target.value)} /></Field></div>
      <button disabled={!can("recipe")} type="submit">{draft.expected_version ? "Save new version" : "Save recipe"}</button>
    </form>}
  </Card>;
}

function estimateServingIngredients(data, components) {
  const ingredients = new Map();
  const unavailable = new Set();
  for (const component of components) {
    const quantity = Number(component.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !component.item) continue;
    const item = data.items.find((entry) => String(entry.id) === String(component.item));
    if (!item) continue;
    const recipes = data.recipes.filter((recipe) => recipe.outputs.some((output) => String(output.item) === String(item.id)));
    const unit = component.unit || item.unit;
    let factor = Number(item.measures?.[unit]);
    if (unit === item.unit) factor = 1;
    else if ((unit === "kg" && item.unit === "g") || (unit === "litre" && item.unit === "ml")) factor = 1000;
    const output = recipes.length === 1 && recipes[0].outputs.length === 1 ? recipes[0].outputs[0] : null;
    if (!output || output.unit !== item.unit || !(Number(output.quantity) > 0) || !Number.isFinite(factor) || factor <= 0) {
      unavailable.add(item.name);
      continue;
    }
    const share = quantity * factor / Number(output.quantity);
    for (const input of recipes[0].inputs) {
      const key = input.item + ":" + input.unit;
      const amount = Number(input.quantity) * share;
      const row = ingredients.get(key);
      if (row) row.amount += amount;
      else ingredients.set(key, { name: input.name, unit: input.unit, amount });
    }
  }
  const rows = [...ingredients.values()];
  const totals = new Map();
  for (const row of rows) totals.set(row.unit, (totals.get(row.unit) || 0) + row.amount);
  return { rows, totals: [...totals], unavailable: [...unavailable] };
}

function ServingIngredientBreakdown({ data, components }) {
  const { rows, totals, unavailable } = estimateServingIngredients(data, components);
  return <div className="kp-components">
    <h4>Estimated ingredients for one serving</h4>
    {rows.length > 0 && <>
      <p className="kp-help">Based on the recipe's expected yield. These are estimated recipe inputs. Serving uses the prepared stock quantity above.</p>
      <Table columns={["Ingredient", "Estimated quantity", "Unit"]} rows={rows.map((row) => [row.name, fmt(row.amount), row.unit])} />
      <p className="kp-help"><strong>Total shown</strong> {totals.map(([unit, amount]) => fmt(amount) + " " + unit).join(" + ")}</p>
    </>}
    {!rows.length && !unavailable.length && <p className="kp-help">Select a prepared stock item and enter the serving quantity to see its ingredients.</p>}
    {unavailable.length > 0 && <p className="kp-help">A breakdown requires one saved recipe with a single output. Unavailable for {unavailable.join(", ")}.</p>}
  </div>;
}


function servingComponentOptions(data) {
  const products = new Map(data.inventory.map((product) => [String(product.id), product]));
  return data.items.filter((item) => {
    const product = products.get(String(item.legacy_key));
    return ["prepared", "intermediate", "resale"].includes(item.kind)
      && isProductEnabled(product)
      && isProductEnabled(products.get(String(product?.parentProductId)));
  });
}

function ServingEditor({ data, run, can }) {
  const blank = { key: "", name: "", components: [blankRow()], expected_version: 0 };
  const [draft, setDraft] = useState(null);
  const change = (field, value) => setDraft((current) => ({ ...current, [field]: value }));
  const componentItems = servingComponentOptions(data);
  const componentIds = new Set(componentItems.map((item) => String(item.id)));
  const canSave = can("recipe") && Boolean(draft?.components.length) && draft.components.every((row) => {
    const quantity = Number(row.quantity);
    return componentIds.has(String(row.item)) && Number.isFinite(quantity) && quantity > 0;
  });
  const selectSavedServing = (key) => {
    const saved = data.servings.find((serving) => serving.key === key);
    if (!saved) {
      setDraft(null);
      return;
    }
    const components = saved.method === "prepared" ? saved.components : [blankRow()];
    setDraft({ ...saved, components, expected_version: saved.version });
  };

  // Keep the existing POS menu ID when saving a new version of a serving.
  let storedMenu = [];
  try { storedMenu = JSON.parse(window.localStorage.getItem(`vestora-menu-items-${data.storeId || ""}`) || "[]"); } catch {}
  const menu = data.menu || storedMenu;
  return <Card title="Menu serving portions" subtitle="Set how much prepared stock each full, half, extra or combo serving uses.">
    <div className="kp-toolbar">
      <Select aria-label="Existing serving recipe" placeholder="Choose a saved serving…" value={draft?.key || ""}
        options={data.servings.map((serving) => ({ id: serving.key, name: `${serving.name} · v${serving.version}` }))}
        onChange={selectSavedServing} />
      <button type="button" className="kp-quiet" onClick={() => setDraft(blank)}>New serving</button>
    </div>
    {draft && <form onSubmit={async (event) => {
      event.preventDefault();
      if (!canSave) return;
      const result = await run("recipe", { ...draft, kind: "serving", stock_method: "prepared" });
      if (result) setDraft(null);
    }}>
      <div className="kp-form">
        <Field label="Menu item / variant">
          <Select value={draft.key} onChange={(key) => {
            const item = menu.find((entry) => String(entry.id) === key);
            setDraft({ ...blank, key, name: item?.name || "" });
          }} options={menu.map((item) => ({ id: item.id, name: item.name }))} />
        </Field>
        <Field label="Stable menu / variant ID" hint="Use the existing product or menu ID, including for an independently sold variant.">
          <input value={draft.key} onChange={(event) => change("key", event.target.value)} required />
        </Field>
        <Field label="Serving name">
          <input value={draft.name} onChange={(event) => change("name", event.target.value)} required />
        </Field>
        <Field label="Stock method"><input value="Serve from prepared stock" readOnly /></Field>
      </div>
      {draft.method && draft.method !== "prepared" && <p className="kp-banner" role="status">
        Choose the cooked stock item and quantity per serving. Save a new version to use it in the POS.
      </p>}
      <Components label="Components for one serving" items={componentItems} rows={draft.components}
        setRows={(components) => change("components", components)} />
      <ServingIngredientBreakdown data={data} components={draft.components} />
      <p className="kp-help">Zero-priced extras still consume their components. Include tracked accompaniments and packaging. Existing confirmed order snapshots keep their saved portions.</p>
      <button type="submit" disabled={!canSave}>Save serving version</button>
    </form>}
  </Card>;
}

const newBatchReferenceSuffix = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();

function BatchEntry({ data, run, can, onSaved, onRecipes, clearPreview }) {
  const kitchen = data.locations.find((l) => l.name === "Kitchen")?.id || data.locations[0]?.id || "";
  const [plan, setPlan] = useState({ recipe: "", reference: null, scale: "1", business_date: today(), shift: "", parent_reference: "" });
  const [referenceSuffix, setReferenceSuffix] = useState(newBatchReferenceSuffix);
  const batchReference = plan.reference ?? ["BATCH", plan.business_date.replaceAll("-", ""), referenceSuffix].join("-");
  const [selected, setSelected] = useState(null);
  const [actual, setActual] = useState({ inputs: [], outputs: [], rejects: [], leftovers: [], notes: "", process_loss: "", disposition: "", overhead: "0", abnormal_loss_cost: "0" });
  const [confirmed, setConfirmed] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scaleMode, setScaleMode] = useState("multiplier");
  const selectedRecipe = data.recipes.find((r) => String(r.id) === String(plan.recipe));
  const openDraft = (batch) => {
    setSelected(batch); setConfirmed(false); setReviewed(false); setPreviewError(""); setExpiry("");
    const scaled = (rows) => rows.map((r) => ({ ...r, quantity: String(Number(r.quantity) * Number(batch.scale)) }));
    setActual({ inputs: scaled(batch.recipe.inputs), outputs: scaled(batch.recipe.outputs).map((r) => ({ ...r, quantity: "" })), rejects: [], leftovers: [], notes: "", process_loss: "", disposition: "", overhead: "0", abnormal_loss_cost: "0" });
  };
  const change = (field, value) => { setActual((a) => ({ ...a, [field]: value })); setReviewed(false); clearPreview(); };
  const payload = () => ({ ...actual, batch: selected.id, business_date: selected.date, expires_at: expiry ? Object.fromEntries(actual.outputs.map((r) => [r.item, new Date(expiry).toISOString()])) : {} });
  return <>
    <Card title="Plan a batch" subtitle="Drafts do not move stock. For staged cooking, create separately measured completed sub-batches with the same parent reference.">
      {!data.recipes.length && <p className="kp-banner" role="status">No saved production recipe is available. Open Recipes to finish and save your recipe, then return here. Serving portions are saved separately. <button type="button" onClick={onRecipes}>Open Recipes</button></p>}
      {!kitchen && <p className="kp-banner" role="status">Add a stock location in Setup before saving a batch.</p>}
      <form onSubmit={async (e) => {
        e.preventDefault();
        if (!kitchen) return;
        const payload = {
          ...plan,
          reference: batchReference.trim(),
          source_location: kitchen,
          destination_location: kitchen,
          scale_item: scaleMode === "multiplier" ? null : plan.scale_item,
          scale_basis: scaleMode,
        };
        const r = await run("draft_batch", payload);
        if (!r) return;
        openDraft({ id: r.id, recipe: r.snapshot, scale: r.scale, date: payload.business_date, reference: payload.reference });
        setPlan((current) => ({ ...current, reference: null }));
        setReferenceSuffix(newBatchReferenceSuffix());
      }}>
        <div className="kp-form"><Field label="Production recipe"><Select value={plan.recipe} onChange={(recipe) => setPlan({ ...plan, recipe })} options={data.recipes} required /></Field><Field label="Batch reference"><input value={batchReference} onChange={(e) => setPlan({ ...plan, reference: e.target.value })} maxLength={120} required /></Field><Field label="Standard batch multiplier"><Qty value={plan.scale} onChange={(scale) => setPlan({ ...plan, scale })} required /></Field><Field label="Business date"><input type="date" value={plan.business_date} onChange={(e) => setPlan({ ...plan, business_date: e.target.value })} required /></Field><Field label="Shift"><input value={plan.shift} onChange={(e) => setPlan({ ...plan, shift: e.target.value })} /></Field><Field label="Parent run (optional)"><input value={plan.parent_reference} onChange={(e) => setPlan({ ...plan, parent_reference: e.target.value })} /></Field></div>
        <details><summary>Plan by raw input or target good output</summary><div className="kp-form"><Field label="Scaling basis"><select value={scaleMode} onChange={(e) => { setScaleMode(e.target.value); setPlan({ ...plan, scale_item: "", scale_quantity: "", scale_unit: "" }); }}><option value="multiplier">Standard batch multiplier</option><option value="inputs">Explicit ingredient input</option><option value="outputs">Target good output</option></select></Field>{scaleMode !== "multiplier" && <><Field label={scaleMode === "inputs" ? "Input ingredient" : "Target output"}><Select value={plan.scale_item || ""} onChange={(scale_item) => setPlan({ ...plan, scale_item, scale_unit: data.items.find((i) => String(i.id) === scale_item)?.unit })} options={(selectedRecipe?.[scaleMode] || []).map((r) => ({ id: r.item, name: `${r.name} (${r.unit})` }))} required /></Field><Field label={`Planned quantity (${plan.scale_unit || "base unit"})`}><Qty value={plan.scale_quantity || ""} onChange={(scale_quantity) => setPlan({ ...plan, scale_quantity })} required /></Field></>}</div></details>
        <button disabled={!kitchen || !can("draft_batch")}>Save draft & enter actuals</button>
      </form>
      <div className="kp-toolbar"><span>Resume a draft</span><Select value={selected?.id || ""} onChange={(id) => { const b = data.batches.find((b) => String(b.id) === id); if (b) openDraft(b); }} options={data.batches.filter((b) => b.status === "draft").map((b) => ({ id: b.id, name: `${b.reference} · ${b.recipe.name}` }))} /></div>
    </Card>
    {selected && <Card title={`Actual production · ${selected.reference}`} subtitle="Confirm what was physically consumed and measure good output. Changing output never changes the ingredients below.">
      <form onSubmit={async (e) => { e.preventDefault(); if (reviewed && confirmed) { const r = await run("post_batch", payload()); if (r) { setSelected(null); onSaved(); } } }}>
        <Components label="Actual ingredients consumed" items={data.items} rows={actual.inputs} setRows={(r) => change("inputs", r)} actual suggestions={selected.recipe.inputs.map((r) => ({ ...r, quantity: Number(r.quantity) * Number(selected.scale) }))} />
        <Components label="Actual good outputs" items={data.items} rows={actual.outputs} setRows={(r) => change("outputs", r)} actual suggestions={selected.recipe.outputs.map((r) => ({ ...r, quantity: Number(r.quantity) * Number(selected.scale) }))} />
        <p className="kp-help">Measure actual ingredients consumed and good output separately. Unused ingredients remain in source stock. Only confirmed good output enters prepared stock.</p>
        <div className="kp-form"><Field label="Expiry (optional)"><input type="datetime-local" value={expiry} onChange={(e) => { setExpiry(e.target.value); setReviewed(false); }} /></Field><Field label="Process-loss observations"><input value={actual.process_loss} onChange={(e) => change("process_loss", e.target.value)} placeholder="Evaporation, size variation, spillage…" /></Field><Field label="Notes"><input value={actual.notes} onChange={(e) => change("notes", e.target.value)} /></Field></div>
        <details><summary>Rejects, leftovers and approved cost allocation</summary>
          <Components label="Rejected output (not received)" items={data.items} rows={actual.rejects} setRows={(r) => change("rejects", r)} />
          <Components label="Unused ingredients observed (remain in source stock)" items={data.items} rows={actual.leftovers} setRows={(r) => change("leftovers", r)} />
          <div className="kp-form"><Field label="Approved overhead"><Qty value={actual.overhead} onChange={(v) => change("overhead", v)} disabled={!data.overhead_allowed} /></Field><Field label="Separately expensed abnormal loss"><Qty value={actual.abnormal_loss_cost} onChange={(v) => change("abnormal_loss_cost", v)} /></Field><Field label="Failed batch / loss disposition"><input value={actual.disposition} onChange={(e) => change("disposition", e.target.value)} placeholder="Required for zero good output or abnormal loss" /></Field></div>
          <p className="kp-help">Normal rejects are absorbed in good-output cost. Do not expense the same loss twice. Recoverable cooked material must be a configured output.</p>
          {selected.recipe.outputs.length > 1 && <div className="kp-form">{selected.recipe.outputs.map((row) => <Field key={row.item} label={`Direct cost assigned to ${row.name} ₹`} hint="The remaining cost follows the recipe's shared cost weights."><Qty value={actual.direct_costs?.[row.item] || "0"} onChange={(value) => change("direct_costs", { ...actual.direct_costs, [row.item]: value })} /></Field>)}</div>}
        </details>
        <label className="kp-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirmed actual ingredients and measured good outputs.</label>
        <div className="kp-toolbar"><button type="button" disabled={!can("post_batch") || !confirmed} onClick={async () => { setPreviewError(""); const r = await run("post_batch", payload(), true, (err) => setPreviewError(err.message)); setReviewed(Boolean(r)); }}>Preview stock & cost</button><button type="submit" disabled={!can("post_batch") || !reviewed || !confirmed || !data.enabled}>Post completed batch</button></div>
        {previewError && <p className="kp-error" role="alert">Preview failed: {previewError}</p>}
      </form>
    </Card>}
  </>;
}

function ServiceEntry({ data, run, can }) {
  const [reference, setReference] = useState(""); const [targets, setTargets] = useState({}); const [quantities, setQuantities] = useState({}); const [refreshRecipe, setRefreshRecipe] = useState(false); const [reason, setReason] = useState("");
  const order = data.orders.find((o) => o.reference === reference);
  const select = (value) => { setReference(value); const o = data.orders.find((o) => o.reference === value); setTargets(Object.fromEntries((o?.lines || []).map((l) => [l.key, l.fulfilled]))); setQuantities(Object.fromEntries((o?.lines || []).map((l) => [l.key, l.quantity]))); };
  return <Card title="Confirmed orders & partial service" subtitle="Reservations and service use the same saved portions. Enter the cumulative number actually served, including previous service, to prevent duplicate consumption.">
    <Field label="Confirmed order"><Select value={reference} onChange={select} options={data.orders.map((o) => ({ id: o.reference, name: o.reference }))} /></Field>
    {order && <><Table columns={["Line / recipe version", "Ordered", "Already served", "Cancelled", "Cumulative served target", "Amended total quantity"]} rows={order.lines.map((line) => [`${line.snapshot.name} · v${line.snapshot.version}`, fmt(line.quantity), fmt(line.fulfilled), fmt(line.cancelled), <Qty aria-label={`Served target ${line.snapshot.name}`} value={targets[line.key] ?? line.fulfilled} onChange={(value) => setTargets({ ...targets, [line.key]: value })} />, <Qty aria-label={`Amended quantity ${line.snapshot.name}`} value={quantities[line.key] ?? line.quantity} onChange={(value) => setQuantities({ ...quantities, [line.key]: value })} />])} />
      <button disabled={!can("fulfill")} onClick={() => run("fulfill", { reference, targets, source: `partial-service:${reference}` })}>Post actual service</button>
      <details><summary>Amend or reallocate unserved quantities</summary><p>Already served quantities remain unchanged. Reallocation keeps the saved recipe unless you explicitly apply the latest version. A partially served line needs a new line to change its recipe.</p><label className="kp-check"><input type="checkbox" checked={refreshRecipe} onChange={(e) => setRefreshRecipe(e.target.checked)} />Apply the latest serving recipe to wholly unserved lines</label><button disabled={!can("confirm")} onClick={() => run("confirm", { reference, location: order.location, lines: order.lines.filter((l) => Number(l.quantity) > Number(l.fulfilled) + Number(l.cancelled)).map((l) => ({ key: l.key, menu_key: l.menu_key, quantity: quantities[l.key] ?? l.quantity, expected_revision: l.revision, reallocate: true, refresh_recipe: refreshRecipe })) })}>Update reservations safely</button></details>
      <Field label="Cancellation reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field><button className="kp-quiet" disabled={!can("cancel") || !reason.trim()} onClick={() => run("cancel", { reference, reason, disposition: "no_return" })}>Cancel unserved remainder; no food returned</button>
    </>}
  </Card>;
}

function BatchList({ data, run, can, storeId }) {
  const [id, setId] = useState(null); const [history, setHistory] = useState([]); const [reason, setReason] = useState(""); const [noUse, setNoUse] = useState(false);
  const batch = data.batches.find((b) => b.id === id);
  return <><Card title="Batch history" subtitle="Each batch keeps its original recipe, actual inputs, good outputs and allocated costs.">
    <Table columns={["Reference", "Date / shift", "Recipe", "Status", "Batch cost", ""]} rows={data.batches.map((b) => [b.reference, `${b.date} ${b.shift}`, `${b.recipe.name} · v${b.recipe.version}`, b.status, b.actual.total_cost ? rupees(b.actual.total_cost) : "—", <button className="kp-quiet" onClick={async () => { setId(b.id); try { const r = await loadKitchenReport(storeId, b.date, b.id); setHistory(r.trace || []); } catch { setHistory([]); } }}>View</button>])} />
  </Card>{batch && <Card title={batch.reference} subtitle={batch.comparison_basis}>
    <h4>Ingredient usage</h4><Table columns={["Ingredient", "Scaled standard", "Actual", "Difference"]} rows={batch.input_comparison.map((r) => [r.name, `${fmt(r.standard_scaled)} ${r.unit}`, `${fmt(r.actual)} ${r.unit}`, fmt(r.difference)])} />
    <h4>Good output & yield variation</h4><Table columns={["Output", "Expected", "Actual", "Difference", "Allocated cost", "Unit cost"]} rows={batch.output_comparison.map((r) => { const actual = batch.actual.outputs?.find((o) => o.item === r.item); return [r.name, `${fmt(r.standard_scaled)} ${r.unit}`, fmt(r.actual), fmt(r.difference), rupees(actual?.cost), rupees(actual?.unit_cost)]; })} />
    <p>{batch.actual.notes} {batch.actual.process_loss} {batch.actual.disposition}</p>
    <h4>Trace: receipts, serving, transfers and corrections</h4><Table columns={["Date", "Source", "Movement", "Location", "Quantity", "Value"]} rows={history.map((r) => [r.transaction__business_date, r.transaction__source, r.category, r.balance__location__name, fmt(r.quantity), rupees(r.value)])} />
    {batch.transaction && can("reverse") && <details><summary>Correct a genuine posting error</summary><p>Used outputs, reservations and downstream movements must be resolved first. Cooking losses belong in actual batch disposition or waste.</p><Field label="Correction reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field><label className="kp-check"><input type="checkbox" checked={noUse} onChange={(e) => setNoUse(e.target.checked)} />No physical consumption occurred; this was a posting error.</label><button disabled={!reason.trim() || !noUse} onClick={() => run("reverse", { transaction: batch.transaction, reason, no_physical_consumption: noUse })}>Post linked reversal</button></details>}
  </Card>}</>;
}

function StockView({ data, run, can, onCount }) {
  const [location, setLocation] = useState("");
  const balances = data.stock.balances.filter((b) => !location || String(b.location) === location);
  return <><Card title="Prepared stock & ingredients" subtitle="On hand includes held stock. Available excludes reservations, expired lots and quarantined lots.">
    <div className="kp-toolbar"><button type="button" onClick={onCount}>Correct stock or take a full count</button></div>
    <Field label="Kitchen / stock location"><Select value={location} onChange={setLocation} options={data.locations} placeholder="All locations" /></Field>
    <Table columns={["Item / lot", "Location", "Total contents", "Unopened packs", "Loose / unverified", "Reserved", "Available", "Carrying value", "Expiry / status", ""]} rows={balances.map((b) => [<><strong>{b.name}</strong><small>{b.reference}</small></>, b.location_name, `${fmt(b.on_hand)} ${b.unit}`, b.pack_verified ? fmt(b.unopened_packs, 0) : b.pack_tracking_required ? "Unverified" : "—", `${fmt(b.loose_quantity)} ${b.unit}`, fmt(b.reserved), fmt(b.available), rupees(b.value), `${b.expires_at ? new Date(b.expires_at).toLocaleString() : "No expiry"} · ${b.quarantined ? "Quarantined" : b.usable ? "Usable" : "Expired"}`, can("quarantine") ? <button className="kp-quiet" onClick={() => { const reason = window.prompt(b.quarantined ? "Reason to release this lot" : "Quarantine reason"); if (reason) run("quarantine", { lot: b.lot, quarantined: !b.quarantined, reason }); }}>{b.quarantined ? "Release" : "Quarantine"}</button> : null])} />
  </Card><Card title="Menu availability" subtitle={data.stock.note}>
    <Table columns={["Serving", "Location", "Available servings", "Estimated component cost", "Stock method"]} rows={data.stock.servings.filter((s) => !location || String(s.location) === location).map((s) => [s.name, data.locations.find((l) => l.id === s.location)?.name, s.available_servings ?? "Non-stock", s.estimated_component_cost == null ? "Cost pending" : rupees(s.estimated_component_cost), s.method.replaceAll("_", " ")])} />
    <p className="kp-help">Configured portions are estimates unless each portion was measured. Ingredient and cooked-stock balances retain their recorded units.</p>
  </Card></>;
}

function UsageEntry({ data, run, can }) {
  const [draft, setDraft] = useState({ category: "waste", location: "", destination: "", item: "", quantity: "", unit: "", reason: "", source: "", business_date: today(), selected_lots: [] });
  const [outcome, setOutcome] = useState({ fulfillment: "", outcome: "no_return", reason: "", location: "", returns: [] });
  const item = data.items.find((i) => String(i.id) === String(draft.item));
  const change = (field, value) => setDraft((d) => ({ ...d, [field]: value }));
  return <><Card title="Waste, other usage & transfers" subtitle="Use this for stock that has not already been consumed through POS fulfillment. A transfer moves quantity and value between locations.">
    <form onSubmit={async (e) => { e.preventDefault(); const result = await run("usage", draft); if (result) setDraft({ ...draft, quantity: "", source: "", reason: "" }); }}>
      <div className="kp-form"><Field label="Movement"><select value={draft.category} onChange={(e) => change("category", e.target.value)}>{["waste", "staff_meal", "complimentary", "sample", "remake", "transfer", "supplier_return"].map((c) => <option key={c} value={c}>{c.replaceAll("_", " ")}</option>)}</select></Field><Field label="From location"><Select value={draft.location} onChange={(v) => change("location", v)} options={data.locations} required /></Field>{draft.category === "transfer" && <Field label="To location"><Select value={draft.destination} onChange={(v) => change("destination", v)} options={data.locations} required /></Field>}<Field label="Stock item"><Select value={draft.item} onChange={(v) => setDraft((d) => ({ ...d, item: v, unit: data.items.find((i) => String(i.id) === v)?.unit || "", selected_lots: [] }))} options={data.items} required /></Field><Field label="Movement unit" hint="Choose the pack unit for unopened packs; choose g or ml for measured contents."><select value={draft.unit} onChange={(e) => change("unit", e.target.value)}>{[...new Set([item?.unit, ...(item?.unit === "g" ? ["kg"] : item?.unit === "ml" ? ["litre"] : []), ...Object.keys(item?.measures || {})])].filter(Boolean).map((unit) => <option key={unit}>{unit}</option>)}</select></Field><Field label={`Quantity (${draft.unit || "base unit"})`}><Qty value={draft.quantity} onChange={(v) => change("quantity", v)} required /></Field><Field label="Batch selection (optional)"><select value={draft.selected_lots[0] || ""} onChange={(e) => change("selected_lots", e.target.value ? [e.target.value] : [])}><option value="">Use {data.allocation_policy}</option>{data.stock.balances.filter((b) => String(b.item) === String(draft.item) && String(b.location) === String(draft.location)).map((b) => <option key={b.lot} value={b.lot}>{b.reference} · {fmt(b.available)} {b.unit}</option>)}</select></Field><Field label="Source reference" hint="For a remake, include the original order reference and a new remake number."><input value={draft.source} onChange={(e) => change("source", e.target.value)} required /></Field><Field label="Reason"><input value={draft.reason} onChange={(e) => change("reason", e.target.value)} required /></Field><Field label="Business date"><input type="date" value={draft.business_date} onChange={(e) => change("business_date", e.target.value)} required /></Field></div>
      <div className="kp-toolbar"><button type="button" disabled={!can("usage")} onClick={() => run("usage", draft, true)}>Preview</button><button disabled={!can("usage") || !data.enabled}>Post movement</button></div>
    </form>
  </Card><Card title="Returns & disposition of fulfilled stock" subtitle="A financial refund does not restore food. Recording waste here does not deduct it again.">
    <form onSubmit={(e) => { e.preventDefault(); run("disposition", outcome); }}><div className="kp-form"><Field label="Fulfillment record number" hint="Find the fulfillment number in the component consumption report."><input value={outcome.fulfillment} onChange={(e) => setOutcome({ ...outcome, fulfillment: e.target.value })} required /></Field><Field label="Actual disposition"><select value={outcome.outcome} onChange={(e) => setOutcome({ ...outcome, outcome: e.target.value })}><option value="no_return">No physical return</option><option value="waste">Already consumed food classified as waste</option><option value="usable_return">Controlled usable return</option></select></Field><Field label="Reason"><input value={outcome.reason} onChange={(e) => setOutcome({ ...outcome, reason: e.target.value })} required /></Field></div>
      {outcome.outcome === "usable_return" && <><Field label="Return to"><Select value={outcome.location} onChange={(location) => setOutcome({ ...outcome, location })} options={data.locations} required /></Field><p>Use original movement numbers from the fulfillment allocations. Return only measured, usable stock in the original base unit. Count inspected unopened packs separately; opened goods never become saleable packs.</p>{outcome.returns.map((r, i) => <div className="kp-form" key={i}><Field label="Original movement"><input value={r.movement} onChange={(e) => setOutcome({ ...outcome, returns: outcome.returns.map((x, j) => i === j ? { ...x, movement: e.target.value } : x) })} required /></Field><Field label="Recoverable quantity"><Qty value={r.quantity} onChange={(quantity) => setOutcome({ ...outcome, returns: outcome.returns.map((x, j) => i === j ? { ...x, quantity } : x) })} required /></Field><Field label="Unopened packs returned" hint="0 for all loose contents. Must be part of the original sealed sale."><Qty step="1" value={r.sealed_packages ?? 0} onChange={(sealed_packages) => setOutcome({ ...outcome, returns: outcome.returns.map((x, j) => i === j ? { ...x, sealed_packages } : x) })} /></Field></div>)}<button type="button" className="kp-quiet" onClick={() => setOutcome({ ...outcome, returns: [...outcome.returns, { movement: "", quantity: "" }] })}>+ Return allocation</button></>}
      <button disabled={!can("disposition")}>Record disposition</button></form>
  </Card></>;
}

function InventoryItemsBrowser({ data, run, can, storeId }) {
  const [location, setLocation] = useState(() => String((data.locations.find((entry) => entry.name === "Main store") || data.locations[0])?.id || ""));
  const [editor, setEditor] = useState(null);
  const begin = async (product = null) => {
    const result = await run("start_count", { location, scope: "inventory", mode: product ? "items" : "full" });
    if (result) setEditor({ count: result, product });
  };
  const toggle = (product) => run("product_status", {
    product_id: String(product.id), enabled: !product.enabled,
    ...(product.updatedAt ? { expected_updated_at: product.updatedAt } : {}),
  });
  return <>
    <div hidden={Boolean(editor)}><InventoryProductTable data={data} location={location} onLocationChange={setLocation}
      onEditStock={(product) => begin(product)} onFullStockTake={() => begin()}
      onSavedCounts={() => setEditor({ history: true })} onToggleStatus={toggle} can={can} /></div>
    {editor && <>
      <div className="kp-toolbar"><button type="button" className="kp-quiet" onClick={() => setEditor(null)}>← Back to inventory items</button><strong>{editor.product ? "Stock correction · " + editor.product.name : editor.history ? "Saved stock counts" : "Full stock take"}</strong></div>
      <ClosingEntry key={editor.count?.id || "saved"} data={data} run={run} can={can} storeId={storeId} scope="inventory"
        initialCount={editor.count} selectedProductIds={editor.product?.family_product_ids}
        onClose={() => setEditor(null)} onPosted={() => setEditor(null)} />
    </>}
  </>;
}

function ClosingEntry({ data, run, can, storeId, scope = "production", initialCount = null, selectedProductIds = null, onClose, onPosted }) {
  const inventoryCount = scope === "inventory";
  const compact = inventoryCount && Boolean(initialCount);
  const productIds = new Set((data.inventory || []).map((product) => String(product.id)));
  const countableItems = data.items.filter((item) => inventoryCount ? productIds.has(String(item.legacy_key)) : item.production_consumption !== false);
  const [mode, setMode] = useState(initialCount?.mode || (inventoryCount ? "items" : "single"));
  const [itemId, setItemId] = useState("");
  const [location, setLocation] = useState(() => initialCount ? String(initialCount.location_id) : inventoryCount ? String((data.locations.find((entry) => entry.name === "Main store") || data.locations[0])?.id || "") : "");
  const [count, setCount] = useState(initialCount);
  const [quantities, setQuantities] = useState({});
  const [sealedCounts, setSealedCounts] = useState({});
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState([]);
  const [recorded, setRecorded] = useState(false);
  const [gainCosts, setGainCosts] = useState({});
  const [query, setQuery] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState("All");
  useEffect(() => { loadKitchenReport(storeId, today()).then((r) => setHistory((r.counts || []).filter((entry) => inventoryCount ? entry.scope === "inventory" : entry.scope !== "inventory"))).catch(() => {}); }, [storeId, data, inventoryCount]);
  const expected = count?.expected || [];
  const enteredRows = inventoryCountPhysical(expected, quantities);
  const complete = count?.mode === "items" ? enteredRows.length > 0 : expected.length > 0 && expected.every((r) => quantities[r.balance] !== undefined &&
    quantities[r.balance] !== "" && (inventoryCount || !r.pack_size || sealedCounts[r.balance] !== undefined && sealedCounts[r.balance] !== ""));
  const inventoryRows = inventoryCount ? inventoryStockRows(data, location) : [];
  const listRows = inventoryCount ? count ? [...decorateInventoryStockRows(expected, data), ...inventoryRows.filter((row) => row.needs_link)] : inventoryRows : expected;
  const visibleRows = inventoryCount ? filterInventoryStockRows(listRows, query).filter((row) => (!selectedProductIds || selectedProductIds.some((id) => String(id) === String(row.product_id))) && (productStatusFilter === "All" ||
    (productStatusFilter === "Enabled" ? row.enabled && !row.parent_disabled : !row.enabled || row.parent_disabled))) : listRows;
  const gainRows = (count?.physical || []).filter((r) => {
    const stock = data.stock.balances.find((b) => String(b.balance) === String(r.balance));
    return Number(r.variance) > 0 && (!stock || Number(stock.on_hand) === 0);
  });
  const resume = (saved) => {
    setCount(saved); setMode(saved.mode === "full" ? "full" : inventoryCount ? "items" : "single");
    setLocation(String(saved.location_id || ""));
    setItemId(saved.mode === "single" ? String(saved.expected?.[0]?.item || "") : "");
    setQuantities(Object.fromEntries((saved.physical || []).map((r) => [r.balance, r.counted_quantity ?? r.quantity])));
    setSealedCounts(Object.fromEntries(saved.expected.filter((r) => r.pack_size).map((r) =>
      [r.balance, saved.physical?.find((p) => String(p.balance) === String(r.balance))?.sealed_packages ?? "0"])));
    setRecorded(Boolean(saved.physical?.length)); setGainCosts({}); setReason("");
  };
  const start = async () => {
    const result = await run("start_count", { location, mode, scope, ...(mode === "single" ? { item: itemId } : {}) });
    if (!result) return;
    setCount(result); setQuantities({});
    setSealedCounts(Object.fromEntries(result.expected.filter((r) => r.pack_size).map((r) => [r.balance, "0"])));
    setRecorded(false); setGainCosts({}); setReason("");
  };
  const record = async () => {
    const physical = enteredRows.map((r) => ({ ...r,
        ...(!inventoryCount && expected.find((entry) => String(entry.balance) === String(r.balance))?.pack_size ? { sealed_packages: sealedCounts[r.balance] } : {}) }));
    const result = await run("record_count", { count: count.id, physical });
    if (result) { setCount({ ...count, physical: result.physical }); setRecorded(true); }
  };
  const post = async () => {
    const result = await run("adjust_count", { count: count.id, reason, unit_costs: gainCosts });
    if (result) {
      setCount(inventoryCount ? null : { ...count, adjustment_id: result.transaction });
      setRecorded(false);
      if (inventoryCount) { setQuantities({}); setGainCosts({}); setReason(""); }
      onPosted?.(result);
    }
  };
  const endEditing = () => { if (onClose) { onClose(); return; } setCount(null); setQuantities({}); setSealedCounts({}); setGainCosts({}); setRecorded(false); setReason(""); };
  const changeProductStatus = (row) => run("product_status", {
    product_id: String(row.product_id), enabled: !row.enabled,
    ...(row.product_updated_at ? { expected_updated_at: row.product_updated_at } : {}),
  });
  return <Card title={inventoryCount ? "Inventory items" : "Production pack & loose stock count"}
    subtitle="Count physical stock, review differences, then post a reasoned adjustment to the ledger.">
    <p className="kp-help">{inventoryCount ? "All Product Master items are listed, including products used in Production. For packed products, enter unopened packs here; loose contents are kept separately and counted in Production → Stock count." : "Count ingredients and products with Production Consumption enabled, including unopened packs and loose contents. Product Master stock is also listed in Inventory → Inventory items."}</p>
    {!compact && <><div className="kp-count-modes" role="group" aria-label="Count type">
      <button type="button" disabled={inventoryCount && Boolean(count)} className={mode === (inventoryCount ? "items" : "single") ? "selected" : ""} aria-pressed={mode === (inventoryCount ? "items" : "single")} onClick={() => setMode(inventoryCount ? "items" : "single")}>
        <strong>{inventoryCount ? "Edit item quantities" : "Correct one product"}</strong><span>{inventoryCount ? "Only the quantities you enter will be updated." : "Fix a mistaken stock balance."}</span>
      </button>
      <button type="button" disabled={inventoryCount && Boolean(count)} className={mode === "full" ? "selected" : ""} aria-pressed={mode === "full"} onClick={() => setMode("full")}>
        <strong>Full stock take</strong><span>Count all {inventoryCount ? "Product Master items" : "production items"} at one location, including zero stock.</span>
      </button>
    </div>
    <div className="kp-count-start">
      <Field label="Stock location"><Select value={location} onChange={setLocation} options={data.locations} disabled={inventoryCount && Boolean(count)} /></Field>
      {mode === "single" && <SearchSelect id="kp-count-product" label="Product to correct" value={itemId}
        onChange={setItemId} options={countableItems} placeholder="Click to browse or type to search" />}
      {!countableItems.length && <p className="kp-help">{inventoryCount ? "Save products in Product Master to link their stock for editing." : "No production items are available in this branch."}</p>}
      <button type="button" disabled={!location || !countableItems.length || (mode === "single" && !itemId) || !can("start_count") || inventoryCount && Boolean(count)} onClick={start}>
        {mode === "full" ? "Start full stock take" : inventoryCount ? "Edit stock quantities" : "Start product correction"}
      </button>
      {inventoryCount && count && <button type="button" className="kp-quiet" onClick={endEditing}>Back to item list</button>}
    </div>
    <Field label="Continue an earlier count"><Select aria-label="Resume stock count" value={count?.id || ""}
      onChange={(id) => { const saved = history.find((r) => String(r.id) === id); if (saved) resume(saved); }}
      options={history.map((r) => ({ id: r.id, name: (r.mode === "full" ? "Full" : "Product") +
        " count " + r.id + " · " + (r.adjustment_id ? "Posted" : "Open") + " · " + new Date(r.cutoff).toLocaleString() }))}
      placeholder="Select a saved count…" /></Field></>}
    {inventoryCount && <div className="kp-inventory-list-tools">
      <Field label="Search inventory items"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Product name, SKU or barcode" /></Field>
      <Field label="Product status"><select value={productStatusFilter} onChange={(event) => setProductStatusFilter(event.target.value)}>{["All", "Enabled", "Disabled"].map((value) => <option key={value}>{value}</option>)}</select></Field>
      <span role="status">{visibleRows.length} of {listRows.length} stock rows</span>
    </div>}
    {(count || inventoryCount) && <>
      {count && <div className="kp-count-summary">
        <div><strong>{count.mode === "full" ? "Full stock take" : count.mode === "items" ? "Edit item quantities" : "Product correction"}</strong>
          <span>Count #{count.id} · {data.locations.find((r) => String(r.id) === String(count.location_id))?.name || "Selected location"}</span></div>
        <span>{enteredRows.length} {count.mode === "items" ? "rows entered" : " / " + expected.length + " rows counted"}</span>
      </div>}
      <p className="kp-help">{inventoryCount ? count ? count.mode === "items" ? "Enter a new stock quantity only for the rows you want to correct. Blank rows stay as they are; enter 0 to set a row to zero. Each batch has its own stock row." : "Enter the physical quantity for every stock row in the product's saved unit, including 0 for empty rows." : "Select Edit stock quantities to enter the correct stock directly in the list." : "Enter the actual total in each product's base unit. For packs, also enter unopened packs; the remainder is loose. Enter 0 for empty rows. Count each batch separately."}</p>
      <div className={inventoryCount ? "kp-stock-edit-list" : undefined}><Table columns={["Product / batch", "Current stock", inventoryCount ? "New stock quantity" : "Physical total", ...(!inventoryCount ? ["Unopened packs", "Loose contents"] : []), "Difference", ...(inventoryCount ? ["Status", ...(can("product_status") ? ["Enable / Disable"] : [])] : [])]}
        empty={inventoryCount ? query.trim() ? "No inventory items match this search." : "No Product Master items have been created in this branch." : "No stock rows."}
        rows={visibleRows.map((r) => {
          const item = data.items.find((i) => String(i.id) === String(r.item));
          const stock = data.stock.balances.find((b) => String(b.balance) === String(r.balance));
          const observed = count?.physical?.find((p) => String(p.balance) === String(r.balance));
          const label = r.needs_link ? "Save in Product Master to link stock" : r.new ? "No stock recorded" : r.debt ? "Negative stock to reconcile" : r.reference || stock?.reference || "Lot " + r.lot;
          const total = quantities[r.balance];
          const missingConversion = Boolean(r.configuration_error || r.needs_conversion);
          const unit = missingConversion ? r.base_unit || item?.unit || "" : r.count_unit || item?.unit || "";
          const factor = missingConversion ? 1 : Number(r.count_factor || 1);
          const sealedBasis = inventoryCount && r.count_basis === "sealed";
          const currentQuantity = sealedBasis ? Number(r.sealed_packages || 0) : Number(r.quantity) / factor;
          const sealed = sealedCounts[r.balance];
          const loose = r.pack_size && total !== undefined && total !== "" && sealed !== undefined && sealed !== ""
            ? fmt(Number(total) - Number(sealed) * Number(r.pack_size), 6) + " " + (item?.unit || "") : "—";
          return [<><strong>{item?.name || r.name || r.item}</strong>{inventoryCount && <small>{[r.sku && "SKU " + r.sku, r.barcode].filter(Boolean).join(" · ")}</small>}<small>{label}</small></>,
            <>{fmt(currentQuantity, 6) + " " + unit}{sealedBasis && <small>Unopened{Number(r.open_quantity || 0) > 0 ? " · Loose: " + fmt(r.open_quantity, 6) + " " + (r.base_unit || item?.unit || "") + " in Production" : " packs"}</small>}</>,
            <div><Qty aria-label={"Physical " + (item?.name || r.item) + " " + label} value={total ?? ""} step={inventoryCount && r.pack_size ? "1" : "any"}
              placeholder="—" disabled={!count || Boolean(count.adjustment_id) || Boolean(r.configuration_error || r.needs_conversion || r.needs_link || r.read_only_reason)} onChange={(value) => {
                setQuantities((current) => ({ ...current, [r.balance]: value })); setRecorded(false);
              }} /><small>{r.read_only_reason || (r.needs_link ? "Link stock in Product Master" : r.configuration_error || r.needs_conversion ? "Configure the product unit first" : sealedBasis ? "Unopened " + unit : unit)}</small></div>,
            ...(!inventoryCount ? [r.pack_size ? <Qty step="1" aria-label={"Unopened " + (item?.name || r.item) + " " + label}
              value={sealed ?? "0"} disabled={Boolean(count?.adjustment_id)} onChange={(value) => {
                setSealedCounts((current) => ({ ...current, [r.balance]: value })); setRecorded(false);
              }} /> : "—", loose] : []),
            recorded && observed ? fmt(Number(observed.variance) / factor, 6) + " " + unit : total !== undefined && total !== "" && Number.isFinite(Number(total)) ? fmt(Number(total) - currentQuantity, 6) + " " + unit : "—",
            ...(inventoryCount ? [<span className={r.enabled && !r.parent_disabled ? "inventory-product-enabled" : "inventory-product-disabled"}>{r.parent_disabled ? "Disabled by parent" : r.enabled ? "Enabled" : "Disabled"}</span>, ...(can("product_status") ? [<button type="button" className={r.enabled ? "product-disable-action" : "product-enable-action"} disabled={!r.product_id} onClick={() => changeProductStatus(r)} aria-label={(r.enabled ? "Disable " : "Enable ") + (r.name || item?.name || "product")}>{r.enabled ? "Disable" : "Enable"}</button>] : [])] : [])];
        })} /></div>
      {count && !count.adjustment_id && <>
        <button type="button" disabled={!can("record_count") || !complete} onClick={record}>{inventoryCount ? "Review stock quantities" : "Record physical count"}</button>
        {!complete && <p className="kp-help">{count.mode === "items" ? "Enter a quantity beside any item you want to change, including 0." : "Complete every row, including zero quantities, to review this count."}</p>}
        {recorded && <div className="kp-count-review" role="status">Count recorded. No stock has changed yet. Review the differences and give a reason before posting.</div>}
        {recorded && gainRows.map((r) => {
          const snapshot = expected.find((row) => String(row.balance) === String(r.balance));
          const item = data.items.find((row) => String(row.id) === String(snapshot?.item));
          return <Field key={r.balance} label={"Carrying cost per " + (snapshot?.count_unit || item?.unit || "base unit") + " for " + (item?.name || r.balance)}
            hint="Required when stock is found where the ledger had no value. Enter 0 only if its cost is zero.">
            <Qty value={gainCosts[r.balance] ?? ""} onChange={(value) =>
              setGainCosts((current) => ({ ...current, [r.balance]: value }))} />
          </Field>;
        })}
        <Field label="Reason for the correction"><textarea value={reason} onChange={(event) => setReason(event.target.value)}
          placeholder="Example: physical count found two damaged packets; reviewed by supervisor" /></Field>
        <button type="button" disabled={!can("adjust_count") || !recorded || !reason.trim() ||
          gainRows.some((r) => gainCosts[r.balance] === undefined || gainCosts[r.balance] === "")}
          onClick={post}>{inventoryCount ? "Save stock quantities" : "Post reviewed stock difference"}</button>
      </>}
      {count?.adjustment_id && <p className="kp-count-review">This count has been posted. Stock and the audit trail are updated.</p>}
    </>}
    <p className="kp-help">For the whole branch, repeat the full stock take for each stock location. Purchase, sale and production history stay unchanged.</p>
  </Card>;
}

function batchHasUnpricedInputs(batch) {
  return batch.actual?.cost_incomplete || (batch.actual?.shortages || []).some((shortage) => Number(shortage.unit_cost) <= 0);
}

function productionCostByItem(batches) {
  const items = new Map();
  for (const batch of batches) {
    if (batch.status !== "posted") continue;
    const unpricedInputs = batchHasUnpricedInputs(batch);
    for (const output of batch.actual?.outputs || []) {
      const key = JSON.stringify([output.item, output.unit]);
      const row = items.get(key) || { name: output.name, unit: output.unit, quantity: 0, cost: 0, batches: new Set(), incomplete: false };
      const cost = Number(output.cost);
      row.quantity += Number(output.quantity);
      row.cost += cost || 0;
      row.batches.add(batch.id);
      row.incomplete ||= unpricedInputs || !(cost > 0);
      items.set(key, row);
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function servingCostEstimates(data, location, unpricedLots) {
  const stock = new Map();
  for (const balance of data.stock?.balances || []) {
    if (String(balance.location) !== location || !balance.usable) continue;
    const quantity = Number(balance.on_hand);
    if (!(quantity > 0)) continue;
    const value = Number(balance.value);
    const key = String(balance.item);
    const pool = stock.get(key) || { quantity: 0, value: 0, incomplete: false };
    pool.quantity += quantity;
    pool.value += value || 0;
    pool.incomplete ||= balance.cost_incomplete || !(value > 0) || unpricedLots.has(String(balance.lot));
    stock.set(key, pool);
  }
  const items = new Map(data.items.map((item) => [String(item.id), item]));
  const menu = new Map((data.menu || []).map((item) => [String(item.productionMenuKey ?? item.id), item]));
  return data.servings.filter((serving) => ["prepared", "cook_on_order"].includes(serving.method)).map((serving) => {
    const item = menu.get(String(serving.key));
    const price = item?.price == null || item.price === "" ? null : Number(item.price);
    const tax = Number(item?.tax || 0);
    const netPrice = price != null && Number.isFinite(price) && Number.isFinite(tax) && tax >= 0 ? price / (1 + tax / 100) : null;
    const prepared = serving.method === "prepared";
    const components = serving.components || [];
    let cost = prepared && components.length ? 0 : null;
    for (const component of components) {
      if (cost == null) break;
      const pool = stock.get(String(component.item));
      cost = pool && !pool.incomplete ? cost + Number(component.quantity) * pool.value / pool.quantity : null;
    }
    const portion = prepared ? components.map((component) => {
      const name = component.name || items.get(String(component.item))?.name || "Stock item";
      return `${fmt(component.quantity)} ${component.unit} ${name}`;
    }).join(" + ") : "";
    return { key: serving.key, name: serving.name, prepared, portion, cost, netPrice };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

function servedProfitByMenuItem(sales, unpricedLots) {
  const items = new Map();
  for (const sale of sales) {
    const row = items.get(sale.menu) || { name: sale.menu, quantity: 0, sales: 0, cost: 0, incomplete: false };
    row.quantity += Number(sale.quantity);
    row.sales += Number(sale.net_menu_value);
    row.cost += Number(sale.food_cost);
    row.incomplete ||= sale.cost_incomplete || (sale.components || []).some((component) =>
      !(Number(component.cost) > 0) || unpricedLots.has(String(component.lot)));
    items.set(sale.menu, row);
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function KitchenCostProfitReport({ data, result }) {
  const [selectedLocation, setLocation] = useState("");
  const location = selectedLocation || String((data.locations.find((entry) => entry.name === "Kitchen") || data.locations[0])?.id || "");
  const unpricedLots = new Set();
  for (const batch of [...(data.batches || []), ...result.batches]) {
    const unpricedInputs = batchHasUnpricedInputs(batch);
    for (const output of batch.actual?.outputs || []) {
      if (unpricedInputs || !(Number(output.cost) > 0)) unpricedLots.add(String(output.lot));
    }
  }
  const production = productionCostByItem(result.batches);
  const estimates = servingCostEstimates(data, location, unpricedLots);
  const served = servedProfitByMenuItem(result.sales, unpricedLots);
  const showMoney = (amount) => amount == null ? "—" : rupees(amount);
  const margin = (profit, sales) => profit == null || !(sales > 0) ? "—" : `${fmt(profit / sales * 100, 1)}%`;

  return <>
    <Card title="Production cost by item" subtitle="Posted output and its recorded batch cost for the selected business date.">
      <Table columns={["Prepared item", "Made", "Batches", "Recorded production cost", "Average unit cost"]}
        empty="No completed production batches for this date."
        rows={production.map((row) => {
          const unit = row.unit === "g" ? "kg" : row.unit === "ml" ? "litre" : row.unit;
          const factor = ["g", "ml"].includes(row.unit) ? 1000 : 1;
          return [row.name, `${fmt(row.quantity)} ${row.unit}`, row.batches.size,
            <>{rupees(row.cost)}{row.incomplete && <small>Some costs are zero or missing</small>}</>,
            row.incomplete || !row.quantity ? "—" : `${rupees(row.cost / row.quantity * factor)} / ${unit}`];
        })} />
    </Card>
    <Card title="Estimated cost & profit per serving" subtitle="Uses current usable stock costs at the selected location and current menu prices before tax, discounts and refunds.">
      <div className="kp-toolbar">
        <Field label="Serving cost location"><Select value={location} onChange={setLocation} options={data.locations} /></Field>
      </div>
      <Table columns={["Menu item", "Portion", "Cost per serving", "Price ex. tax", "Gross food profit", "Margin"]}
        empty="Save a prepared serving in Servings to see its estimated cost and profit."
        rows={estimates.map((row) => {
          const profit = row.cost == null || row.netPrice == null ? null : row.netPrice - row.cost;
          const portion = row.prepared ? row.portion || "—" : "Set up prepared serving";
          return [row.name, portion, row.prepared && row.cost == null ? "Cost needed" : showMoney(row.cost),
            showMoney(row.netPrice), showMoney(profit), margin(profit, row.netPrice)];
        })} />
    </Card>
    <Card title="Gross food profit by served item" subtitle="For the selected business date. Saved menu value excluding tax minus posted food cost. Discounts, refunds and operating expenses are excluded.">
      <Table columns={["Menu item", "Served", "Food cost", "Cost per serving", "Menu value ex. tax", "Gross food profit", "Margin"]}
        empty="No fulfilled servings for this date."
        rows={served.map((row) => {
          const profit = row.incomplete ? null : row.sales - row.cost;
          return [row.name, fmt(row.quantity), <>{rupees(row.cost)}{row.incomplete && <small>Some costs are zero or missing</small>}</>,
            showMoney(row.incomplete || !row.quantity ? null : row.cost / row.quantity),
            rupees(row.sales), showMoney(profit), margin(profit, row.sales)];
        })} />
    </Card>
  </>;
}

function PendingBilledServings({ orders, bills, day }) {
  const byReference = new Map(orders.map((order) => [order.reference, order]));
  const seen = new Set();
  const rows = [];
  for (const bill of bills) {
    const reference = bill.stockOrderRef || bill.tableOrderId;
    const order = byReference.get(reference);
    if (!order || seen.has(reference) || bill.training ||
        new Date(bill.completedAt || bill.createdAt).toLocaleDateString("en-CA") !== day) continue;
    seen.add(reference);
    for (const line of order.lines) {
      const remaining = Number(line.quantity) - Number(line.fulfilled) - Number(line.cancelled);
      if (remaining > 0) rows.push([bill.orderNumber || reference, line.snapshot.name, fmt(remaining)]);
    }
  }
  if (!rows.length) return null;
  return <Card title="POS bills awaiting kitchen service" subtitle="These bills are recorded in POS. Complete the served quantities in KDS to record consumption and food cost.">
    <Table columns={["POS bill", "Menu item", "Portions awaiting service"]} rows={rows} />
  </Card>;
}

const reportMoney = (value) => value == null ? "—" : rupees(value);
const reportMargin = (value) => value == null ? "—" : `${fmt(value, 2)}%`;

function BatchProfitReport({ storeId, reportRefresh, initialDay }) {
  const [day, setDay] = useState(() => initialDay || today());
  const [batches, setBatches] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setBatches(null);
    setError("");
    if (day) loadBatchProfit(storeId, day).then(({ batches }) => {
      if (active) setBatches(batches);
    }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [storeId, day, reportRefresh]);
  const selected = batches?.find((batch) => batch.id === selectedId) ?? batches?.[0];
  const exportBatches = () => downloadKitchenCsv("batch-profit", day, batches.map((batch) => ({
    "Production date": batch.production_date, "Batch reference": batch.reference, "Recipe": batch.recipe,
    "Status": batch.status, "Production cost": batch.production_cost, "Net sales ex. GST": batch.net_sales,
    "Cost used for profit": batch.food_cost, "Gross profit": batch.gross_profit, "Margin %": batch.margin_pct,
  })));
  return <>
    <Card title="Batch profitability" subtitle="Review sales to date for the batches made on the selected production date. Net sales exclude GST and reflect recorded discounts and refunds.">
      <div className="kp-toolbar">
        <Field label="Production date"><input type="date" value={day} onChange={(event) => setDay(event.target.value)} /></Field>
        {batches?.length > 0 && <button type="button" className="kp-quiet" onClick={exportBatches}>Export batches CSV</button>}
      </div>
      {error && <p className="kp-error" role="alert">{error}</p>}
      {day && !batches && !error && <p role="status">Loading batch sales…</p>}
      {batches && <Table columns={["Batch", "Status", "Production cost", "Net sales ex. GST", "Cost used for profit", "Gross profit", "Margin", ""]}
        empty="No posted batches for this production date."
        rows={batches.map((batch) => [<>{batch.reference}<small>{batch.recipe}</small></>, batch.status,
          batch.production_cost == null ? "Cost pending" : reportMoney(batch.production_cost),
          batch.sales_pending ? "Allocation pending" : reportMoney(batch.net_sales),
          batch.cost_pending ? "Cost pending" : reportMoney(batch.food_cost),
          reportMoney(batch.gross_profit), reportMargin(batch.margin_pct),
          <button type="button" className="kp-quiet" aria-pressed={selected?.id === batch.id}
            aria-label={`View ${batch.reference} breakdown`} onClick={() => setSelectedId(batch.id)}>View breakdown</button>])} />}
      {batches?.length > 0 && <p className="kp-help">For a fully sold batch, gross profit uses the total production cost plus any extra serving costs. For a batch still in stock, it uses the posted cost of the portions sold.</p>}
    </Card>
    {selected && <Card title={`${selected.reference} · ${selected.recipe}`}>
      <h4>Batch output</h4>
      <Table columns={["Prepared item", "Made", "Sold", "Remaining", "Awaiting bill", "Other use", "Production cost", "Cost rate"]}
        rows={selected.outputs.map((output) => {
          const costUnit = ({ g: "kg", ml: "litre" })[output.unit] || output.unit;
          const factor = costUnit === output.unit ? 1 : 1000;
          return [output.name, ...["produced", "sold", "remaining", "awaiting_billing", "other_use"].map((key) => `${fmt(output[key], 6)} ${output.unit}`),
            output.production_cost == null ? "Cost pending" : reportMoney(output.production_cost),
            output.production_cost == null ? "—" : `${rupees(output.production_cost * factor / output.produced)} / ${costUnit}`];
        })} />
      <h4>Servings sold from this batch</h4>
      <Table columns={["Menu item", "Portions from batch", "Avg. billed rate incl. GST", "Cost per portion", "Cost of sales", "Net sales ex. GST", "Gross food profit", "Margin"]}
        empty="No saved POS sales with posted stock consumption for this batch."
        rows={selected.servings.map((serving) => [serving.name, serving.portions == null ? "—" : fmt(serving.portions, 3),
          <>{reportMoney(serving.average_rate)}{serving.net_rate != null && <small>{rupees(serving.net_rate)} net per portion</small>}</>,
          reportMoney(serving.cost_per_portion),
          serving.food_cost == null ? "Cost pending" : reportMoney(serving.food_cost),
          serving.net_sales == null ? "Allocation pending" : reportMoney(serving.net_sales),
          reportMoney(serving.gross_profit), reportMargin(serving.margin_pct)])} />
      {selected.servings.length > 0 && <p className="kp-help">When a serving uses stock from several batches, its sales value is shared in proportion to each batch’s posted cost.</p>}
    </Card>}
  </>;
}

function downloadKitchenCsv(name, day, rows) {
  const keys = Object.keys(rows[0] || {});
  const cell = (value) => {
    const text = typeof value === "object" && value != null ? JSON.stringify(value) : String(value ?? "");
    const escaped = /^[=+@-]/.test(text) ? `'${text}` : text;
    return `"${escaped.replaceAll('"', '""')}"`;
  };
  const csv = [keys, ...rows.map((row) => keys.map((key) => row[key]))].map((row) => row.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `uvpro-${name}-${day}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function Reports({ data, storeId, salesLedger, reportRefresh }) {
  const [day, setDay] = useState(today()); const [result, setResult] = useState(null); const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setResult(null);
    setError("");
    if (day) loadKitchenReport(storeId, day).then((report) => {
      if (active) setResult(report);
    }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [storeId, day, reportRefresh]);
  const download = (name, rows) => downloadKitchenCsv(name, day, rows);
  return <><div className="kp-toolbar"><Field label="Business date"><input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>{result && <><button className="kp-quiet" onClick={() => download("closing", result.closing)}>Export closing CSV</button><button className="kp-quiet" onClick={() => download("component-consumption", result.sales)}>Export servings CSV</button><button className="kp-quiet" onClick={() => download("production", result.batches)}>Export batches CSV</button><button className="kp-quiet" onClick={() => download("usage", result.usage)}>Export usage CSV</button></>}</div>{error && <p role="alert">{error}</p>}{result && <>
    <PendingBilledServings orders={data.orders} bills={salesLedger} day={day} />
    <KitchenCostProfitReport data={data} result={result} />
    <Card title="Daily stock reconciliation" subtitle="Expected closing = opening + posted receipts − posted issues. Carry-forward keeps the original batch identity and value."><Table columns={["Item / batch", "Location", "Opening", "Receipts", "Issues", "Expected closing", "Value"]} rows={result.closing.map((r) => [`${r.name} / ${r.reference} (${r.unit})`, r.location, fmt(r.opening), fmt(r.receipts), fmt(r.issues), fmt(r.closing), rupees(r.closing_value)])} /><details><summary>Movement categories</summary>{result.closing.map((r) => <p key={r.balance}>{r.name}: {Object.entries(r.categories).map(([k, v]) => `${k.replaceAll("_", " ")} ${fmt(v)} ${r.unit}`).join(" · ")}</p>)}</details></Card>
    <Card title="Serving & component consumption" subtitle="Food cost uses posted inventory costs and saved serving quantities. Margin uses the menu price excluding tax, before discounts, refunds and operating expenses."><Table empty="No kitchen service posted for this date. Use KDS to complete the portions already served." columns={["Fulfillment", "Order / serving", "Qty", "Food cost", "Menu value ex. tax", "Food margin before discount", "Consumed allocations"]} rows={result.sales.map((s) => [s.fulfillment, `${s.order} / ${s.menu} v${s.recipe_version}`, fmt(s.quantity), s.cost_incomplete ? "Cost pending" : rupees(s.food_cost), rupees(s.net_menu_value), s.food_margin_before_discount == null ? "—" : rupees(s.food_margin_before_discount), s.components.map((c) => `item ${c.item}: ${fmt(c.quantity)} · lot ${c.lot} · movement ${c.movement}`).join("; ")])} /></Card>
    <Card title="Waste, other usage & transfers"><Table columns={["Source", "Category", "Quantity", "Value", "Reason"]} rows={result.usage.map((r) => [r.transaction__source, r.category, fmt(r.quantity), rupees(r.value), r.transaction__reason])} /><Table columns={["Consumed-food disposition", "Outcome", "Reason"]} rows={result.dispositions.map((r) => [r.source, r.result.outcome, r.reason])} /></Card>
    <Card title="Expected versus physical closing"><Table columns={["Count", "Cutoff", "Balance", "Expected at observation", "Physical", "Variance", "Adjustment"]} rows={result.counts.flatMap((c) => c.physical.map((p) => [c.id, new Date(c.cutoff).toLocaleString(), p.balance, fmt(p.expected_at_observation), fmt(p.quantity), fmt(p.variance), c.adjustment_id || "Unposted"]))} /></Card>
  </>}</>;
}

function Setup({ data, run, can }) {
  const itemName = useRef(null);
  const [item, setItem] = useState({ name: "", kind: "raw", base_unit: "g", measures: {} });
  const [location, setLocation] = useState("");
  const [receipt, setReceipt] = useState({ item: "", location: "", quantity: "", total_cost: "", source: "", reason: "", category: "opening", business_date: today() });
  const [mappings, setMappings] = useState({}); const [importLocation, setImportLocation] = useState("");
  const [reviewed, setReviewed] = useState(false); const [wip, setWip] = useState(false); const [reason, setReason] = useState("");
  const unlinkedProducts = data.inventory.filter((product) => !data.items.some((stock) => String(stock.legacy_key) === String(product.id)));
  const setupOptions = [
    ...data.items.map((stock) => ({ id: `production:${stock.id}`, name: `${stock.name} · Production item` })),
    ...unlinkedProducts.map((product) => ({ id: `product:${product.id}`, name: `${product.name} · New from Product Master (${product.unit || "unit missing"})` })),
  ].sort((left, right) => left.name.localeCompare(right.name));
  const chooseSetupItem = (choice) => {
    if (choice.startsWith("production:")) {
      const stock = data.items.find((entry) => `production:${entry.id}` === choice);
      setItem(stock ? { ...stock, base_unit: stock.unit } : { name: "", kind: "raw", base_unit: "g", measures: {} });
    } else if (choice.startsWith("product:")) {
      const product = unlinkedProducts.find((entry) => `product:${entry.id}` === choice);
      const stockUnit = String(product?.unit || "").trim().toLowerCase();
      const base_unit = ["kg", "g", "gram", "grams"].includes(stockUnit) ? "g" : ["ltr", "l", "litre", "liter", "ml"].includes(stockUnit) ? "ml" : ["piece", "pieces", "pcs", "pc", "each", "unit", "units"].includes(stockUnit) ? "piece" : "";
      const configuredUnit = product?.productionBaseUnit || base_unit;
      const configuredFactor = String(product?.productionUnitFactor ?? "").trim();
      const measures = product && !["kg", "g", "gram", "grams", "ltr", "l", "litre", "liter", "ml", "piece", "pieces", "pcs", "pc", "each", "unit", "units"].includes(stockUnit) && configuredFactor ? { [stockUnit]: configuredFactor } : {};
      setItem({ name: product?.name || "", kind: "raw", base_unit: product ? configuredUnit : "g", measures, legacy_key: product ? String(product.id) : "" });
    } else {
      setItem({ name: "", kind: "raw", base_unit: "g", measures: {} });
    }
    itemName.current?.focus();
  };
  return <>
    <Card title="Stock item setup" subtitle="Create a raw ingredient and choose the unit used in recipes and batches.">
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run("item", item); if (r) setItem({ name: "", kind: "raw", base_unit: "g", measures: {} }); }}>
        {item.legacy_key && !item.id && <p className="kp-help">This older Product Master item is not linked yet. Its saved purchase-unit contents are filled in here; confirm the stock unit, then select Save item.</p>}
        <div className="kp-form"><Field label="Name"><input ref={itemName} value={item.name} onChange={(e) => setItem({ ...item, name: e.target.value })} required /></Field><Field label="Type"><input value={item.kind} readOnly /></Field><Field label="Base stock unit"><select value={item.base_unit} onChange={(e) => setItem({ ...item, base_unit: e.target.value })} disabled={Boolean(item.id)} required><option value="">Choose unit</option><option value="g">g — weight</option><option value="ml">ml — volume</option><option value="piece">piece — whole count</option></select></Field></div>
        <div className="kp-toolbar">
          <button disabled={!can("item")}>{item.id ? "Save changes" : item.legacy_key ? "Link item" : "Save item"}</button>
          {(item.id || item.legacy_key) && <button className="kp-quiet" type="button" onClick={() => chooseSetupItem("")}>New item</button>}
        </div>
      </form>
      {can("item") && setupOptions.length > 0 && <details>
        <summary>Manage existing items</summary>
        <Table columns={["Stock item", "Action"]} rows={setupOptions.map((option) => [
          option.name,
          <button className="kp-quiet" type="button" aria-label={(option.id.startsWith("product:") ? "Link " : "Edit ") + option.name} onClick={() => chooseSetupItem(option.id)}>
            {option.id.startsWith("product:") ? "Link" : "Edit"}
          </button>,
        ])} />
      </details>}
      <form className="kp-toolbar" onSubmit={async (e) => { e.preventDefault(); if (await run("location", { name: location })) setLocation(""); }}><Field label="New location"><input value={location} onChange={(e) => setLocation(e.target.value)} required /></Field><button disabled={!can("location")}>Add location</button></form>
    </Card>
    {!data.enabled && <Card title="Legacy inventory opening reconciliation" subtitle={data.cutover.instruction}>
      <Field label="Opening location"><Select value={importLocation} onChange={setImportLocation} options={data.locations} /></Field>
      <Table columns={["Legacy item", "Recorded quantity", "Recorded rate", "Stock type", "Status"]} rows={data.cutover.legacy.inventory.map((old) => { const mapped = data.items.some((i) => i.legacy_key === String(old.id)); return [old.name, `${fmt(old.stock)} ${old.unit}`, rupees(old.cost), <select value={mappings[old.id] || ""} disabled={mapped} onChange={(e) => setMappings({ ...mappings, [old.id]: e.target.value })}><option value="">Choose explicitly…</option>{["raw", "intermediate", "prepared", "resale"].map((k) => <option key={k}>{k}</option>)}</select>, mapped ? "Mapped" : "Needs review"]; })} />
      <button disabled={!can("import_legacy") || !importLocation} onClick={() => run("import_legacy", { location: importLocation, mappings: Object.entries(mappings).filter(([, kind]) => kind).map(([legacy_key, kind]) => ({ legacy_key, kind })), reason: "Reviewed legacy inventory carrying quantities and values" }).then((r) => { if (r) setMappings({}); })}>Import selected openings</button>
      <details><summary>Legacy recipes, finished stock and unfinished batches</summary><p>Use the existing quantities as reconciliation evidence. Create reviewed production recipes, serving mappings and measured prepared/WIP openings. No legacy yield is converted automatically.</p><Table columns={["Recipe", "Portion", "Expected output"]} rows={data.cutover.legacy.recipes.map((r) => [r.name, r.portion, `${r.outputQty} ${r.outputUnit}`])} /><Table columns={["Legacy finished item", "Available", "Unit"]} rows={data.cutover.legacy["food-stock"].map((r) => [r.item, r.available, r.unit])} /><Table columns={["Legacy batch", "Status", "Issued materials"]} rows={data.cutover.legacy["production-batches"].map((r) => [r.batchNo || r.id, r.status, r.materialsIssued ? "Already issued — reconcile WIP" : "Not issued"])} /></details>
      {data.cutover.issues.length > 0 && <ul className="kp-issues">{data.cutover.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
      <Table columns={["Mapped inventory", "Legacy quantity (base unit)", "Opening quantity", "Quantity difference", "Legacy value", "Opening value", "Value difference"]} rows={(data.cutover.reconciliation || []).map((r) => [r.name, `${r.legacy_quantity} ${r.unit}`, fmt(r.opening_quantity), fmt(r.quantity_difference), rupees(r.legacy_value), rupees(r.opening_value), rupees(r.value_difference)])} />
    </Card>}
    {!data.enabled && <Card title="Reviewed opening balances" subtitle="Record measured prepared stock and recoverable WIP separately. Do not invent quantities from historic sales or recipes.">
      <form onSubmit={async (e) => { e.preventDefault(); const r = await run("receipt", receipt); if (r) setReceipt({ ...receipt, quantity: "", total_cost: "", source: "" }); }}><div className="kp-form"><Field label="Item"><Select value={receipt.item} onChange={(item) => setReceipt({ ...receipt, item })} options={data.items} required /></Field><Field label="Location"><Select value={receipt.location} onChange={(location) => setReceipt({ ...receipt, location })} options={data.locations} required /></Field><Field label={`Actual quantity (${data.items.find((i) => String(i.id) === String(receipt.item))?.unit || "base unit"})`}><Qty value={receipt.quantity} onChange={(quantity) => setReceipt({ ...receipt, quantity })} required /></Field><Field label="Total carrying value ₹"><Qty value={receipt.total_cost} onChange={(total_cost) => setReceipt({ ...receipt, total_cost })} required /></Field><Field label="Source reference"><input value={receipt.source} onChange={(e) => setReceipt({ ...receipt, source: e.target.value })} required /></Field><Field label="Valuation / reconciliation explanation"><input value={receipt.reason} onChange={(e) => setReceipt({ ...receipt, reason: e.target.value })} required /></Field></div><button disabled={!can("receipt")}>Post opening</button></form>
    </Card>}
    {!data.enabled && <Card title="Activate the reconciled ledger" subtitle="Activation archives a snapshot of the legacy records and blocks legacy stock deductions. Historic bills are not replayed."><label className="kp-check"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />Opening quantities and values have been reconciled at this cutover.</label><label className="kp-check"><input type="checkbox" checked={wip} onChange={(e) => setWip(e.target.checked)} />Already-issued legacy materials and unfinished batches are reconciled as measured stock, WIP or documented loss.</label><Field label="Cutover explanation and reconciliation reference"><textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field><button disabled={!can("activate") || !reviewed || !wip || !reason.trim()} onClick={() => run("activate", { openings_reviewed: reviewed, legacy_wip_reconciled: wip, reason })}>Activate production ledger</button></Card>}
  </>;
}
