const virtualPrinterPattern = /(?:microsoft print to pdf|onenote|fax|xps|document writer|adobe pdf|print to file|pdfcreator|snagit)/i;
const receiptPrinterPattern = /(?:pos|receipt|thermal|bpos|epson tm|ess[a-z]*\s+pr[- ]?\d)/i;

function matchingPrinter(printers, candidate) {
  const normalized = String(candidate || "").trim().toLocaleLowerCase();
  if (!normalized) return "";
  return printers.find((printer) => printer.toLocaleLowerCase() === normalized) || "";
}

export function pickQzPrinter(printerNames, configuredName, defaultName) {
  const printers = Array.from(new Set((printerNames || []).map((printer) => String(printer || "").trim()).filter(Boolean)));
  if (!printers.length) return "";

  const configured = matchingPrinter(printers, configuredName);
  if (configured) return configured;

  const systemDefault = matchingPrinter(printers, defaultName);
  if (systemDefault && !virtualPrinterPattern.test(systemDefault)) return systemDefault;

  const receiptPrinter = printers.find((printer) => !virtualPrinterPattern.test(printer) && receiptPrinterPattern.test(printer));
  if (receiptPrinter) return receiptPrinter;

  const physicalPrinter = printers.find((printer) => !virtualPrinterPattern.test(printer));
  return physicalPrinter || systemDefault || printers[0];
}
