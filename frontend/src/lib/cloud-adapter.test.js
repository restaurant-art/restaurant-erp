import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createSharedSync } from "./shared-sync.js";
import { isBusinessKey, stateStore, sanitize } from "./business-state.js";
import { isInventoryStateKey } from "./inventory-sync.js";
const source = readFileSync(new URL("./supabase.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("import.meta.env", "environment").replace(/^export /gm, "");
function device(rows, profile = { role: "super_admin", isSuperuser: true }) {
  const values = {};
  const storage = new Proxy(values, { get: (target, key) => key === "getItem" ? (k) => target[k] ?? null : key === "setItem" ? (k, v) => { target[k] = v; } : key === "removeItem" ? (k) => { delete target[k]; } : target[key] });
  const timers = [];
  const events = [];
  let revision = 0;
  const context = {
    environment: { VITE_SUPABASE_URL: "https://test.invalid", VITE_SUPABASE_ANON_KEY: "public-test" },
    window: { localStorage: storage, vestoraSupabaseStateReady: false, dispatchEvent: (e) => events.push(e), setTimeout: (cb) => timers.push(cb), clearTimeout: () => {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    createClient: () => ({ auth: { getSession: async () => ({ data: { session: { user: { id: "verified-user" }, access_token: "mock-session" } } }) } }),
    fetch: async (url, options = {}) => {
      if (url.endsWith("/profile")) return Response.json(profile);
      const key = new URL(url).searchParams.get("key");
      if (options.method !== "PUT") return Response.json(key ? (rows.has(key) ? [rows.get(key)] : []) : [...rows.values()]);
      const body = JSON.parse(options.body);
      if ((rows.get(body.key)?.updated_at ?? null) !== body.expectedUpdatedAt) return Response.json({ error: "Conflict" }, { status: 409 });
      const row = { state_key: body.key, state_value: body.value, updated_at: String(++revision) };
      rows.set(body.key, row); return Response.json(row);
    },
    createSharedSync, isBusinessKey, stateStore, sanitize, isInventoryStateKey,
    URL, Response, Set, Map, JSON, Promise, AbortSignal, setTimeout, clearTimeout,
  };
  vm.runInNewContext(source + "\nglobalThis.adapter = { businessStorage, hydrateLocalStateFromSupabase, supabaseProfile, syncLocalStateToSupabase, getCloudSyncStatus, subscribeBusinessState, stopCloudSync };", context);
  return { ...context.adapter, raw: storage, events, context,
    ready: async () => { await context.adapter.supabaseProfile(); await context.adapter.hydrateLocalStateFromSupabase(); context.window.vestoraSupabaseStateReady = true; },
  };
}
test("the real adapter saves omitted-effect writes, refreshes an open device and confirms cloud acknowledgement", async () => {
  const rows = new Map(), a = device(rows), b = device(rows);
  await a.ready(); await b.ready();
  let notifications = 0; b.subscribeBusinessState(() => notifications++);
  const key = "vestora-menu-items-A";
  a.businessStorage.setItem(key, JSON.stringify([{ id: "rice", price: 100 }]));
  assert.equal(a.getCloudSyncStatus().state, "saving");
  await a.syncLocalStateToSupabase(); await b.syncLocalStateToSupabase();
  assert.equal(JSON.parse(b.raw.getItem(key))[0].id, "rice");
  assert.ok(notifications > 0);
  assert.equal(a.getCloudSyncStatus().state, "synced");
  assert.ok(b.events.some((event) => event.detail?.key === key));
});

test("gateway error messages are retained instead of hidden by a generic API error", async () => {
  const a = device(new Map());
  a.context.fetch = async () => Response.json({ message: "Invalid JWT" }, { status: 401 });
  await assert.rejects(a.supabaseProfile(), /Invalid JWT \[profile: 401\]/);
});

test("a stalled auth lock fails with a retryable message", async () => {
  const a = device(new Map());
  a.context.setTimeout = (callback) => setTimeout(callback, 5);
  vm.runInNewContext("supabase.auth.getSession = () => new Promise(() => {})", a.context);
  await assert.rejects(a.supabaseProfile(), /Sign-in verification timed out/);
});

test("network timeout preserves browser records and exposes a clear error", async () => {
  const a = device(new Map());
  a.raw.setItem("vestora-inventory-A", '[{"id":"rice","stock":10}]');
  a.context.fetch = async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; };
  await assert.rejects(a.supabaseProfile(), /store server did not respond in time/);
  assert.equal(a.raw.getItem("vestora-inventory-A"), '[{"id":"rice","stock":10}]');
});

test("failed cache configuration does not leave a half-configured session on retry", async () => {
  const a = device(new Map(), { role: "cashier", storeId: "A", allowedStoreIds: ["A"] });
  a.raw.setItem("vestora-stores", "invalid-json");
  await assert.rejects(a.supabaseProfile(), /saved record.*cannot be read/);
  assert.equal(a.raw.getItem("vestora-stores"), "invalid-json");
  // Simulate a support-assisted repair; the application must not destroy it.
  a.raw.setItem("vestora-stores", '[]');
  await a.ready();
  a.businessStorage.setItem("vestora-inventory-A", '[{"id":"rice"}]');
  await a.syncLocalStateToSupabase();
  assert.equal(a.getCloudSyncStatus().state, "synced");
});
test("startup effects cannot overwrite a cloud record before authenticated hydration", async () => {
  const key = "vestora-recipes-A", rows = new Map([[key, { state_key: key, state_value: [{ id: "real" }], updated_at: "1" }]]);
  const a = device(rows);
  a.businessStorage.setItem(key, "[]");
  assert.equal(a.raw.getItem(key), null);
  await a.ready();
  assert.equal(JSON.parse(a.raw.getItem(key))[0].id, "real");
});
test("login cache filtering excludes other stores and never uploads printer or session state", async () => {
  const rows = new Map(), a = device(rows, { role: "cashier", allowedStoreIds: ["A"], storeId: "A" });
  a.raw.setItem("vestora-sales-ledger", JSON.stringify([{ id: 1, storeId: "A" }, { id: 2, storeId: "B" }]));
  a.raw.setItem("vestora-finance-expenses-B", JSON.stringify([{ id: "private" }]));
  a.raw.setItem("vestora-current-user", JSON.stringify({ token: "private" }));
  a.raw.setItem("vestora-kot-printer", JSON.stringify({ name: "Local printer" }));
  await a.ready(); await a.syncLocalStateToSupabase();
  assert.deepEqual(JSON.parse(a.raw.getItem("vestora-sales-ledger")).map((row) => row.storeId), ["A"]);
  assert.ok(!rows.has("vestora-finance-expenses-B"));
  assert.ok(!rows.has("vestora-current-user"));
  assert.ok(!rows.has("vestora-kot-printer"));
});
