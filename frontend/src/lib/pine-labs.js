// The bridge exists only in the UVPRO Android shell. A browser/PWA cannot call
// Pine Labs' Android intent API. Do not substitute a web redirect for this bridge.
const waiting = new Map();
let connectedBridge;

export const hasPineLabsBridge = () => typeof globalThis.window?.UvproPineLabs?.postMessage === "function";

export function pineLabsRequest(action, data = {}, { timeout = 180000 } = {}) {
  const bridge = globalThis.window?.UvproPineLabs;
  if (!bridge?.postMessage) return Promise.reject(new Error("Open UVPRO in the Android terminal app to use Pine Labs."));
  if (connectedBridge !== bridge) {
    connectedBridge = bridge;
    bridge.onmessage = ({ data: message }) => {
      let reply;
      try { reply = JSON.parse(message); } catch { return; }
      const pending = waiting.get(reply.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      waiting.delete(reply.id);
      if (reply.error) pending.reject(new Error(reply.error));
      else pending.resolve(reply.result);
    };
  }
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error("Terminal response is pending. Recover this saved checkout; do not collect the payment again."));
    }, timeout);
    waiting.set(id, { resolve, reject, timer });
    try { bridge.postMessage(JSON.stringify({ id, action, ...data })); }
    catch {
      clearTimeout(timer); waiting.delete(id);
      reject(new Error("Could not contact the terminal. Recover the saved checkout before trying another payment."));
    }
  });
}

export function paymentPaise(value) {
  const amount = Number(value);
  const paise = Math.round((amount + Number.EPSILON) * 100);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(paise) || paise <= 0 || paise > 999999999 || Math.abs(amount * 100 - paise) > 0.0001) {
    throw new Error("Terminal payment must be a positive amount with at most two decimal places.");
  }
  return paise;
}

export function terminalTenders(bill) {
  const tenders = bill.payment === "Split" ? bill.splitPayments || [] : [{ method: bill.payment, amount: bill.paidAmount }];
  return tenders.map((tender, index) => ({ ...tender, index }))
    .filter(({ method, amount }) => ["Card", "UPI"].includes(method) && Number(amount) > 0)
    .map(({ method, amount, index }) => ({ method, amountPaise: paymentPaise(amount), index }));
}

export function validateTerminalResult(result, payment) {
  if (!result || result.paymentKey !== payment.paymentKey || result.billId !== payment.billId ||
      result.storeId !== payment.storeId || result.method !== payment.method ||
      result.amountPaise !== payment.amountPaise || result.status !== "approved" ||
      !result.billingRef || !result.transactionReference || !result.approvalCode) {
    throw new Error(result?.status === "not_started" ? "Payment did not start. Check Pine Labs activation and Application ID, then recover this checkout."
      : result?.status === "pending"
      ? "Payment is pending on Pine Labs. Use Recover saved checkout to check its result."
      : "Payment is not confirmed for this bill. Check the terminal and recover this checkout; do not charge again.");
  }
  // Deliberately never retain PAN, expiry, customer name or raw provider data.
  return Object.fromEntries(["paymentKey", "billId", "storeId", "method", "amountPaise", "status", "billingRef",
    "transactionReference", "approvalCode", "terminalId", "invoiceNumber", "batchNumber", "completedAt"]
    .map(key => [key, result[key] ?? ""]));
}

export async function collectTerminalPayments({ bill, storeId, userId, training = false, persist, invoke = pineLabsRequest, onProgress = () => {} }) {
  if (training || bill.training) throw new Error("Training bills cannot use the payment terminal.");
  if (!bill.pineLabsRequired) return bill;
  const tenders = terminalTenders(bill).filter(tender => bill.pineLabsTransport !== "cloud" || tender.method === "UPI");
  if (!tenders.length) throw new Error("This saved terminal checkout has no Card or UPI payment.");
  bill.terminalPayments ||= {};
  for (const tender of tenders) {
    const payment = { paymentKey: `${bill.id}:${tender.index}`, billId: bill.id, storeId: String(storeId), userId: String(userId || "POS"),
      method: tender.method, amountPaise: tender.amountPaise, training: false };
    const previous = bill.terminalPayments[tender.index];
    if (previous?.status === "approved") {
      validateTerminalResult(previous, payment);
      continue;
    }
    // Persist before crossing into Android. Recovery queries the durable native
    // journal; it never blindly resends a possibly completed payment.
    bill.terminalPayments[tender.index] = { ...payment, status: "pending" };
    persist(bill);
    onProgress(bill.pineLabsTransport === "cloud" ? "Waiting for UPI payment on the A910S. The bill will complete after Pine Labs confirms payment…" : `${previous ? "Checking" : "Opening"} Pine Labs ${tender.method} payment…`);
    let result = await invoke(previous ? "recover" : "pay", payment);
    if (previous && result?.status === "not_started") result = await invoke("pay", payment);
    const verified = validateTerminalResult(result, payment);
    bill.terminalPayments[tender.index] = verified;
    persist(bill);
  }
  bill.paymentStatus = Number(bill.creditAmount) > 0 ? "Outstanding" : "Terminal confirmed";
  persist(bill);
  return bill;
}
