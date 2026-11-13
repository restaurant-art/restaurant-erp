const cloudJson = async (...args) => (await import("./cloud.js")).cloudJson(...args);

export const pineCloudPreferenceKey = storeId => `uvpro-pine-cloud-${storeId}`;
export const pineCloudEnabled = (storage, storeId) => storage.getItem(pineCloudPreferenceKey(storeId)) === "true";
const route = storeId => `/api/cloud/pine-labs/${encodeURIComponent(storeId)}`;
export const pineCloudConnection = storeId => cloudJson(`${route(storeId)}/connection/`);
export const pineCloudPrintJob = (storeId, data) => cloudJson(`${route(storeId)}/print/`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
});

export function createCloudPaymentInvoker({ request = cloudJson, delay = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 60 } = {}) {
  return async (action, payment) => {
    if (payment.training || payment.method !== "UPI") throw new Error("Cloud QR payments require a live UPI checkout.");
    const send = command => request(`${route(payment.storeId)}/payment/${command}/`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payment),
    });
    let result = await send(action);
    for (let i = 0; result.status === "pending" && i < attempts; i++) {
      await delay(2500);
      result = await send("recover");
    }
    return result;
  };
}

export const invokePineCloud = createCloudPaymentInvoker();

// Only the server can grant a print claim, after verifying its own approved
// payment journal against the saved bill. A browser flag is not proof of payment.
export async function autoPrintPineBill({ bill, printer, print, job = pineCloudPrintJob }) {
  if (!bill || bill.training || bill.pineLabsTransport !== "cloud" || !printer?.autoPrintUpi) return "skipped";
  if (!printer.enabled || printer.type !== "QZ Tray" || !printer.name?.trim()) throw new Error("Payment is saved. Connect the billing printer, then use Print bill.");
  let claim;
  try {
    const sent = await print({ beforeSend: async () => {
      claim = await job(bill.storeId, { action: "claim", billId: bill.id });
      return claim.claimed;
    } });
    if (sent === false) return "already-attempted";
    if (!claim?.claimed) throw new Error("The print job was not verified.");
    try { await job(bill.storeId, { action: "result", billId: bill.id, jobId: claim.jobId, status: "submitted" }); }
    catch { return "submitted-unacknowledged"; }
    return "submitted";
  } catch (error) {
    if (claim?.claimed) await job(bill.storeId, { action: "result", billId: bill.id, jobId: claim.jobId, status: "unknown" }).catch(() => {});
    throw new Error(`Payment is saved. ${claim?.claimed ? "Check whether the bill printed before retrying Print bill." : "Automatic printing could not start; use Print bill after fixing the printer."} ${error.message || ""}`);
  }
}
