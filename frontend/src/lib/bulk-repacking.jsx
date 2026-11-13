import React, { useMemo, useState } from "react";
import { Boxes, Package, Plus, Printer, RotateCcw, Scale, Search, Tag, X } from "lucide-react";
import { calculateBulkRepack, calculateBulkRepackBatch, calculateBulkRepackReversal, createBulkRepackTransaction, createRepackProduct, formatRepackWeight, repackWeightFactor, reverseBulkRepack } from "./bulk-repacking.js";
import { barcodeModules } from "./barcode-print-layout.js";
import { isProductEnabled } from "./product-availability.js";
import "./bulk-repacking.css";

const money = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value) || 0);
const blankPackSize = () => ({ id: globalThis.crypto?.randomUUID?.() || `size-${Date.now()}-${Math.random()}`, packSize: "500", packUnit: "g", packCount: "", sellingPrice: "", mrp: "" });
const blankRepackLine = () => ({ id: globalThis.crypto?.randomUUID?.() || `line-${Date.now()}-${Math.random()}`, sourceId: "", sizes: [blankPackSize()] });
const labelCode = (product) => product.internalBarcode || product.barcode;
function RepackBarcode({ value }) {
  if (!value) return <span className="bulk-repack-no-barcode">Barcode unavailable</span>;
  const bits = barcodeModules({ barcode: value, format: value.length === 5 ? "CODE128" : "EAN13" });
  const width = bits.length + 20;
  return <svg className="bulk-repack-barcode" viewBox={`0 0 ${width} 42`} role="img" aria-label={`Barcode ${value}`}>
    {[...bits].map((bit, index) => bit === "1" && <rect key={index} x={10 + index} y="1" width="1" height="28" fill="#101510" />)}
    <text x={width / 2} y="40" textAnchor="middle">{value}</text>
  </svg>;
}

function BarcodeLabel({ product }) {
  return <article className="bulk-repack-label">
    <strong>{product.name}</strong>
    <small>{product.packWeight || "Weighed pack"}</small>
    <RepackBarcode value={labelCode(product)} />
    <div><b>{labelCode(product)}</b><span>{money(product.sellingPrice)}</span></div>
  </article>;
}

export function BulkRepackingWorkspace({ products = [], setProducts, transactions = [], setTransactions, unreconciled = [], postRun, pendingRun, canSave = false, notify = () => {} }) {
  const [draft, setDraft] = useState(() => ({ lines: [blankRepackLine()] }));
  const [search, setSearch] = useState("");
  const [latestProducts, setLatestProducts] = useState([]);
  const [labelCounts, setLabelCounts] = useState({});
  const [lastError, setLastError] = useState("");
  const [reverseDraft, setReverseDraft] = useState({ productId: "", packCount: "" });
  const [reverseError, setReverseError] = useState("");
  const [saving, setSaving] = useState(false);
  const [reconcileDraft, setReconcileDraft] = useState({ productId: "", count: "", reason: "" });
  const [reconcileError, setReconcileError] = useState("");
  const reconcileProduct = unreconciled.find((product) => String(product.id) === reconcileDraft.productId);
  const reversibleProducts = products.filter((item) => isProductEnabled(item) && item.repackedFromProductId && Number(item.stock) >= 1)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const reverseProduct = products.find((item) => String(item.id) === reverseDraft.productId) || null;
  const reverseSource = products.find((item) => String(item.id) === String(reverseProduct?.repackedFromProductId)) || null;
  let reversePreview = null;
  let reversePreviewError = "";
  if (reverseDraft.productId && reverseDraft.packCount !== "") {
    try { reversePreview = calculateBulkRepackReversal(reverseSource, reverseProduct, reverseDraft.packCount); }
    catch (error) { reversePreviewError = error.message; }
  }
  const sourceProducts = useMemo(() => products.filter((item) => isProductEnabled(item) && !item.parentProductId && repackWeightFactor(item.unit) > 0 && Number(item.stock || 0) > 0)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))), [products]);
  const repackRows = useMemo(() => draft.lines.map((line) => {
    const source = sourceProducts.find((item) => String(item.id) === String(line.sourceId)) || null;
    const sizes = line.sizes.map((size) => {
      const packGrams = Number(size.packSize) * repackWeightFactor(size.packUnit);
      const existingPack = source && packGrams > 0 ? products.find((item) => String(item.repackedFromProductId) === String(source.id) && Math.abs(Number(item.packSizeGrams || 0) - packGrams) < 0.001) : null;
      const sourceGrams = source ? repackWeightFactor(source.unit) : 0;
      const sourceQuantityPerPack = sourceGrams ? packGrams / sourceGrams : 0;
      const suggestedPrice = existingPack?.sellingPrice ?? (source ? Number(source.sellingPrice || source.price || 0) * sourceQuantityPerPack : 0);
      const suggestedMrp = existingPack?.mrp ?? (source?.mrp ? Number(source.mrp) * sourceQuantityPerPack : "");
      const unitPrice = size.sellingPrice !== "" ? size.sellingPrice : (suggestedPrice > 0 ? Number(suggestedPrice).toFixed(2) : "");
      const mrp = size.mrp !== "" ? size.mrp : (suggestedMrp !== "" && Number(suggestedMrp) > 0 ? Number(suggestedMrp).toFixed(2) : "");
      let preview = null;
      let previewError = "";
      if (source && Number(size.packCount) > 0 && Number(size.packSize) > 0) {
        try { preview = calculateBulkRepack(source, size); }
        catch (error) { previewError = error.message; }
      }
      return { ...size, sourceId: line.sourceId, source, existingPack, unitPrice, mrp, preview, previewError };
    });
    return { ...line, source, sizes };
  }), [draft.lines, sourceProducts, products]);
  const flatRows = repackRows.flatMap((row) => row.sizes);
  const readyRows = flatRows.filter((row) => row.preview && !row.previewError);
  const totalRepackGrams = readyRows.reduce((sum, row) => sum + row.preview.totalGrams, 0);
  const totalPackCount = readyRows.reduce((sum, row) => sum + row.preview.packCount, 0);
  let batchPreviewError = "";
  if (readyRows.length === flatRows.length) {
    try { calculateBulkRepackBatch(flatRows, sourceProducts); }
    catch (error) { batchPreviewError = error.message; }
  }
  const allRowsReady = flatRows.length > 0 && readyRows.length === flatRows.length && !batchPreviewError;
  const history = transactions.filter((entry) => ["Bulk Repacking", "Bulk Repacking Reversal"].includes(entry.type))
    .sort((a, b) => String(b.createdAt || b.date || "").localeCompare(String(a.createdAt || a.date || "")));
  const repackedProductCount = products.filter((item) => item.repackedFromProductId).length;
  const packedStock = products.filter((item) => item.repackedFromProductId).reduce((sum, item) => sum + Number(item.stock || 0), 0);
  const visibleHistory = history.filter((entry) => !search.trim() || `${entry.sourceItemName} ${entry.outputItemName} ${entry.barcode} ${entry.type}`.toLowerCase().includes(search.trim().toLowerCase()));

  async function reconcile(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setReconcileError("");
    try {
      const lines = reconcileProduct ? [{ product_id: reconcileProduct.id, expected_stock: reconcileProduct.stock,
        pack_count: reconcileDraft.count }] : [];
      const result = await postRun("reconcile", lines, reconcileDraft.reason);
      const entry = result.repack_transactions[0];
      setReconcileDraft({ productId: "", count: "", reason: "" });
      notify(`${entry.outputQuantity} verified packs recorded for ${entry.outputItemName}.`);
    } catch (error) {
      setReconcileError(error.message || "Could not reconcile this pack.");
    } finally {
      setSaving(false);
    }
  }

  async function saveReversal(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setReverseError("");
    setSaving(true);
    try {
      if (postRun) {
        const result = await postRun("reverse", [{ product_id: reverseDraft.productId, pack_count: reverseDraft.packCount }]);
        const entry = result.repack_transactions[0];
        setLatestProducts((current) => current.filter(({ product }) => String(product.id) !== String(entry.outputItemId)));
        setReverseDraft({ productId: "", packCount: "" });
        notify(`${entry.outputQuantity} packs returned to bulk. ${entry.sourceQuantity} ${entry.sourceUnit} added to ${entry.sourceItemName}.`);
        return;
      }
      const result = reverseBulkRepack(products, reverseDraft.productId, reverseDraft.packCount);
      setProducts(result.products);
      setTransactions((current) => [result.transaction, ...(Array.isArray(current) ? current : [])]);
      setLatestProducts((current) => current.filter(({ product }) => String(product.id) !== reverseDraft.productId));
      setReverseDraft({ productId: "", packCount: "" });
      notify(`${result.plan.packCount} packs returned to bulk. ${result.plan.bulkQuantityReturned} ${result.transaction.sourceUnit} added to ${result.transaction.sourceItemName}.`);
    } catch (error) {
      setReverseError(error.message || "Could not reverse this repack");
    } finally {
      setSaving(false);
    }
  }

  function updateLine(lineId, nextPatch) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, ...nextPatch, ...(Object.hasOwn(nextPatch, "sourceId") ? { sizes: line.sizes.map((size) => ({ ...size, sellingPrice: "", mrp: "" })) } : {}) } : line) }));
    setLastError("");
  }

  function updateSize(lineId, sizeId, nextPatch, resetPrices = false) {
    setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === lineId ? { ...line, sizes: line.sizes.map((size) => size.id === sizeId ? { ...size, ...nextPatch, ...(resetPrices ? { sellingPrice: "", mrp: "" } : {}) } : size) } : line) }));
    setLastError("");
  }

  async function saveRepack(event) {
    event.preventDefault();
    if (!canSave || saving) return;
    setLastError("");
    setSaving(true);
    try {
      if (postRun) {
        const result = await postRun("pack", flatRows.map((row) => ({
          source_id: row.sourceId, pack_count: row.packCount, pack_grams: row.preview?.packGrams,
          selling_price: row.unitPrice, mrp: row.mrp,
        })));
        setLatestProducts(result.outputs);
        setLabelCounts(Object.fromEntries(result.outputs.map(({ product, packCount }) => [product.id, String(packCount)])));
        setDraft({ lines: [blankRepackLine()] });
        notify(`${result.outputs.reduce((count, output) => count + output.packCount, 0)} packs recorded in Main store.`);
        return;
      }
      const batchPlan = calculateBulkRepackBatch(draft.lines.flatMap((line) => line.sizes.map((size) => ({ ...size, sourceId: line.sourceId }))), sourceProducts);
      const now = new Date().toISOString();
      let nextProducts = [...products];
      const outputRuns = [];
      const newTransactions = [];
      for (const { line, source, plan } of batchPlan.lines) {
        const row = flatRows.find((entry) => entry.id === line.id);
        const sellingPrice = Number(row?.unitPrice);
        if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) throw new Error(`Enter a selling price greater than zero for ${source.name}`);
        const mrpValue = row.mrp === "" ? "" : Number(row.mrp);
        if (mrpValue !== "" && (!Number.isFinite(mrpValue) || mrpValue < sellingPrice)) throw new Error(`MRP must be at least the selling price for ${source.name}`);
        const existingPack = nextProducts.find((item) => item.repackedFromProductId === source.id && Math.abs(Number(item.packSizeGrams || 0) - plan.packGrams) < 0.001);
        const outputProduct = existingPack
          ? { ...existingPack, stock: Number(existingPack.stock || 0) + plan.packCount, sellingPrice, mrp: mrpValue, updatedAt: now }
          : createRepackProduct(source, plan, { sellingPrice, mrp: mrpValue, products: nextProducts, id: `INV-RPK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, now });
        const updatedSource = { ...source, stock: plan.sourceQuantityRemaining, updatedAt: now };
        nextProducts = nextProducts.some((item) => item.id === outputProduct.id)
          ? nextProducts.map((item) => item.id === source.id ? updatedSource : item.id === outputProduct.id ? outputProduct : item)
          : [outputProduct, ...nextProducts.map((item) => item.id === source.id ? updatedSource : item)];
        newTransactions.push(createBulkRepackTransaction(source, outputProduct, plan, { id: `TRN-RPK-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`, date: now.slice(0, 10), now }));
        outputRuns.push({ product: outputProduct, packCount: plan.packCount });
      }
      setProducts(nextProducts);
      setTransactions((current) => [...newTransactions, ...(Array.isArray(current) ? current : [])]);
      setLatestProducts(outputRuns);
      setLabelCounts(Object.fromEntries(outputRuns.map(({ product, packCount }) => [product.id, String(packCount)])));
      setDraft({ lines: [blankRepackLine()] });
      const quantityBySource = [...new Set(batchPlan.lines.map(({ source }) => String(source.id)))].map((id) => {
        const source = batchPlan.lines.find((entry) => String(entry.source.id) === id).source;
        const used = batchPlan.lines.filter((entry) => String(entry.source.id) === id).reduce((sum, entry) => sum + entry.plan.sourceQuantityUsed, 0);
        return `${Number(used.toFixed(6))} ${source.unit} ${source.name}`;
      }).join(" · ");
      notify(`${batchPlan.totalPacks} packs created from ${batchPlan.productCount} bulk products (${formatRepackWeight(batchPlan.totalGrams)} total). ${quantityBySource} deducted.`);
    } catch (error) {
      setLastError(error.message || "Could not save this repack run");
    } finally {
      setSaving(false);
    }
  }

  function printLabels() {
    const counts = latestProducts.map(({ product }) => Math.floor(Number(labelCounts[product.id])));
    const totalLabels = counts.reduce((sum, count) => sum + count, 0);
    if (!latestProducts.length || latestProducts.some(({ product }, index) => !labelCode(product) || !Number.isFinite(counts[index]) || counts[index] < 1) || totalLabels > 500) {
      setLastError("Choose at least 1 label for each product, with no more than 500 labels in total");
      return;
    }
    setLastError("");
    setTimeout(() => window.print(), 80);
  }

  const printableLabels = [];
  for (const { product } of latestProducts) {
    const remaining = 500 - printableLabels.length;
    if (remaining <= 0) break;
    const count = Math.min(remaining, Math.max(0, Math.floor(Number(labelCounts[product.id]) || 0)));
    for (let index = 0; index < count; index += 1) printableLabels.push({ product, index });
  }

  return <section className="screen inventory-screen bulk-repacking-screen">
    <div className="inventory-page-head">
      <div className="inventory-title-block"><span className="inventory-title-icon"><Scale size={24} /></span><div><span>Inventory / Stock processing</span><h2>Bulk Repacking</h2><p>Turn bulk stock into retail packs, manage labels, and track every movement.</p></div></div>
      <div className="inventory-head-actions"><button type="button" onClick={() => setLatestProducts([])}><Plus size={17} /> New repack run</button></div>
    </div>

    <div className="inventory-metrics bulk-repack-metrics">
      <article><span className="inventory-metric-icon"><Boxes size={21} /></span><div><small>Bulk materials</small><strong>{sourceProducts.length}</strong><em>Weight-based items in stock</em></div></article>
      <article><span className="inventory-metric-icon"><Package size={21} /></span><div><small>Pack products</small><strong>{repackedProductCount}</strong><em>Sellable weights created</em></div></article>
      <article><span className="inventory-metric-icon"><Scale size={21} /></span><div><small>Finished packs in stock</small><strong>{packedStock.toLocaleString("en-IN")}</strong><em>Available to sell in ERP POS</em></div></article>
      <article><span className="inventory-metric-icon"><Tag size={21} /></span><div><small>Repack runs</small><strong>{history.filter((entry) => entry.type === "Bulk Repacking").length}</strong><em>Stock movement history</em></div></article>
    </div>

    {postRun && (unreconciled.length > 0 || pendingRun?.("reconcile")) && <form className="panel bulk-repack-form" onSubmit={reconcile}>
      <div className="bulk-repack-section-head"><div><h3>Reconcile older packs</h3><p>Count the unopened packs you have in Main store. Posting records those packs and deducts their weight from bulk stock.</p></div></div>
      <div className="bulk-repack-fields">
        <label><span>Older pack</span><select required value={reconcileDraft.productId} onChange={(event) => setReconcileDraft({ ...reconcileDraft, productId: event.target.value, count: "" })}>
          <option value="">Select a pack</option>{unreconciled.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.stock} previously recorded</option>)}
        </select></label>
        <label><span>Unopened packs counted</span><input type="number" min="0" step="1" required value={reconcileDraft.count} onChange={(event) => setReconcileDraft({ ...reconcileDraft, count: event.target.value })} /></label>
        <label><span>Reason</span><input required value={reconcileDraft.reason} onChange={(event) => setReconcileDraft({ ...reconcileDraft, reason: event.target.value })} /></label>
      </div>
      {reconcileError && <p role="alert">{reconcileError}</p>}
      <div className="bulk-repack-actions">{pendingRun?.("reconcile")
        ? <button type="button" disabled={saving || !canSave} onClick={reconcile}>Retry reconciliation</button>
        : <button type="submit" disabled={saving || !canSave || !reconcileProduct}>Post verified pack count</button>}</div>
    </form>}
    <div className="bulk-repack-layout">
      <form className="panel bulk-repack-form" onSubmit={saveRepack}>
        <div className="bulk-repack-section-head"><div><span>01 / REPACK RUN</span><h3>Weigh and create packs</h3><p>Select your bulk products, then set the weight and quantity of each pack.</p></div><span className="bulk-repack-head-icon"><Scale size={21} /></span></div>
        <section className="bulk-repack-lines-section" aria-label="Bulk products to repack">
          <div className="bulk-repack-lines-heading"><div><h4>Bulk products</h4><p>Add up to four pack sizes per product. Each size gets its own price and barcode.</p></div><button type="button" onClick={() => { setDraft((current) => ({ ...current, lines: [...current.lines, blankRepackLine()] })); setLastError(""); }} disabled={draft.lines.length >= sourceProducts.length}><Plus size={15} /> Add product</button></div>
          <div className="bulk-repack-line-list">
            {repackRows.map((row, index) => {
              const selectedElsewhere = new Set(draft.lines.filter((line) => line.id !== row.id).map((line) => String(line.sourceId)).filter(Boolean));
              const selectableSources = sourceProducts.filter((item) => String(item.id) === String(row.sourceId) || !selectedElsewhere.has(String(item.id)));
              return <article className="bulk-repack-line" key={row.id}>
                <div className="bulk-repack-line-head"><div className="bulk-repack-line-title"><span>{String(index + 1).padStart(2, "0")}</span><strong>{row.source?.name || `Product ${index + 1}`}</strong></div><div className="bulk-repack-line-options"><span className="bulk-repack-tax-badge">{row.source?.gstRate == null || row.source.gstRate === "" ? "GST from bulk product" : `GST ${row.source.gstRate}%`}</span>{draft.lines.length > 1 && <button type="button" onClick={() => { setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.id !== row.id) })); setLastError(""); }} aria-label={`Remove product ${index + 1}`} title="Remove product"><X size={15} /></button>}</div></div>
                <div className="bulk-repack-fields"><label className="bulk-repack-source"><span>Bulk product</span><select required value={row.sourceId} onChange={(event) => updateLine(row.id, { sourceId: event.target.value })}><option value="">Select bulk stock</option>{selectableSources.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.stock).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {item.unit}</option>)}</select>{row.source && <small>Available now: <strong>{Number(row.source.stock).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {row.source.unit}</strong></small>}</label></div>
                <div className="bulk-repack-sizes-heading"><strong>Pack sizes <span>{row.sizes.length}/4</span></strong><button type="button" disabled={row.sizes.length >= 4} onClick={() => { const used = new Set(row.sizes.map((size) => Number(size.packSize) * repackWeightFactor(size.packUnit))); const nextWeight = [250, 500, 750, 1000].find((weight) => !used.has(weight)) || 250; setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === row.id ? { ...line, sizes: [...line.sizes, { ...blankPackSize(), packSize: String(nextWeight) }] } : line) })); setLastError(""); }}><Plus size={14} /> Add pack size</button></div>
                <div className="bulk-repack-size-list">{row.sizes.map((size, sizeIndex) => <div className="bulk-repack-size-card" key={size.id}>
                  <div className="bulk-repack-size-head"><strong>Size {sizeIndex + 1} <span>{formatRepackWeight(Number(size.packSize) * repackWeightFactor(size.packUnit)) || "Set weight"}</span></strong>{row.sizes.length > 1 && <button type="button" onClick={() => { setDraft((current) => ({ ...current, lines: current.lines.map((line) => line.id === row.id ? { ...line, sizes: line.sizes.filter((entry) => entry.id !== size.id) } : line) })); setLastError(""); }} aria-label={`Remove pack size ${sizeIndex + 1}`}><X size={14} /></button>}</div>
                  <div className="bulk-repack-fields">
                    <label><span>Each pack weighs</span><div className="bulk-repack-inline"><input type="number" min="0.001" step="0.001" required value={size.packSize} onChange={(event) => updateSize(row.id, size.id, { packSize: event.target.value }, true)} /><select value={size.packUnit} onChange={(event) => updateSize(row.id, size.id, { packUnit: event.target.value }, true)} aria-label={`Pack weight unit for product ${index + 1}, size ${sizeIndex + 1}`}><option value="g">g</option><option value="kg">kg</option><option value="mg">mg</option></select></div></label>
                    <label><span>Number of packs</span><input type="number" min="1" step="1" required placeholder="e.g. 20" value={size.packCount} onChange={(event) => updateSize(row.id, size.id, { packCount: event.target.value })} /></label>
                    <label><span>Selling price / pack</span><div className="bulk-repack-money-input"><span>₹</span><input type="number" min="0.01" step="0.01" required placeholder="Enter price" value={size.unitPrice} onChange={(event) => updateSize(row.id, size.id, { sellingPrice: event.target.value })} /></div></label>
                    <label><span>MRP / pack <small>(optional)</small></span><div className="bulk-repack-money-input"><span>₹</span><input type="number" min="0" step="0.01" placeholder="Optional" value={size.mrp} onChange={(event) => updateSize(row.id, size.id, { mrp: event.target.value })} /></div></label>
                  </div>
                  {size.preview && <p className="bulk-repack-line-usage">{size.preview.packCount} packs use {size.preview.sourceQuantityUsed} {row.source.unit}.</p>}
                  {size.previewError && <p className="bulk-repack-line-error" role="alert">{size.previewError}</p>}
                </div>)}</div>
                {row.source && <p className="bulk-repack-line-usage">Total for {row.source.name}: {Number(row.sizes.filter((size) => size.preview).reduce((sum, size) => sum + size.preview.sourceQuantityUsed, 0).toFixed(6))} {row.source.unit} planned across {row.sizes.length} size{row.sizes.length === 1 ? "" : "s"}.</p>}
              </article>;
            })}
          </div>
        </section>
        <div className="bulk-repack-preview" aria-live="polite">
          <span className="bulk-repack-preview-icon"><Scale size={19} /></span>
          <div><strong>Total to repack</strong><small>{allRowsReady ? `${repackRows.length} products · ${flatRows.length} sizes ready` : `${readyRows.length} of ${flatRows.length} sizes ready`} · {totalPackCount} packs planned</small></div>
          <b>{formatRepackWeight(totalRepackGrams) || "0 g"}</b>
        </div>
        {(batchPreviewError || lastError) && <p className="bulk-repack-error" role="alert">{batchPreviewError || lastError}</p>}
        <div className="bulk-repack-actions"><span><Boxes size={16} /> Bulk and finished stock update together.</span>{pendingRun?.("pack")
          ? <button className="primary" type="button" disabled={!canSave || saving} onClick={saveRepack}>Retry saved repack</button>
          : <button className="primary" type="submit" disabled={!canSave || saving || !allRowsReady}><Package size={17} /> Record repack</button>}</div>
      </form>

      <div className="bulk-repack-tools">
      <aside className="panel bulk-repack-label-card">
        <div className="bulk-repack-section-head"><div><span>02 / BARCODE LABELS</span><h3>Print pack labels</h3><p>A unique label for every product and pack size.</p></div><span className="bulk-repack-head-icon"><Printer size={21} /></span></div>
        {latestProducts.length > 0 ? <>
          <div className="bulk-repack-label-runs">{latestProducts.map(({ product }) => <div className="bulk-repack-label-run" key={product.id}>
            <div className="bulk-repack-latest-product"><span><Package size={17} /></span><div><strong>{product.name}</strong><small>SKU {product.sku} · Barcode {labelCode(product)}</small></div></div>
            <label className="bulk-repack-copies"><span>Labels for {product.name}</span><input type="number" min="1" max="500" step="1" value={labelCounts[product.id] ?? "1"} onChange={(event) => setLabelCounts((current) => ({ ...current, [product.id]: event.target.value }))} /></label>
            <div className="bulk-repack-label-preview"><BarcodeLabel product={product} /></div>
          </div>)}</div>
          <button className="bulk-repack-print-button" type="button" onClick={printLabels}><Printer size={17} /> Print barcode labels</button>
        </> : <div className="bulk-repack-label-empty"><div className="bulk-repack-empty-label" aria-hidden="true"><span /><i /><b /></div><strong>Your labels will appear here</strong><span>Record a repack run to preview labels and choose how many to print.</span><small><Printer size={13} /> Ready for barcode printing</small></div>}
      </aside>

    <form className="panel bulk-repack-form bulk-repack-reverse" onSubmit={saveReversal} aria-label="Reverse repacked items to bulk">
      <div className="bulk-repack-section-head"><div><span>03 / RETURN TO BULK</span><h3>Reverse repacked items</h3><p>Return unsold packs to their original bulk stock.</p></div><span className="bulk-repack-head-icon"><RotateCcw size={21} /></span></div>
      <div className="bulk-repack-fields">
        <label><span>Repacked product</span><select required disabled={!canSave} value={reverseDraft.productId} onChange={(event) => { setReverseDraft({ productId: event.target.value, packCount: "" }); setReverseError(""); }}><option value="">Select repacked stock</option>{reversibleProducts.map((item) => <option key={item.id} value={item.id}>{item.name} · {Number(item.stock).toLocaleString("en-IN")} packs available</option>)}</select></label>
        <label><span>Packs to reverse</span><div className="bulk-repack-reverse-quantity"><input type="number" min="1" max={reverseProduct ? Math.floor(Number(reverseProduct.stock)) : undefined} step="1" required disabled={!canSave || !reverseProduct} value={reverseDraft.packCount} placeholder="Enter pack count" onChange={(event) => { setReverseDraft((current) => ({ ...current, packCount: event.target.value })); setReverseError(""); }} /><button type="button" disabled={!canSave || !reverseProduct} onClick={() => { setReverseDraft((current) => ({ ...current, packCount: String(Math.floor(Number(reverseProduct.stock))) })); setReverseError(""); }}>All available</button></div></label>
      </div>
      {reverseProduct && <div className={`bulk-repack-preview${reversePreviewError ? " is-error" : ""}`} aria-live="polite"><span className="bulk-repack-preview-icon"><RotateCcw size={19} /></span><div><strong>{reversePreview ? `Return ${reversePreview.bulkQuantityReturned} ${reverseSource.unit} to ${reverseSource.name}` : reversePreviewError || `Return to ${reverseSource?.name || "original bulk product unavailable"}`}</strong><small>{reversePreview ? `${reversePreview.packQuantityRemaining} packs will remain. Bulk stock after reversal: ${reversePreview.bulkQuantityAfter} ${reverseSource.unit}.` : "Enter the number of packs to preview the stock return."}</small></div>{reversePreview && <b>{formatRepackWeight(reversePreview.totalGrams)}</b>}</div>}
      {!reversibleProducts.length && <p className="bulk-repack-line-usage">No unsold repacked stock is available to return.</p>}
      {reverseError && <p className="bulk-repack-error" role="alert">{reverseError}</p>}
      <div className="bulk-repack-actions"><span><Boxes size={16} /> Packed stock decreases and the same weight returns to bulk stock.</span>{pendingRun?.("reverse")
        ? <button type="button" disabled={!canSave || saving} onClick={saveReversal}>Retry saved reversal</button>
        : <button type="submit" disabled={!canSave || saving || !reversePreview}><RotateCcw size={17} /> Reverse to bulk</button>}</div>
    </form>
      </div>
    </div>

    <section className="panel bulk-repack-history">
      <div className="bulk-repack-history-head"><div><span>STOCK MOVEMENTS</span><h3>Repacking activity <span className="bulk-repack-activity-count">{history.length}</span></h3><p>Track packed quantities and returns to bulk.</p></div><label className="bulk-repack-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product or barcode" /></label></div>
      <div className="bulk-repack-table-wrap"><table><thead><tr><th>Date</th><th>Movement</th><th>Bulk product</th><th>Bulk quantity</th><th>Finished pack</th><th>Quantity</th><th>Barcode</th></tr></thead><tbody>
        {visibleHistory.slice(0, 20).map((entry) => <tr key={entry.id}><td>{entry.date || "—"}</td><td><span className={`bulk-repack-movement${entry.type === "Bulk Repacking Reversal" ? " is-reversed" : ""}`}>{entry.type === "Bulk Repacking Reversal" ? <RotateCcw size={12} /> : <Package size={12} />}{entry.type === "Bulk Repacking Reversal" ? "Returned to bulk" : "Packed"}</span></td><td><strong>{entry.sourceItemName}</strong></td><td>{Number(entry.sourceQuantity).toLocaleString("en-IN", { maximumFractionDigits: 3 })} {entry.sourceUnit}</td><td><strong>{entry.outputItemName}</strong></td><td>{Number(entry.outputQuantity).toLocaleString("en-IN")} packs</td><td><code>{entry.barcode}</code></td></tr>)}
        {!visibleHistory.length && <tr><td colSpan="7" className="bulk-repack-empty-history">{history.length ? "No repack history matches this search." : "No repacking recorded yet. Your stock movements will appear here."}</td></tr>}
      </tbody></table></div>
    </section>

    {latestProducts.length > 0 && <div className="bulk-repacking-print-sheet" aria-hidden="true">{printableLabels.map(({ product, index }) => <BarcodeLabel key={`${product.id}-${index}`} product={product} />)}</div>}
  </section>;
}
