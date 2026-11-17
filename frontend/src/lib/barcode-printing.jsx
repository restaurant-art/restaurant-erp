import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Barcode, ChevronLeft, ChevronRight, Download, History, Printer, Search, X } from "lucide-react";
import { cloudRequestJson, syncLocalStateKeyToCloud } from "./cloud.js";
import { downloadLabelPDF, jobArtwork, labelGrid, labelPosition, LABEL_FIELDS, LABEL_SIZES, MAX_LABELS, printLabelSheets, sheetLabels } from "./barcode-print-layout.js";
import "./barcode-printing.css";

const BarcodeContext = createContext(null);
const PAGE_SIZE = 25;
const formatMoney = (value) => value == null ? "—" : `₹${Number(value).toFixed(2)}`;
const optionKey = (code) => JSON.stringify([code.barcode, code.mrp]);
const goodCode = (row) => row.codes.find((code) => code.internal && !code.issue) || row.codes.find((code) => !code.issue);
const statusLabels = {
  prepared: "Prepared", print_dialog_requested: "Print dialog requested", pdf_download_started: "PDF download started",
};
const views = [
  ["bulk", "All Items Barcode Printing"], ["single", "Single Item Barcode Printing"],
  ["purchase", "Purchase Bill-Wise Barcode Printing"], ["history", "Barcode Print History"],
  ["settings", "Barcode Label Settings"],
];

async function request(storeId, path, body, method = "POST") {
  const response = await cloudRequestJson(`/api/barcodes/${encodeURIComponent(storeId)}/${path}`, body === undefined ? {} : {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.detail || (Array.isArray(data) ? data.join(" ") : "Barcode request failed."));
  return data;
}

function useBarcodeData(storeId, path, revision = 0) {
  const [state, setState] = useState({ data: null, error: "", loading: true });
  useEffect(() => {
    if (!path) return;
    let current = true;
    const timer = setTimeout(() => {
      setState((prior) => ({ ...prior, loading: true, error: "" }));
      request(storeId, path).then(
        (data) => { if (current) setState({ data, error: "", loading: false }); },
        (error) => { if (current) setState({ data: null, error: error.message, loading: false }); },
      );
    }, path.includes("q=") ? 180 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [storeId, path, revision]);
  return state;
}

function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="barcode-modal" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header><h3>{title}</h3><button type="button" className="icon-button" aria-label={`Close ${title}`} onClick={onClose}><X size={19} /></button></header>
    <div className="barcode-modal-content">{children}</div>
  </dialog>;
}

export function BarcodeProvider({ storeId, catalog, purchase, notify, children }) {
  const [dialog, setDialog] = useState(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const context = useMemo(() => ({
    storeId, catalog, purchase, revision, notify,
    updated: () => setRevision((value) => value + 1),
    open: setDialog,
    announce: setNotice,
  }), [storeId, catalog, purchase, revision, notify]);
  return <BarcodeContext.Provider value={context}>
    {children}
    {dialog && <Modal title={dialog.type === "purchase" ? "Print purchase barcodes" : "Print product barcode"} onClose={() => setDialog(null)}>
      <PrintDialog key={`${dialog.type}:${dialog.id}`} target={dialog} />
    </Modal>}
    <span className="barcode-announcement" role="status">{notice}</span>
  </BarcodeContext.Provider>;
}

export function ProductBarcodeButton({ product, compact = false }) {
  const context = useContext(BarcodeContext);
  if (!context?.catalog || !product?.id) return null;
  return <button type="button" aria-label={`Print barcode for ${product.name}`} title="Print Barcode"
    onClick={() => context.open({ type: "single", id: String(product.id) })}>
    <Barcode size={16} />{compact ? null : " Print Barcode"}
  </button>;
}

export function PurchaseBarcodeButton({ reference }) {
  const context = useContext(BarcodeContext);
  if (!context?.purchase || !reference) return null;
  return <button type="button" onClick={() => context.open({ type: "purchase", id: String(reference) })}>
    <Barcode size={17} /> Print Barcodes
  </button>;
}

function Loading({ state }) {
  if (state.error) return <p className="barcode-error" role="alert">{state.error}</p>;
  if (state.loading) return <p role="status">Loading…</p>;
  return null;
}

function SearchBox({ value, onChange, placeholder }) {
  return <label className="barcode-search"><Search size={18} /><input type="search" aria-label={placeholder}
    value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function Pagination({ page, setPage, total }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <nav className="barcode-pagination" aria-label="Barcode results pages">
    <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1}><ChevronLeft size={16} /> Previous</button>
    <span>Page {page} of {pages} · {total.toLocaleString("en-IN")} results</span>
    <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages}>Next <ChevronRight size={16} /></button>
  </nav>;
}

function SizePicker({ settings, setSettings }) {
  const dimension = `${settings.width}x${settings.height}`;
  const [custom, setCustom] = useState(false);
  const preset = LABEL_SIZES.some(([width, height]) => dimension === `${width}x${height}`);
  return <label className="barcode-size"><span>Label size</span>
    <select value={custom || !preset ? "custom" : dimension} onChange={(event) => {
      setCustom(event.target.value === "custom");
      if (event.target.value === "custom") return;
      const [width, height] = event.target.value.split("x").map(Number);
      setSettings({ ...settings, width, height, ...(height === 15 ? { barcode_height: Math.min(settings.barcode_height, 6) } : {}) });
    }}>
      {LABEL_SIZES.map(([width, height]) => <option key={width + "x" + height} value={width + "x" + height}>{width} × {height} mm</option>)}
      <option value="custom">Custom size</option>
    </select>
    {(custom || !preset) && <div className="barcode-dimensions">
      <input aria-label="Label width in mm" type="number" min="18" max="150" step="0.1" value={settings.width}
        onChange={(event) => setSettings({ ...settings, width: Number(event.target.value) })} />
      <input aria-label="Label height in mm" type="number" min="12" max="100" step="0.1" value={settings.height}
        onChange={(event) => setSettings({ ...settings, height: Number(event.target.value) })} />
    </div>}
  </label>;
}

function labelFor(row, code, quantity, store, purchase) {
  return { id: row.id, name: row.name, barcode: code.barcode, format: code.format, quantity, store,
    mrp: purchase ? row.mrp : code.mrp ?? row.mrp, price: purchase ? row.price : code.price ?? row.price, sku: row.sku, unit: row.unit,
    batch: row.batch, expiry: row.expiry };
}

function BarcodePreview({ labels, settings, copies, onClose, onPrint, onPDF, busy, submitError, reprint = false }) {
  const { images, error, grid } = useMemo(() => {
    try {
      const grid = labelGrid(settings);
      const images = jobArtwork(labels.slice(0, settings.paper === "a4" ? grid.perPage : 8), settings);
      return { grid, images, error: "" };
    } catch (error) {
      return { error: error.message };
    }
  }, [labels, settings]);
  const count = labels.reduce((total, label) => total + label.quantity, 0) * copies;
  return <Modal title={reprint ? "Reprint barcode labels" : "Barcode print preview"} onClose={onClose}>
    {error ? <p role="alert" className="barcode-error">{error}</p> : <>
      <p className="barcode-meta">{count.toLocaleString("en-IN")} labels · {settings.width} × {settings.height} mm · {
        settings.paper === "a4" ? `A4, up to ${grid.perPage} labels per sheet` : "Thermal roll"
      }{settings.paper === "thermal" && labels.length > images.length && ` · Preview shows the first ${images.length} items`}</p>
      {settings.paper === "a4" ? <div className="barcode-sheet-preview">
        <div aria-label="First A4 sheet" className="barcode-sheet" style={{ aspectRatio: grid.pageWidth / grid.pageHeight }}>
          {Array.from(sheetLabels(images, copies)).slice(0, grid.perPage).map(({ label, image }, index) => {
            const { left, top } = labelPosition(index, settings, grid);
            return <img key={index} src={image} alt={label.name} style={{
              left: left / grid.pageWidth * 100 + "%", top: top / grid.pageHeight * 100 + "%",
              width: settings.width / grid.pageWidth * 100 + "%", height: settings.height / grid.pageHeight * 100 + "%",
            }} />;
          })}
        </div>
      </div> : <div className="barcode-samples">{images.map(({ label, image }, index) =>
        <figure key={label.id + ":" + index}><div className="barcode-thermal-preview"
          style={{ width: grid.pageWidth * 4, height: grid.pageHeight * 4 }}>
          <img src={image} alt={label.name + ", " + label.barcode} style={{
            width: settings.width * 4, height: settings.height * 4,
            ...(grid.rotate ? { transformOrigin: "0 0", transform: "translateX(" + settings.height * 4 + "px) rotate(90deg)" } : {}),
          }} /></div><figcaption>{label.quantity * copies} labels</figcaption></figure>)}</div>}
    </>}
    {submitError && <p className="barcode-error" role="alert">{submitError}</p>}
    <div className="barcode-actions">
      <button type="button" onClick={onClose}>Back</button>
      <button type="button" onClick={onPDF} disabled={busy || Boolean(error)}><Download size={16} /> Download PDF</button>
      <button type="button" className="primary" onClick={onPrint} disabled={busy || Boolean(error)}><Printer size={16} /> Print All Labels</button>
    </div>
  </Modal>;
}

function usePrintJob() {
  const context = useContext(BarcodeContext);
  const inflight = useRef(false);
  const attempt = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(action, specification, onDone) {
    if (inflight.current) return;
    const popup = action === "print" ? window.open("", "_blank") : null;
    if (action === "print" && !popup) return setError("Allow pop-ups for this ERP to open the print dialog.");
    if (popup) popup.document.body.textContent = "Preparing barcode labels…";
    inflight.current = true;
    setBusy(true);
    setError("");
    try {
      const signature = JSON.stringify({ action, ...specification });
      if (attempt.current?.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
      const job = await request(context.storeId, "jobs/", { id: attempt.current.id, action, ...specification });
      const artwork = jobArtwork(job.labels, job.settings);
      const logHandoff = () => request(context.storeId, `jobs/${job.id}/handoff/`, {}).then(context.updated).catch(() => {
        context.notify?.("The print job was prepared, but the handoff status could not be saved.");
      });
      if (action === "print") {
        popup.document.body.replaceChildren();
        await printLabelSheets(popup, job, artwork, logHandoff);
      } else {
        await downloadLabelPDF(job, artwork);
        await logHandoff();
      }
      attempt.current = null;
      context.updated();
      context.announce(action === "print" ? "Barcode print dialog requested." : "Barcode PDF download started.");
      onDone?.();
    } catch (error) {
      popup?.close();
      setError(error.message);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  return { submit, busy, error };
}

function QtyInput({ value, onChange, name }) {
  return <input className="barcode-qty" type="number" min="1" max={MAX_LABELS} step="1" value={value}
    aria-label={`Print quantity for ${name}`} onChange={(event) => onChange(event.target.value)} />;
}

function CodeChoice({ row, code, onChange }) {
  if (!row.codes.length) return <span className="barcode-warning">No barcode</span>;
  const note = code?.issue || (!goodCode(row) && row.codes[0]?.issue);
  return <div className="barcode-code">
    {row.codes.length === 1 ? <code>{row.codes[0].barcode}</code> : <select aria-label={`Barcode for ${row.name}`}
      value={code ? optionKey(code) : ""} onChange={(event) => onChange(row.codes.find((choice) => optionKey(choice) === event.target.value))}>
      {row.codes.map((choice) => <option key={optionKey(choice)} value={optionKey(choice)} disabled={Boolean(choice.issue)}>
        {choice.internal ? "Internal · " : ""}{choice.barcode}{choice.mrp != null ? ` · MRP ${formatMoney(choice.mrp)}` : ""}
      </option>)}
    </select>}
    {note && <small className="barcode-warning">{note}</small>}
  </div>;
}

function LabelBuilder({ mode, rows, preferences, reference, onGenerate, onSelectFiltered, search, pagination }) {
  const context = useContext(BarcodeContext);
  const [settings, setSettings] = useState(preferences.settings);
  const [picked, setPicked] = useState(() => new Map());
  const [quantities, setQuantities] = useState(() => new Map());
  const [codes, setCodes] = useState(() => new Map());
  const [copies, setCopies] = useState(1);
  const [allQuantity, setAllQuantity] = useState(1);
  const [preview, setPreview] = useState(null);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState("");
  const job = usePrintJob();
  const single = mode === "single";
  const purchase = mode === "purchase";
  const codeFor = (row) => row.codes.find((entry) => optionKey(entry) === codes.get(row.id)) || goodCode(row) || row.codes[0];
  const initialQuantity = (row) => purchase ? row.default_quantity ?? "" : 1;
  const quantityFor = (row) => quantities.get(row.id) ?? initialQuantity(row);
  const setQuantity = (row, value) => setQuantities((previous) => new Map(previous).set(row.id, value));
  const selectedRows = single ? rows.filter(goodCode) : [...picked.values()];
  const validQuantity = (value) => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= MAX_LABELS;
  const total = selectedRows.reduce((sum, row) => sum + Number(quantityFor(row) || 0), 0) * Number(copies || 0);
  const select = (row, value) => setPicked((previous) => {
    const next = new Map(previous);
    if (value) next.set(row.id, row);
    else next.delete(row.id);
    return next;
  });
  async function selectAll() {
    if (selecting) return;
    setSelecting(true);
    setError("");
    try {
      const results = onSelectFiltered ? await onSelectFiltered() : rows;
      const ready = results.filter(goodCode);
      setPicked((previous) => new Map([...previous, ...ready.map((row) => [row.id, row])]));
      if (ready.length < results.length) setError(`${results.length - ready.length} rows need a valid barcode before they can be selected.`);
    } catch (error) {
      setError(error.message);
    } finally {
      setSelecting(false);
    }
  }
  function setAll(useStock) {
    if (!useStock && !validQuantity(allQuantity)) return setError("Enter a whole label quantity of at least 1.");
    setError("");
    setQuantities((previous) => {
      const next = new Map(previous);
      for (const row of selectedRows) {
        if (useStock && !row.stock_labels) continue;
        next.set(row.id, useStock ? row.stock_labels : allQuantity);
      }
      return next;
    });
    if (useStock && selectedRows.some((row) => !row.stock_labels)) {
      setError("Stock quantity was applied to countable products with positive stock. Enter quantities for weight, volume or zero-stock items.");
    }
  }
  function prepare(selection) {
    if (!selection.length || selection.some((row) => !validQuantity(quantityFor(row)) || !codeFor(row) || codeFor(row).issue)) {
      throw new Error("Choose items with valid barcodes and enter a positive whole number of labels for each.");
    }
    if (!validQuantity(copies) || copies > 99) throw new Error("Enter 1 to 99 copies.");
    if (selection.reduce((sum, row) => sum + Number(quantityFor(row)), 0) * copies > MAX_LABELS) {
      throw new Error(`Print up to ${MAX_LABELS.toLocaleString("en-IN")} labels per job, including copies.`);
    }
    return {
      labels: selection.map((row) => labelFor(row, codeFor(row), Number(quantityFor(row)), preferences.store, purchase)),
      specification: {
        source: mode, purchase_reference: reference || "", settings, copies: Number(copies),
        lines: selection.map((row) => ({ id: row.id, barcode: codeFor(row).barcode, code_mrp: codeFor(row).mrp, quantity: Number(quantityFor(row)) })),
      },
    };
  }
  function run(action, selection = selectedRows) {
    setError("");
    try {
      const prepared = prepare(selection);
      if (action === "preview") setPreview(prepared);
      else {
        // Check dimensions before creating a job or opening a print window.
        labelGrid(settings);
        jobArtwork(prepared.labels, settings);
        job.submit(action, prepared.specification);
      }
    } catch (error) {
      setError(error.message);
    }
  }
  return <>
    <div className="barcode-toolbar">
      {search}
      <SizePicker settings={settings} setSettings={setSettings} />
      <label><span>Copies</span><input className="barcode-qty" type="number" min="1" max="99" value={copies}
        onChange={(event) => setCopies(event.target.value)} /></label>
    </div>
    {single && rows[0]?.can_generate && onGenerate && <button type="button" onClick={onGenerate}><Barcode size={15} /> Generate internal barcode</button>}
    {!single && <div className="barcode-toolbar barcode-selection">
      <button type="button" onClick={selectAll} disabled={selecting || job.busy}>{purchase ? "Select all" : "Select all filtered products"}</button>
      <button type="button" onClick={() => setPicked(new Map())} disabled={!picked.size || job.busy}>Deselect all</button>
      <div className="barcode-quantity-all"><QtyInput value={allQuantity} name="all selected items" onChange={setAllQuantity} />
        <button type="button" onClick={() => setAll(false)} disabled={!picked.size}>Set Quantity for All</button></div>
      {!purchase && <button type="button" onClick={() => setAll(true)} disabled={!picked.size}>Use current stock quantity</button>}
    </div>}
    <div className="barcode-table-wrap"><table className="inventory-table barcode-table">
      <thead><tr>{!single && <th scope="col">Select</th>}
        <th scope="col">Item code</th><th scope="col">Product</th><th scope="col">Barcode</th>
        {!single && !purchase && <><th scope="col">Category</th><th scope="col">Brand</th><th scope="col">Unit</th></>}
        <th scope="col">MRP</th><th scope="col">Selling price</th>
        {!single && <th scope="col">{purchase ? "Purchased" : "Available stock"}</th>}
        <th scope="col">Print quantity</th><th scope="col">Action</th>
      </tr></thead>
      <tbody>{rows.map((current) => {
        const row = picked.get(current.id) || current;
        const code = codeFor(row);
        return <tr key={row.id}>
          {!single && <td><input type="checkbox" aria-label={`Select ${row.name}`} checked={picked.has(row.id)}
            disabled={!goodCode(row)} onChange={(event) => select(row, event.target.checked)} /></td>}
          <td>{row.sku || "—"}</td><td><strong>{row.name}</strong>{row.batch && <small>{row.batch}</small>}</td>
          <td><CodeChoice row={row} code={code} onChange={(entry) => setCodes((previous) => new Map(previous).set(row.id, optionKey(entry)))} /></td>
          {!single && !purchase && <><td>{row.category || "—"}</td><td>{row.brand || "—"}</td><td>{row.unit || "—"}</td></>}
          <td>{formatMoney(purchase ? row.mrp : code?.mrp ?? row.mrp)}</td><td>{formatMoney(purchase ? row.price : code?.price ?? row.price)}</td>
          {!single && <td>{purchase ? row.purchase_quantity : `${row.stock.toLocaleString("en-IN")} ${row.unit}`}</td>}
          <td><QtyInput value={quantityFor(row)} name={row.name} onChange={(value) => setQuantity(row, value)} />
            {purchase && row.default_quantity == null && <small>Enter label count</small>}</td>
          <td>{goodCode(row) ? <button type="button" onClick={() => run("preview", [row])} disabled={job.busy}><Printer size={15} /> Print Barcode</button>
            : !single && !purchase && row.can_generate ? <ProductBarcodeButton product={row} /> : "—"}</td>
        </tr>;
      })}</tbody>
    </table>{!rows.length && <p>No matching items.</p>}</div>
    {pagination}
    <footer className="barcode-actions">
      <span className="barcode-summary" aria-live="polite">{selectedRows.length} selected · {total.toLocaleString("en-IN")} labels</span>
      <button type="button" onClick={() => run("preview")} disabled={!selectedRows.length || job.busy}>Print Preview</button>
      <button type="button" onClick={() => run("pdf")} disabled={!selectedRows.length || job.busy}><Download size={16} /> Download PDF</button>
      <button type="button" className="primary" onClick={() => run("print")} disabled={!selectedRows.length || job.busy}>
        <Printer size={16} /> {job.busy ? "Preparing…" : single ? "Print" : "Print Selected"}
      </button>
    </footer>
    {(error || job.error) && <p className="barcode-error" role="alert">{error || job.error}</p>}
    {preview && <BarcodePreview labels={preview.labels} settings={settings} copies={Number(copies)} onClose={() => setPreview(null)}
      onPrint={() => job.submit("print", preview.specification, () => setPreview(null))}
      onPDF={() => job.submit("pdf", preview.specification, () => setPreview(null))} busy={job.busy} submitError={job.error} />}
  </>;
}

function PrintDialog({ target }) {
  const context = useContext(BarcodeContext);
  const purchase = target.type === "purchase";
  const path = purchase ? `purchases/?reference=${encodeURIComponent(target.id)}` : `catalog/?item=${encodeURIComponent(target.id)}`;
  const record = useBarcodeData(context.storeId, path, context.revision);
  const preferences = useBarcodeData(context.storeId, "settings/");
  const [status, setStatus] = useState({ busy: false, error: "" });
  async function generate() {
    if (status.busy) return;
    setStatus({ busy: true, error: "" });
    try {
      await request(context.storeId, "generate/", { item: target.id });
      context.updated();
      await syncLocalStateKeyToCloud(`vestora-inventory-${context.storeId}`).catch(() => {});
      window.dispatchEvent(new CustomEvent("uvpro-kitchen-updated", { detail: { storeId: context.storeId } }));
      setStatus({ busy: false, error: "" });
    } catch (error) {
      setStatus({ busy: false, error: error.message });
    }
  }
  return <>
    <Loading state={record} /><Loading state={preferences} />
    {record.data && preferences.data && <>
      {purchase ? <div className="barcode-bill-meta"><strong>{record.data.id}</strong>
        <span>{record.data.invoice}</span><span>{record.data.supplier}</span><span>{record.data.date}</span>
      </div> : <h4>{record.data.name}</h4>}
      <LabelBuilder mode={target.type} rows={purchase ? record.data.rows : [record.data]} preferences={preferences.data}
        reference={purchase ? target.id : undefined}
        onGenerate={!purchase && preferences.data.access.manage && !status.busy ? generate : undefined} />
      {status.busy && <p role="status">Saving barcode…</p>}
      {status.error && <p className="barcode-error" role="alert">{status.error}</p>}
    </>}
  </>;
}

function ProductBrowser({ single, preferences }) {
  const context = useContext(BarcodeContext);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const criteria = `q=${encodeURIComponent(query)}`;
  const results = useBarcodeData(context.storeId, `catalog/?${criteria}&page=${page}`, context.revision);
  const rows = results.data?.rows || [];
  const search = <SearchBox value={query} onChange={(value) => { setQuery(value); setPage(1); }}
    placeholder="Search products by name, SKU, barcode, category or brand" />;
  const pagination = <Pagination page={page} setPage={setPage} total={results.data?.total || 0} />;
  return <><Loading state={results} />
    {single ? <>
      {search}
      <div className="barcode-table-wrap"><table className="inventory-table barcode-table"><thead><tr>
        <th>Item code</th><th>Product</th><th>Barcode</th><th>MRP</th><th>Selling price</th><th>Action</th>
      </tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.sku || "—"}</td><td><strong>{row.name}</strong></td>
        <td>{goodCode(row)?.barcode || row.codes[0]?.barcode || "—"}</td><td>{formatMoney(row.mrp)}</td><td>{formatMoney(row.price)}</td>
        <td><ProductBarcodeButton product={row} /></td></tr>)}</tbody></table></div>
      {pagination}
    </> : <LabelBuilder mode="bulk" rows={rows} preferences={preferences} search={search} pagination={pagination}
      onSelectFiltered={async () => (await request(context.storeId, `catalog/?${criteria}&all=1`)).rows} />}
  </>;
}

function PurchaseBrowser() {
  const context = useContext(BarcodeContext);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const results = useBarcodeData(context.storeId, `purchases/?q=${encodeURIComponent(query)}&page=${page}`);
  return <>
    <SearchBox value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search purchase number, supplier or invoice" />
    <Loading state={results} />
    {results.data && <><div className="barcode-table-wrap"><table className="inventory-table barcode-table">
      <thead><tr><th>Date</th><th>Purchase number</th><th>Supplier</th><th>Supplier invoice</th><th>Items</th><th>Action</th></tr></thead>
      <tbody>{results.data.rows.map((bill) => <tr key={bill.id}><td>{bill.date}</td><td><strong>{bill.id}</strong></td><td>{bill.supplier}</td>
        <td>{bill.invoice}</td><td>{bill.lines}</td><td><PurchaseBarcodeButton reference={bill.id} /></td></tr>)}</tbody>
    </table>{!results.data.rows.length && <p>No approved purchase bills match your search.</p>}</div>
      <Pagination page={page} setPage={setPage} total={results.data.total} />
    </>}
  </>;
}

function HistoryBrowser() {
  const context = useContext(BarcodeContext);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const history = useBarcodeData(context.storeId, `jobs/?page=${page}`, context.revision);
  const job = usePrintJob();
  return <>
    <Loading state={history} />
    {history.data && <><div className="barcode-table-wrap"><table className="inventory-table barcode-table">
      <thead><tr><th>Time</th><th>User</th><th>Branch</th><th>Items / barcodes</th><th>Labels</th><th>Source</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>{history.data.rows.map((row) => <tr key={row.id}>
        <td>{new Date(row.created_at).toLocaleString("en-IN")}</td><td>{row.user}</td><td>{row.branch}</td>
        <td><details><summary>{row.labels.length} {row.labels.length === 1 ? "item" : "items"}</summary>
          <ul>{row.labels.map((label, index) => <li key={index}>{label.name} · {label.barcode} · {label.quantity * row.copies}</li>)}</ul></details></td>
        <td>{row.label_count}</td><td>{{ single: "Single item", bulk: "Bulk", purchase: "Purchase bill" }[row.source]}
          {row.purchase_reference && <small>{row.purchase_reference}</small>}{row.reprint_of && <small>Reprint</small>}</td>
        <td>{statusLabels[row.status] || row.status}</td>
        <td><button type="button" onClick={() => setSelected(row)}><History size={15} /> Reprint</button></td>
      </tr>)}</tbody>
    </table>{!history.data.rows.length && <p>Barcode print and PDF jobs will appear here.</p>}</div>
      <Pagination page={page} setPage={setPage} total={history.data.total} />
    </>}
    {job.error && <p className="barcode-error" role="alert">{job.error}</p>}
    {selected && <BarcodePreview labels={selected.labels} settings={selected.settings} copies={selected.copies} reprint busy={job.busy} submitError={job.error}
      onClose={() => setSelected(null)} onPrint={() => job.submit("print", { reprint_of: selected.id }, () => setSelected(null))}
      onPDF={() => job.submit("pdf", { reprint_of: selected.id }, () => setSelected(null))} />}
  </>;
}

function Settings({ preferences }) {
  const context = useContext(BarcodeContext);
  const [settings, setSettings] = useState(preferences.settings);
  const [status, setStatus] = useState({ busy: false, error: "", saved: false });
  const disabled = !preferences.access.manage;
  function set(field, value) { setSettings((previous) => ({ ...previous, [field]: value })); }
  async function save(event) {
    event.preventDefault();
    setStatus({ busy: true, error: "", saved: false });
    try {
      labelGrid(settings);
      const saved = await request(context.storeId, "settings/", settings, "PUT");
      setSettings(saved.settings);
      setStatus({ busy: false, error: "", saved: true });
      context.updated();
    } catch (error) {
      setStatus({ busy: false, error: error.message, saved: false });
    }
  }
  const numbers = [
    ["margin", "Margin (mm)", 0, 25, 0.1], ["offset_x", "Horizontal alignment (mm)", -10, 10, 0.1],
    ["offset_y", "Vertical alignment (mm)", -10, 10, 0.1], ["dpi", "Printer DPI", 150, 600, 1],
    ["font", "Font size (pt)", 4, 18, 0.5], ["barcode_width", "Barcode width (%)", 40, 100, 1],
    ["barcode_height", "Barcode height (mm)", 3, 45, 0.1],
    ...(settings.paper === "a4" ? [["columns", "Labels per row", 1, 12, 1], ["gap_x", "Horizontal gap (mm)", 0, 20, 0.1],
      ["gap_y", "Vertical gap (mm)", 0, 20, 0.1]] : []),
  ];
  return <form onSubmit={save}>
    <fieldset className="barcode-settings" disabled={disabled || status.busy}>
      <label><span>Paper</span><select value={settings.paper} onChange={(event) => set("paper", event.target.value)}><option value="thermal">Thermal roll</option><option value="a4">A4 label sheet</option></select></label>
      <label><span>Orientation</span><select value={settings.orientation} onChange={(event) => set("orientation", event.target.value)}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
      <SizePicker settings={settings} setSettings={setSettings} />
      {numbers.map(([key, label, min, max, step]) => <label key={key}><span>{label}</span><input type="number" value={settings[key]}
        min={min} max={max} step={step} onChange={(event) => set(key, Number(event.target.value))} required /></label>)}
      <div className="barcode-field-list" aria-label="Label fields">{Object.entries(LABEL_FIELDS).map(([key, label]) => <label key={key}>
        <input type="checkbox" checked={settings.visible[key]} onChange={(event) => set("visible", { ...settings.visible, [key]: event.target.checked })} /> {label}
      </label>)}</div>
      <div className="barcode-actions"><button className="primary" type="submit">{status.busy ? "Saving…" : "Save Label Settings"}</button></div>
    </fieldset>
    {disabled && <p>Product Master permission is required to change store label settings.</p>}
    {status.saved && <p role="status">Label settings saved for this store.</p>}
    {status.error && <p className="barcode-error" role="alert">{status.error}</p>}
  </form>;
}

export function BarcodeWorkspace() {
  const context = useContext(BarcodeContext);
  const preferences = useBarcodeData(context.storeId, "settings/", context.revision);
  const [view, setView] = useState(context.catalog ? "bulk" : "purchase");
  const access = preferences.data?.access;
  const visible = views.filter(([value]) => ["bulk", "single"].includes(value) ? access?.catalog
    : value === "purchase" ? access?.purchase : true);
  const active = visible.some(([value]) => value === view) ? view : visible[0]?.[0];
  return <section className="screen barcode-workspace">
    <div className="inventory-page-head"><div><h2><Barcode size={25} /> Barcode Printing</h2></div></div>
    <Loading state={preferences} />
    {preferences.data && <>
      <nav className="barcode-tabs" aria-label="Barcode Printing views">{visible.map(([value, label]) => <button type="button" key={value}
        aria-pressed={active === value} className={active === value ? "active" : ""} onClick={() => setView(value)}>{label}</button>)}</nav>
      <section className="panel barcode-panel" aria-label={views.find(([value]) => value === active)?.[1]}>
        {active === "bulk" && <ProductBrowser key="bulk" preferences={preferences.data} />}
        {active === "single" && <ProductBrowser key="single" single preferences={preferences.data} />}
        {active === "purchase" && <PurchaseBrowser />}
        {active === "history" && <HistoryBrowser />}
        {active === "settings" && <Settings preferences={preferences.data} />}
      </section>
    </>}
  </section>;
}
