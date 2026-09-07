import { createClient } from "@supabase/supabase-js";

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = supabaseConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

export async function signInWithSupabase(email, password) {
  if (!supabase) return { data: null, error: new Error("Supabase frontend environment is not configured") };
  return supabase.auth.signInWithPassword({ email, password });
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
    throw new Error(message);
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

const syncableStateKey = (key) => key.startsWith("vestora-") && !/(user|password|token|credential|secret)/i.test(key);

export async function syncLocalStateToSupabase() {
  if (!supabaseConfigured) return;
  const entries = Object.entries(localStorage).filter(([key]) => syncableStateKey(key));
  await Promise.all(entries.map(([key, raw]) => {
    let value = raw;
    try { value = JSON.parse(raw); } catch { /* Keep non-JSON values as strings. */ }
    return supabaseFunctionJson("vestora-api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  }));
}

export async function hydrateLocalStateFromSupabase() {
  if (!supabaseConfigured) return false;
  const response = await supabaseFunctionFetch("vestora-api/state");
  if (!response.ok) throw new Error(`Supabase state request failed (${response.status})`);
  const rows = await response.json();
  if (!rows.length) return false;
  rows.forEach(({ state_key: key, state_value: value }) => localStorage.setItem(key, JSON.stringify(value)));
  return true;
}
