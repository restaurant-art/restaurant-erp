import JsBarcode from "jsbarcode";

export const LABEL_SIZES = [[25, 15], [30, 20], [38, 25], [40, 30], [50, 25], [50, 30]];
export const LABEL_FIELDS = {
  store: "Store name", product: "Product name", bars: "Barcode image", number: "Barcode number",
  mrp: "MRP", price: "Selling price", sku: "Item code", unit: "Pack size / unit", batch: "Batch number", expiry: "Expiry date",
};
export const MAX_LABELS = 5000;

const rupees = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(amount);

export function labelGrid(settings) {
  const thermal = settings.paper === "thermal";
  const rotate = thermal && settings.orientation === "landscape";
  const pageWidth = thermal ? (rotate ? settings.height : settings.width) : settings.orientation === "landscape" ? 297 : 210;
  const pageHeight = thermal ? (rotate ? settings.width : settings.height) : settings.orientation === "landscape" ? 210 : 297;
  const left = thermal ? 0 : settings.margin + settings.offset_x;
  const top = thermal ? 0 : settings.margin + settings.offset_y;
  const columns = thermal ? 1 : settings.columns;
  const gridWidth = columns * settings.width + (columns - 1) * settings.gap_x;
  const rows = thermal ? 1 : Math.floor((pageHeight - top - settings.margin + settings.gap_y + 1e-8) / (settings.height + settings.gap_y));
  if (rows < 1 || columns < 1 || left < 0 || top < 0 || (!thermal && left + gridWidth + settings.margin > pageWidth + 1e-8)) {
    throw new Error("The label grid does not fit on the selected sheet.");
  }
  return { pageWidth, pageHeight, left, top, columns, perPage: rows * columns, rotate };
}

export function labelPosition(index, settings, grid) {
  return {
    left: grid.left + (index % grid.columns) * (settings.width + settings.gap_x),
    top: grid.top + Math.floor(index / grid.columns) * (settings.height + settings.gap_y),
  };
}

export function barcodeModules(label) {
  const data = {};
  JsBarcode(data, label.barcode, { format: label.format, displayValue: false });
  return data.encodings.map((part) => part.data).join("");
}

function fitText(context, text, width, size, bold) {
  const setFont = (pixels) => { context.font = `${bold ? 700 : 500} ${pixels}px Arial, sans-serif`; };
  setFont(size);
  const desired = context.measureText(text).width;
  if (desired > width) setFont(Math.max(size * 0.78, size * width / desired));
  if (context.measureText(text).width <= width) return text;
  const characters = Array.from(text);
  while (characters.length && context.measureText(characters.join("") + "…").width > width) characters.pop();
  return characters.join("") + "…";
}

export function renderLabel(label, settings) {
  const canvas = document.createElement("canvas");
  const dot = settings.dpi / 25.4;
  canvas.width = Math.round(settings.width * dot);
  canvas.height = Math.round(settings.height * dot);
  const context = canvas.getContext("2d");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  const visible = settings.visible;
  const thermal = settings.paper === "thermal";
  const margin = thermal ? settings.margin : 0;
  const offsetX = thermal ? settings.offset_x : 0;
  const offsetY = thermal ? settings.offset_y : 0;
  const padX = Math.ceil((1 + margin + Math.abs(offsetX)) * dot);
  const padY = Math.ceil((0.7 + margin + Math.abs(offsetY)) * dot);
  const width = canvas.width - 2 * padX;
  const height = canvas.height - 2 * padY;
  const center = canvas.width / 2 + offsetX * dot;
  if (width <= 0 || height <= 0) throw new Error("Reduce the label margin or alignment offset.");

  const header = [
    visible.store && label.store && [label.store, true, 0.9],
    visible.product && label.name && [label.name, true, 1],
    (visible.mrp && label.mrp != null || visible.price && label.price != null) && [
      [visible.mrp && label.mrp != null && `MRP ${rupees(label.mrp)}`, visible.price && label.price != null && `SALE ${rupees(label.price)}`].filter(Boolean).join("   "), true, 1,
    ],
    (visible.sku && label.sku || visible.unit && label.unit) && [
      [visible.sku && label.sku, visible.unit && label.unit].filter(Boolean).join(" · "), false, 0.85,
    ],
    (visible.batch && label.batch || visible.expiry && label.expiry) && [
      [visible.batch && label.batch && `Batch ${label.batch}`, visible.expiry && label.expiry && `Exp ${label.expiry.slice(0, 10)}`].filter(Boolean).join(" · "), false, 0.85,
    ],
  ].filter(Boolean);
  const footer = visible.number ? [[label.barcode, false, 0.85]] : [];
  const font = settings.font * settings.dpi / 72;
  const barHeight = visible.bars ? Math.round(settings.barcode_height * dot) : 0;
  const gap = visible.bars ? Math.ceil(0.35 * dot) : 0;
  const lines = header.length + footer.length;
  const lineHeight = lines ? Math.min(font * 1.3, (height - barHeight - gap * 2) / lines) : 0;
  if (barHeight + gap * 2 > height || (lines && lineHeight < settings.dpi / 72 * 4.5)) {
    throw new Error("The label is too short for its fields. Reduce the barcode height, hide a field, or use a taller label.");
  }
  const blockHeight = lines * lineHeight + barHeight + gap * 2;
  let y = (canvas.height - blockHeight) / 2 + offsetY * dot;
  context.textAlign = "center";
  context.textBaseline = "middle";
  function write(rows) {
    for (const [text, bold, scale] of rows) {
      const value = fitText(context, String(text), width, Math.min(font, lineHeight * 0.82) * scale, bold);
      context.fillText(value, center, y + lineHeight / 2);
      y += lineHeight;
    }
  }
  write(header);
  if (visible.bars) {
    const modules = barcodeModules(label);
    const quiet = 11;
    const dots = Math.floor(width * settings.barcode_width / 100 / (modules.length + quiet * 2));
    const minimum = label.format === "CODE128" ? 0.17 : 0.264;
    if (dots < 1 || dots / dot + 0.0001 < minimum) {
      throw new Error(`${label.name}: the barcode is too wide for this label at ${settings.dpi} DPI. Use a wider label, a higher DPI, or increase the barcode width.`);
    }
    const left = Math.round(center - modules.length * dots / 2);
    const top = Math.round(y + gap);
    for (let index = 0; index < modules.length; index += 1) {
      if (modules[index] === "1") context.fillRect(left + index * dots, top, dots, barHeight);
    }
    y += barHeight + gap * 2;
  }
  write(footer);
  return canvas.toDataURL("image/png");
}

export function jobArtwork(labels, settings) {
  return labels.map((label) => ({ label, image: renderLabel(label, settings) }));
}

export function* sheetLabels(artwork, copies) {
  for (let copy = 0; copy < copies; copy += 1) {
    for (const entry of artwork) {
      for (let index = 0; index < entry.label.quantity; index += 1) yield entry;
    }
  }
}

export async function downloadLabelPDF(job, artwork) {
  const { PDFDocument, degrees } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const { settings } = job;
  const grid = labelGrid(settings);
  const points = (millimetres) => millimetres * 72 / 25.4;
  const embedded = new Map();
  let page;
  let slot = 0;
  for (const entry of sheetLabels(artwork, job.copies)) {
    if (slot === 0) page = pdf.addPage([points(grid.pageWidth), points(grid.pageHeight)]);
    const { left, top } = labelPosition(slot, settings, grid);
    if (!embedded.has(entry)) embedded.set(entry, await pdf.embedPng(entry.image));
    page.drawImage(embedded.get(entry), {
      x: points(grid.rotate ? settings.height : left),
      y: points(grid.rotate ? 0 : grid.pageHeight - top - settings.height),
      width: points(settings.width),
      height: points(settings.height),
      ...(grid.rotate ? { rotate: degrees(90) } : {}),
    });
    slot = (slot + 1) % grid.perPage;
  }
  const content = await pdf.save();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "application/pdf" }));
  link.download = `barcode-labels-${job.purchase_reference || job.id}.pdf`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

export async function printLabelSheets(popup, job, artwork, onPrint) {
  const { settings } = job;
  const grid = labelGrid(settings);
  const doc = popup.document;
  doc.title = "UV PRO · Barcode labels";
  const style = doc.createElement("style");
  style.textContent = `@page{size:${grid.pageWidth}mm ${grid.pageHeight}mm;margin:0}
    *{box-sizing:border-box}body{margin:0;background:#e8efeb;font:14px Arial,sans-serif}
    header{padding:14px;background:#fff;position:sticky;top:0;z-index:1}button{font:inherit;padding:8px 14px}
    .sheet{position:relative;width:${grid.pageWidth}mm;height:${grid.pageHeight}mm;background:white;margin:12px auto;break-inside:avoid;break-after:page;overflow:hidden}
    .sheet:last-child{break-after:auto}img{position:absolute;display:block;max-width:none}
    @media print{header{display:none}body{background:white}.sheet{margin:0}}`;
  doc.head.append(style);
  const controls = doc.createElement("header");
  const button = doc.createElement("button");
  button.textContent = "Print labels";
  const print = () => {
    onPrint();
    popup.focus();
    popup.print();
  };
  button.addEventListener("click", print);
  controls.append(button, doc.createTextNode("  Use Actual size (100%) and disable headers and footers."));
  doc.body.append(controls);
  let sheet;
  let slot = 0;
  for (const entry of sheetLabels(artwork, job.copies)) {
    if (slot === 0) {
      sheet = doc.createElement("div");
      sheet.className = "sheet";
      doc.body.append(sheet);
    }
    const position = labelPosition(slot, settings, grid);
    const image = doc.createElement("img");
    image.src = entry.image;
    image.alt = "";
    Object.assign(image.style, {
      left: `${grid.rotate ? settings.height : position.left}mm`, top: `${position.top}mm`,
      width: `${settings.width}mm`, height: `${settings.height}mm`,
      ...(grid.rotate ? { transformOrigin: "0 0", transform: "rotate(90deg)" } : {}),
    });
    sheet.append(image);
    slot = (slot + 1) % grid.perPage;
  }
  await Promise.all([...doc.images].map((image) => image.decode()));
  if (!popup.closed) print();
}
