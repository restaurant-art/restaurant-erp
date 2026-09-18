import { createClient } from "@supabase/supabase-js";
import { createInventorySync, isInventoryStateKey } from "./inventory-sync.js";

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
  return supabaseFunctionJson("vestora-api/profile");
}

// Business records must be shared between authenticated devices. Keep only
// account/session secrets and device-local workflow state on the browser.
// Do not use a broad `user` substring check here: `vestora-users` is business
// data and must sync, while `vestora-current-user` is the current login.
const localOnlyStateKey = (key) => (
  /^(vestora-(current-user|selected-store|super-admin-in-store|pos-cashier|current-shift|last-shift-close|offline-orders|theme-config|printer-choices|kot-printer|kot-printer-choices|supabase-hydrated-user))$/i.test(key)
  || /(password|token|credential|secret)/i.test(key)
);
const syncableStateKey = (key) => key.startsWith("vestora-") && !localOnlyStateKey(key);
const sharedSuperAdminStateKey = "vestora-stores";
// Store and branch directory changes are saved deliberately by the stores effect.
// Do not include that shared record in the background device-state sync, otherwise
// an older browser can overwrite the latest directory with its stale local copy.
const backgroundSyncableStateKey = (key) => syncableStateKey(key) && key !== sharedSuperAdminStateKey && !isInventoryStateKey(key);

const synchronizeInventory = createInventorySync({
  storage: localStorage,
  namespace: supabaseUrl,
  read: async (key) => {
    const rows = await supabaseFunctionJson(`vestora-api/state?key=${encodeURIComponent(key)}`);
    if (!Array.isArray(rows)) throw new Error("Unable to read cloud inventory; local data retained.");
    return rows.find((row) => row.state_key === key) || null;
  },
  write: (key, value, expectedUpdatedAt) => supabaseFunctionJson("vestora-api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value, expectedUpdatedAt }),
  }),
  changed: (key, value) => window.dispatchEvent(new CustomEvent("vestora-inventory-synced", { detail: { key, value } })),
});

export async function syncInventoryState(key) {
  if (!supabaseConfigured) throw new Error("Saved on this computer only. Cloud connection is not configured; use uvpro.in to share inventory.");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Saved on this computer only. Sign in to upload inventory.");
  return synchronizeInventory(key);
}

export async function fetchSharedSuperAdminStores() {
  if (!supabaseConfigured || !supabase) return null;
  const { data, error } = await supabase
    .from("vestora_shared_app_state")
    .select("state_value")
    .eq("state_key", sharedSuperAdminStateKey)
    .maybeSingle();
  if (!error) return Array.isArray(data?.state_value) ? data.state_value : null;

  // Keep the directory available when the browser's direct table read is
  // blocked by an older RLS policy. The authenticated Edge Function applies
  // the same authorization checks while using its server-side database role.
  const rows = await supabaseFunctionJson(`vestora-api/state?key=${encodeURIComponent(sharedSuperAdminStateKey)}`);
  const sharedRow = Array.isArray(rows) ? rows.find((row) => row?.state_key === sharedSuperAdminStateKey) : null;
  return Array.isArray(sharedRow?.state_value) ? sharedRow.state_value : null;
}

export async function syncLocalStateToSupabase() {
  if (!supabaseConfigured) return;
  const entries = Object.entries(localStorage).filter(([key]) => backgroundSyncableStateKey(key));
  await Promise.all(entries.map(([key]) => syncLocalStateKeyToSupabase(key)));
}

export async function syncLocalStateKeyToSupabase(key) {
  if (!supabaseConfigured || !syncableStateKey(key)) return;
  // Components can mount while the authenticated session is still hydrating.
  // Do not let their starter/local defaults overwrite the shared snapshot.
  if (typeof window !== "undefined" && window.vestoraSupabaseStateReady !== true) return;
  if (isInventoryStateKey(key)) return syncInventoryState(key);
  const raw = localStorage.getItem(key);
  if (raw === null) return;
  let value = raw;
  try { value = JSON.parse(raw); } catch { /* Keep non-JSON values as strings. */ }
  value = JSON.parse(JSON.stringify(value, (field, entry) => /(password|token|credential|secret|access.?key|api.?key)/i.test(field) ? undefined : entry));

  if (key === sharedSuperAdminStateKey && supabase) {
    const { error: sharedStateError } = await supabase
      .from("vestora_shared_app_state")
      .upsert({ state_key: key, state_value: value, updated_at: new Date().toISOString() }, { onConflict: "state_key" });
    if (!sharedStateError) return;
  }

  await supabaseFunctionJson("vestora-api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
}

export async function hydrateLocalStateFromSupabase(storeId = "") {
  if (!supabaseConfigured) return false;
  let sharedStateHydrated = false;
  if (supabase) {
    const { data: sharedState, error: sharedStateError } = await supabase
      .from("vestora_shared_app_state")
      .select("state_key, state_value, updated_at")
      .eq("state_key", sharedSuperAdminStateKey)
      .maybeSingle();
    if (!sharedStateError && sharedState) {
      localStorage.setItem(sharedState.state_key, JSON.stringify(sharedState.state_value));
      sharedStateHydrated = true;
    }
  }

  const query = storeId ? `?storeId=${encodeURIComponent(storeId)}` : "";
  const response = await supabaseFunctionFetch(`vestora-api/state${query}`);
  if (!response.ok) {
    throw new Error(`Supabase state request failed (${response.status})`);
  }
  const rows = await response.json();
  if (!rows.length) return sharedStateHydrated;
  // Inventory has its own versioned merge. Never hydrate over browser-only
  // items (including items created while earlier cloud PUT requests failed).
  rows.filter(({ state_key: key }) => !isInventoryStateKey(key))
    .forEach(({ state_key: key, state_value: value }) => localStorage.setItem(key, JSON.stringify(value)));
  return true;
}
