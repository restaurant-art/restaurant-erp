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
  const headers = { ...(await supabaseAuthHeaders()), ...(options.headers || {}) };
  return fetch(`${supabaseUrl}/functions/v1/${String(path).replace(/^\/+/, "")}`, { ...options, headers });
}
