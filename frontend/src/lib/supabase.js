import { createClient } from "@supabase/supabase-js";
import { isInventoryStateKey } from "./inventory-sync.js";
import { createSharedSync } from "./shared-sync.js";
import { isBusinessKey, stateStore, sanitize } from "./business-state.js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = String(
  import.meta.env.VITE_SUPABASE_ANON_KEY
  || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || "",
);

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function signInWithSupabase(email, password) {
  if (!supabase) return { data: null, error: new Error("Supabase frontend environment is not configured") };
  return supabase.auth.signInWithPassword({ email, password });
}

export async function updateSupabasePassword(password) {
  if (!supabase) return { data: null, error: new Error("Supabase frontend environment is not configured") };
  return supabase.auth.updateUser({ password });
}

export async function requestSupabasePasswordReset(email) {
  if (!supabase) return { data: null, error: new Error("Supabase frontend environment is not configured") };
  return supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
}

export async function supabaseAuthHeaders() {
  return supabaseAnonKey ? { apikey: supabaseAnonKey } : {};
}

export async function supabaseFunctionFetch(path, options = {}) {
  if (!supabaseConfigured) throw new Error("Supabase frontend environment is not configured");
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    ...(await supabaseAuthHeaders()),
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...(options.headers || {}),
  };
  return fetch(`${supabaseUrl}/functions/v1/${String(path).replace(/^\/+/, "")}`, { ...options, headers });
}

export async function supabaseFunctionJson(path, options = {}) {
  const response = await supabaseFunctionFetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error || `Supabase API request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return body;
}

export async function supabaseApiList(resource, query = "") {
  const response = await supabaseFunctionFetch(`vestora-api/${resource}${query ? `?${query}` : ""}`);
  if (!response.ok) throw new Error(`Supabase API request failed (${response.status})`);
  return response.json();
}

export async function supabaseApiRequest(resource, options = {}) {
  return supabaseFunctionJson(`vestora-api/${resource}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
}

export async function supabaseProfile() {
  const profile = await supabaseFunctionJson("vestora-api/profile");
  const { data: { session } } = await supabase.auth.getSession();
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
    ? { state: "error", message: [...failures.values()][0], pending: failures.size }
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
  const namespace = `${supabaseUrl}:${userId}`;
  if (syncContext?.namespace === namespace) return;
  stopCloudSync();
  const context = { namespace, superAdmin: profile.isSuperuser || profile.role === "super_admin", stores: profile.allowedStoreIds || (profile.storeId ? [profile.storeId] : []) };
  syncContext = context;
  // Browser caches can outlive a login. Keep a recovery copy and expose only
  // the new login's store records to the application.
  if (!context.superAdmin) {
    for (const key of Object.keys(rawStorage).filter((key) => isBusinessKey(key) && !stateStore(key))) {
      const raw = rawStorage.getItem(key);
      const value = JSON.parse(raw);
      if (!Array.isArray(value)) continue;
      const scoped = value.filter((item) => context.stores.includes(String(key === "vestora-stores" ? item.id : item.storeId || "")));
      if (JSON.stringify(scoped) !== raw) {
        rawStorage.setItem(`cloud-recovery:${namespace}:${key}`, raw);
        rawStorage.setItem(key, JSON.stringify(scoped));
      }
    }
  }
  synchronizer = createSharedSync({
    storage: rawStorage, namespace,
    valid: () => syncContext === context,
    read: async (key) => {
      const rows = await supabaseFunctionJson(`vestora-api/state?key=${encodeURIComponent(key)}`);
      if (!Array.isArray(rows)) throw new Error("Cloud data could not be read. Local changes are retained.");
      return rows.find((row) => row.state_key === key) || null;
    },
    write: (key, value, expectedUpdatedAt, mutationId) => supabaseFunctionJson("vestora-api/state", {
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
    if (supabaseConfigured && window.vestoraSupabaseStateReady !== true) return;
    if (rawStorage.getItem(key) === raw) return;
    rawStorage.setItem(key, raw);
    emit(key, JSON.parse(raw));
    if (supabaseConfigured) {
      pending.add(key); report();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => syncLocalStateToSupabase().catch(() => {}), 200);
    }
  },
  removeItem(key) {
    if (isBusinessKey(key)) { this.setItem(key, "null"); return; }
    rawStorage.removeItem(key);
  },
};
export async function syncLocalStateKeyToSupabase(key, snapshot) {
  if (!isBusinessKey(key)) return;
  if (!supabaseConfigured) throw new Error("Saved on this computer only. Cloud connection is not configured.");
  if (!synchronizer || window.vestoraSupabaseStateReady !== true) throw new Error("Waiting for verified store sign-in. Changes have not reached the cloud.");
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
export const syncInventoryState = syncLocalStateKeyToSupabase;
export const syncVersionedSharedListState = syncLocalStateKeyToSupabase;
export async function syncLocalStateToSupabase() {
  if (!synchronizer || window.vestoraSupabaseStateReady !== true) return;
  if (refreshJob) return refreshJob;
  const context = syncContext;
  refreshJob = (async () => {
    const rows = await supabaseFunctionJson("vestora-api/state");
    if (syncContext !== context) return;
    const keys = new Set([...Object.keys(rawStorage).filter(allowedKey), ...rows.map((row) => row.state_key).filter(allowedKey)]);
    const byKey = new Map(rows.map((row) => [row.state_key, row]));
    const results = await Promise.allSettled([...keys].map((key) => syncLocalStateKeyToSupabase(key, { row: byKey.get(key) })));
    const failure = results.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    failures.delete("connection"); report();
  })().catch((error) => { if (syncContext === context) { failures.set("connection", error.message); report(); } throw error; }).finally(() => { refreshJob = null; });
  return refreshJob;
}
export async function fetchSharedSuperAdminStores() {
  const rows = await supabaseFunctionJson("vestora-api/state?key=vestora-stores");
  return rows.find((row) => row.state_key === "vestora-stores")?.state_value ?? [];
}
export async function hydrateLocalStateFromSupabase() {
  if (!supabaseConfigured || !synchronizer) return false;
  const rows = await supabaseFunctionJson("vestora-api/state");
  const keys = new Set([...Object.keys(rawStorage).filter(allowedKey), ...rows.map((row) => row.state_key).filter(allowedKey)]);
  // Retain browser-only additions. Backups are made before the first merge;
  // an existing checkpoint also preserves unsent edits across reloads.
  const byKey = new Map(rows.map((row) => [row.state_key, row]));
  await Promise.allSettled([...keys].map(async (key) => {
    try { await synchronizer.sync(key, { row: byKey.get(key) }); failures.delete(key); }
    catch (error) { failures.set(key, error.message); }
  }));
  report();
  return true;
}
