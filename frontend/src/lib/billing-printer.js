export const defaultBillingPrinter = {
  enabled: false,
  name: "",
  type: "QZ Tray",
  ip: "",
  port: "9100",
  paper: "80mm",
  copies: 1,
  autoPrint: false,
  status: "Disconnected",
};

function parsePrinter(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function loadBillingPrinter(storage, paper = "80mm") {
  const saved = parsePrinter(storage.getItem("vestora-billing-printer"));
  if (saved) return { ...defaultBillingPrinter, ...saved, autoPrint: false, status: "Disconnected" };
  // Bills previously used the KOT connection. Copy it once, retaining the
  // previous billing paper size and single copy, then persist independently.
  const legacy = parsePrinter(storage.getItem("vestora-kot-printer"));
  if (legacy?.type === "QZ Tray" && legacy.name?.trim()) {
    return {
      ...defaultBillingPrinter,
      name: legacy.name,
      paper,
      enabled: true,
    };
  }
  return { ...defaultBillingPrinter, paper };
}

export function billingPrintOptions(printer) {
  if (!printer?.enabled || printer.type !== "QZ Tray" || !printer.name?.trim()) return null;
  return {
    printerName: printer.name,
    paper: printer.paper === "58mm" ? "58mm" : "80mm",
    copies: Math.max(1, Math.min(5, Math.floor(Number(printer.copies) || 1))),
  };
}
