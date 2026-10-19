import { isInventoryStateKey } from "./inventory-sync.js";
import { createSharedSync } from "./shared-sync.js";
import { isBusinessKey, stateStore, sanitize } from "./business-state.js";

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
export const cloudConfigured = true;
const awsSessionKey = "uvpro-aws-session";
const awsListeners = new Set();

function readAwsSession() {
  try { return JSON.parse(window.localStorage.getItem(awsSessionKey) || "null"); }
  catch { return null; }
}

function writeAwsSession(session, event = "SIGNED_IN") {
  if (session) window.localStorage.setItem(awsSessionKey, JSON.stringify(session));
  else window.localStorage.removeItem(awsSessionKey);
  for (const listener of awsListeners) listener(event, session);
}

async function refreshAwsSession() {
  const previous = readAwsSession();
  if (!previous?.refresh_token) return null;
  const response = await fetch(`${apiBaseUrl}/api/auth/token/refresh/`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: previous.refresh_token }),
  });
  if (!response.ok) { writeAwsSession(null, "SIGNED_OUT"); return null; }
  const body = await response.json();
  const session = { ...previous, access_token: body.access, refresh_token: body.refresh || previous.refresh_token };
  writeAwsSession(session, "TOKEN_REFRESHED");
  return session;
}

async function awsRequest(path, options = {}, authenticated = true, retry = true) {
  const session = readAwsSession();
  const headers = {
    ...(authenticated && session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  };
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, signal: options.signal || AbortSignal.timeout(20000) });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("The store server did not respond in time. Check your connection and retry. Local records are retained.");
    throw error;
  }
  if (authenticated && response.status === 401 && retry && await refreshAwsSession()) {
    return awsRequest(path, options, authenticated, false);
  }
  return response;
}

function createAwsClient() {
  return { auth: {
    async getSession() { return { data: { session: readAwsSession() }, error: null }; },
    async signInWithPassword({ email, password }) {
      const response = await awsRequest("/api/cloud/auth/login/", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        signal: AbortSignal.timeout(8000),
      }, false);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        return { data: {}, error: new Error("The login API is unavailable or returned an invalid response. Check the server and retry.") };
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) return { data: {}, error: new Error(body?.error || "Sign-in failed") };
      if (!body?.access || !body?.refresh || !body?.user) {
        return { data: {}, error: new Error("The login API returned an incomplete response. Check the server configuration.") };
      }
      const session = { access_token: body.access, refresh_token: body.refresh, user: body.user };
      writeAwsSession(session);
      return { data: { session, user: body.user }, error: null };
    },
    async signOut() { writeAwsSession(null, "SIGNED_OUT"); return { error: null }; },
    async updateUser({ password }) {
      const response = await awsRequest("/api/cloud/auth/password/", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
      });
      const body = await response.json().catch(() => ({}));
      return response.ok ? { data: body, error: null } : { data: null, error: new Error(body.error || "Unable to change password") };
    },
    async resetPasswordForEmail() {
      return { data: null, error: new Error("Contact the administrator to reset this AWS account password") };
    },
    onAuthStateChange(listener) {
      awsListeners.add(listener);
      return { data: { subscription: { unsubscribe: () => awsListeners.delete(listener) } } };
    },
  } };
}

export const cloudClient = createAwsClient();

// Auth locks and network requests must not leave the store-loading gate pending
// forever. A timed-out write retains its mutation ID for safe acknowledgement.
async function bounded(operation, message, milliseconds = 20000) {
  let timer;
  try {
    return await Promise.race([operation, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function getCloudSession() {
  const result = await bounded(cloudClient.auth.getSession(), "Sign-in verification timed out. Close other UVPRO tabs and retry; your local records are retained.");
  if (result.error) throw result.error;
  return result.data.session;
}

export async function signInWithCloud(email, password) {
  return cloudClient.auth.signInWithPassword({ email, password });
}

export async function updateCloudPassword(password) {
  return cloudClient.auth.updateUser({ password });
}

export async function requestCloudPasswordReset(email) {
  return cloudClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

export async function cloudFetch(path, options = {}) {
  const target = String(path).startsWith("/") ? String(path) : `/${String(path)}`;
  if (!target.startsWith("/api/")) throw new Error(`Unsupported AWS API route: ${target}`);
  const publicRequest = target.startsWith("/api/public-order/");
  return awsRequest(target, options, !publicRequest);
}

export async function cloudRequestJson(path, options = {}) {
  const publicRequest = String(path).startsWith("/api/public-order/");
  const session = publicRequest ? null : await getCloudSession();
  if (!publicRequest && !session?.access_token) throw new Error("Your sign-in session has expired. Sign in again; local records are retained.");
  const headers = {
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  };
  try {
    return await cloudFetch(path, { ...options, headers, signal: options.signal || AbortSignal.timeout(20000) });
  } catch (error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") throw new Error("The store server did not respond in time. Check your connection and retry. Local records are retained.");
    throw error;
  }
}

export async function cloudJson(path, options = {}) {
  const response = await cloudRequestJson(path, options);
  const body = await bounded(response.json().catch(() => null), "The store server response timed out. Retry; local records are retained.");
  if (!response.ok) {
    const detail = body?.error || body?.message || `Store API request failed (${response.status})`;
    const endpoint = String(path).split("?")[0].replace(/\/+$/, "").split("/").pop();
    const message = `${detail} [${endpoint}: ${response.status}]`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function cloudApiList(resource, query = "") {
  const response = await cloudFetch(`/api/cloud/${resource}/${query ? `?${query}` : ""}`);
  if (!response.ok) throw new Error(`AWS API request failed (${response.status})`);
  return response.json();
}

export async function cloudApiRequest(resource, options = {}) {
  return cloudJson(`/api/cloud/${resource}/`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export async function cloudProfile() {
  const before = await getCloudSession();
  const profile = await cloudJson("/api/cloud/profile/");
  const session = await getCloudSession();
  if (!before || session?.user.id !== before.user.id) throw new Error("Sign-in changed. Please retry.");
  if (session) configureCloudSync(profile, session.user.id);
  return profile;
}

// One adapter owns every business save and refresh. Components use the local
// working copy; only acknowledged versions become the next merge baseline.
const rawStorage = window.localStorage;
const subscribers = new Set();
let syncContext = null;
let synchronizer = null;
let timer = null;
let refreshJob = null;
const failures = new Map();
const pending = new Set();
const storeAccessMessage = "Your store assignment no longer permits this data. Your local changes are retained; ask an administrator to restore access or sign in with the assigned store account.";
let status = { state: "connecting", message: "Connecting to store data…" };
export const getCloudSyncStatus = () => status;
export const subscribeBusinessState = (listener) => { subscribers.add(listener); return () => subscribers.delete(listener); };
function emit(key, value) {
  for (const listener of subscribers) listener();
  if (key) {
    window.dispatchEvent(new CustomEvent("vestora-cloud-list-synced", { detail: { key, value } }));
    if (isInventoryStateKey(key)) window.dispatchEvent(new CustomEvent("vestora-inventory-synced", { detail: { key, value } }));
  }
}
function report() {
  status = failures.size
    ? { state: "error", message: failures.get("connection") || [...failures.values()][0], pending: failures.size }
    : pending.size ? { state: "saving", message: "Saving store changes…", pending: pending.size }
    : { state: "synced", message: "Store data saved to cloud", pending: 0 };
  emit();
}
const allowedKey = (key) => isBusinessKey(key) && syncContext && (!stateStore(key) || syncContext.superAdmin || syncContext.stores.includes(stateStore(key)));
export function stopCloudSync() {
  syncContext = null; synchronizer = null;
  failures.clear(); pending.clear();
  window.clearTimeout(timer);
  status = { state: "connecting", message: "Connecting to store data…" }; emit();
}
function configureCloudSync(profile, userId) {
  const namespace = `${window.location?.origin || "local"}:${userId}`;
  const stores = [...new Set((profile.allowedStoreIds || (profile.storeId ? [profile.storeId] : [])).map(String))].sort();
  const superAdmin = Boolean(profile.isSuperuser || profile.role === "super_admin");
  if (syncContext?.namespace === namespace
    && syncContext.superAdmin === superAdmin
    && JSON.stringify(syncContext.stores) === JSON.stringify(stores)) return;
  stopCloudSync();
  const context = { namespace, superAdmin, stores };
  // Browser caches can outlive a login. Keep a recovery copy and expose only
  // the new login's store records to the application.
  if (!context.superAdmin) {
    for (const key of Object.keys(rawStorage).filter((key) => isBusinessKey(key) && !stateStore(key))) {
      const raw = rawStorage.getItem(key);
      let value;
      try { value = JSON.parse(raw); }
      catch { throw new Error(`A saved record (${key}) cannot be read. It has been retained for recovery; contact support.`); }
      if (!Array.isArray(value)) continue;
      const scoped = value.filter((item) => context.stores.includes(String(key === "vestora-stores" ? item.id : item.storeId || "")));
      if (JSON.stringify(scoped) !== raw) {
        rawStorage.setItem(`cloud-recovery:${namespace}:${key}`, raw);
        rawStorage.setItem(key, JSON.stringify(scoped));
      }
    }
  }
  syncContext = context;
  synchronizer = createSharedSync({
    storage: rawStorage, namespace,
    valid: () => syncContext === context,
    read: async (key) => {
      const rows = await cloudJson(`/api/cloud/state/?key=${encodeURIComponent(key)}`);
      if (!Array.isArray(rows)) throw new Error("Cloud data could not be read. Local changes are retained.");
      return rows.find((row) => row.state_key === key) || null;
    },
    write: (key, value, expectedUpdatedAt, mutationId) => cloudJson("/api/cloud/state/", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: sanitize(value), expectedUpdatedAt, mutationId }),
    }),
    changed: emit,
  });
}
export const businessStorage = {
  getItem: (key) => rawStorage.getItem(key),
  setItem(key, raw) {
    if (!isBusinessKey(key)) { rawStorage.setItem(key, raw); return; }
    // Effects run before session loading. Their defaults are not user edits.
    if (cloudConfigured && window.vestoraCloudStateReady !== true) return;
    if (rawStorage.getItem(key) === raw) return;
    rawStorage.setItem(key, raw);
    emit(key, JSON.parse(raw));
    if (cloudConfigured) {
      pending.add(key); report();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => syncLocalStateToCloud().catch(() => {}), 200);
    }
  },
  removeItem(key) {
    if (isBusinessKey(key)) { this.setItem(key, "null"); return; }
    rawStorage.removeItem(key);
  },
};
export async function syncLocalStateKeyToCloud(key, snapshot) {
  if (!isBusinessKey(key)) return;
  if (!synchronizer || window.vestoraCloudStateReady !== true) throw new Error("Waiting for verified store sign-in. Changes have not reached the cloud.");
  if (!allowedKey(key)) throw new Error("This login cannot access that store.");
  const sync = synchronizer;
  pending.add(key); report();
  try {
    const value = await sync.sync(key, snapshot);
    if (sync !== synchronizer) return;
    failures.delete(key); pending.delete(key); report();
    return value;
  } catch (error) {
    if (sync === synchronizer) { failures.set(key, error.message); pending.delete(key); report(); }
    throw error;
  }
}
export const syncInventoryState = syncLocalStateKeyToCloud;
export const syncVersionedSharedListState = syncLocalStateKeyToCloud;
export async function syncLocalStateToCloud() {
  if (!synchronizer || window.vestoraCloudStateReady !== true) return;
  if (refreshJob) return refreshJob;
  refreshJob = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const context = syncContext;
      try {
        const rows = await cloudJson("/api/cloud/state/");
        if (syncContext !== context) continue;
        const keys = new Set([...Object.keys(rawStorage).filter(allowedKey), ...rows.map((row) => row.state_key).filter(allowedKey)]);
        const byKey = new Map(rows.map((row) => [row.state_key, row]));
        const results = await Promise.allSettled([...keys].map((key) => syncLocalStateKeyToCloud(key, { row: byKey.get(key) })));
        const failure = results.find((result) => result.status === "rejected");
        if (failure) throw failure.reason;
        failures.delete("connection"); report();
        return;
      } catch (error) {
        if (error.status === 403 && attempt === 0 && syncContext === context) {
          await cloudProfile();
          if (syncContext !== context) continue;
        }
        if (syncContext === context) {
          failures.set("connection", error.status === 403 ? storeAccessMessage : error.message);
          report();
        }
        throw error;
      }
    }
  })().finally(() => { refreshJob = null; });
  return refreshJob;
}
export async function fetchSharedSuperAdminStores() {
  const rows = await cloudJson("/api/cloud/state/?key=vestora-stores");
  return rows.find((row) => row.state_key === "vestora-stores")?.state_value ?? [];
}
export async function hydrateLocalStateFromCloud() {
  if (!synchronizer) throw new Error("Store sign-in has not been verified. Please retry.");
  const sync = synchronizer;
  const rows = await cloudJson("/api/cloud/state/");
  if (sync !== synchronizer) throw new Error("Sign-in changed. Please retry.");
  if (!Array.isArray(rows)) throw new Error("The store server returned an invalid response. Please retry.");
  const keys = new Set([...Object.keys(rawStorage).filter(allowedKey), ...rows.map((row) => row.state_key).filter(allowedKey)]);
  // Retain browser-only additions. Backups are made before the first merge;
  // an existing checkpoint also preserves unsent edits across reloads.
  const byKey = new Map(rows.map((row) => [row.state_key, row]));
  const accessErrors = [];
  await Promise.allSettled([...keys].map(async (key) => {
    try { await sync.sync(key, { row: byKey.get(key) }); if (sync === synchronizer) failures.delete(key); }
    catch (error) {
      if (sync === synchronizer) failures.set(key, error.message);
      if (error.status === 403) accessErrors.push(error);
    }
  }));
  if (sync !== synchronizer) throw new Error("Sign-in changed. Please retry.");
  if (accessErrors.length) {
    await cloudProfile();
    if (sync !== synchronizer) return hydrateLocalStateFromCloud();
    failures.set("connection", storeAccessMessage);
  }
  report();
  return true;
}
