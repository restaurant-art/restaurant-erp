import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createSharedSync } from "./shared-sync.js";
import { isBusinessKey, stateStore, sanitize } from "./business-state.js";
import { isInventoryStateKey } from "./inventory-sync.js";
const source = readFileSync(new URL("./cloud.js", import.meta.url), "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("import.meta.env", "environment").replace(/^export /gm, "");
function device(rows, profile = { role: "super_admin", isSuperuser: true }) {
  const values = {};
  const storage = new Proxy(values, { get: (target, key) => key === "getItem" ? (k) => target[k] ?? null : key === "setItem" ? (k, v) => { target[k] = v; } : key === "removeItem" ? (k) => { delete target[k]; } : target[key] });
  values["uvpro-aws-session"] = JSON.stringify({ access_token: "mock-access", refresh_token: "mock-refresh", user: { id: "verified-user", email: "test@example.test", user_metadata: {}, app_metadata: {} } });
  const timers = [];
  const events = [];
  const requests = [];
  let revision = 0;
  const context = {
    environment: { VITE_CLOUD_PROVIDER: "aws", VITE_API_BASE_URL: "https://api.test" },
    window: { localStorage: storage, vestoraCloudStateReady: false, location: { origin: "https://api.test" }, dispatchEvent: (e) => events.push(e), setTimeout: (cb) => timers.push(cb), clearTimeout: () => {} },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), method: options.method || "GET" });
      if (url.endsWith("/profile/")) return Response.json(profile);
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
  vm.runInNewContext(source + "\nglobalThis.adapter = { businessStorage, hydrateLocalStateFromCloud, cloudProfile, syncLocalStateToCloud, cloudClient, getCloudSyncStatus, subscribeBusinessState, stopCloudSync };", context);
  return { ...context.adapter, raw: storage, events, requests, context,
    ready: async () => { await context.adapter.cloudProfile(); await context.adapter.hydrateLocalStateFromCloud(); context.window.vestoraCloudStateReady = true; },
  };
}
test("the real adapter saves omitted-effect writes, refreshes an open device and confirms cloud acknowledgement", async () => {
  const rows = new Map(), a = device(rows), b = device(rows);
  await a.ready(); await b.ready();
  let notifications = 0; b.subscribeBusinessState(() => notifications++);
  const key = "vestora-menu-items-A";
  a.businessStorage.setItem(key, JSON.stringify([{ id: "rice", price: 100 }]));
  assert.equal(a.getCloudSyncStatus().state, "saving");
  await a.syncLocalStateToCloud(); await b.syncLocalStateToCloud();
  assert.equal(JSON.parse(b.raw.getItem(key))[0].id, "rice");
  assert.ok(notifications > 0);
  assert.equal(a.getCloudSyncStatus().state, "synced");
  assert.ok(b.events.some((event) => event.detail?.key === key));
  assert.ok([...a.requests, ...b.requests].every(({ url }) => url.startsWith("https://api.test/api/cloud/")));
});

test("gateway error messages are retained instead of hidden by a generic API error", async () => {
  const a = device(new Map());
  a.context.fetch = async () => Response.json({ message: "Invalid JWT" }, { status: 401 });
  await assert.rejects(a.cloudProfile(), /Invalid JWT \[profile: 401\]/);
});

test("login rejects an HTML fallback without storing an invalid session", async () => {
  const a = device(new Map());
  a.raw.removeItem("uvpro-aws-session");
  a.context.fetch = async () => new Response("<!doctype html><title>UVPRO</title>", { headers: { "Content-Type": "text/html" } });
  const result = await a.cloudClient.auth.signInWithPassword({ email: "test@example.test", password: "test-only" });
  assert.match(result.error.message, /login API is unavailable/);
  assert.equal(a.raw.getItem("uvpro-aws-session"), null);
});

test("login handles a malformed JSON server error without throwing", async () => {
  const a = device(new Map());
  a.raw.removeItem("uvpro-aws-session");
  a.context.fetch = async () => new Response("invalid-json", { status: 502, headers: { "Content-Type": "application/json" } });
  const result = await a.cloudClient.auth.signInWithPassword({ email: "test@example.test", password: "test-only" });
  assert.equal(result.error.message, "Sign-in failed");
  assert.equal(a.raw.getItem("uvpro-aws-session"), null);
});

test("valid login stores the session and notifies the profile-loading listener", async () => {
  const a = device(new Map());
  a.raw.removeItem("uvpro-aws-session");
  const user = { id: "test-user", email: "test@example.test" };
  a.context.fetch = async () => Response.json({ access: "test-access", refresh: "test-refresh", user });
  let event;
  a.cloudClient.auth.onAuthStateChange((name, session) => { event = { name, session }; });
  const result = await a.cloudClient.auth.signInWithPassword({ email: user.email, password: "test-only" });
  assert.equal(result.error, null);
  assert.equal(event.name, "SIGNED_IN");
  assert.equal(event.session.user.id, user.id);
  assert.equal(JSON.parse(a.raw.getItem("uvpro-aws-session")).access_token, "test-access");
});

test("a stalled auth lock fails with a retryable message", async () => {
  const a = device(new Map());
  a.context.setTimeout = (callback) => setTimeout(callback, 5);
  vm.runInNewContext("cloudClient.auth.getSession = () => new Promise(() => {})", a.context);
  await assert.rejects(a.cloudProfile(), /Sign-in verification timed out/);
});

test("network timeout preserves browser records and exposes a clear error", async () => {
  const a = device(new Map());
  a.raw.setItem("vestora-inventory-A", '[{"id":"rice","stock":10}]');
  a.context.fetch = async () => { const error = new Error("timeout"); error.name = "TimeoutError"; throw error; };
  await assert.rejects(a.cloudProfile(), /store server did not respond in time/);
  assert.equal(a.raw.getItem("vestora-inventory-A"), '[{"id":"rice","stock":10}]');
});

test("failed cache configuration does not leave a half-configured session on retry", async () => {
  const a = device(new Map(), { role: "cashier", storeId: "A", allowedStoreIds: ["A"] });
  a.raw.setItem("vestora-stores", "invalid-json");
  await assert.rejects(a.cloudProfile(), /saved record.*cannot be read/);
  assert.equal(a.raw.getItem("vestora-stores"), "invalid-json");
  // Simulate a support-assisted repair; the application must not destroy it.
  a.raw.setItem("vestora-stores", '[]');
  await a.ready();
  a.businessStorage.setItem("vestora-inventory-A", '[{"id":"rice"}]');
  await a.syncLocalStateToCloud();
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
  await a.ready(); await a.syncLocalStateToCloud();
  assert.deepEqual(JSON.parse(a.raw.getItem("vestora-sales-ledger")).map((row) => row.storeId), ["A"]);
  assert.ok(!rows.has("vestora-finance-expenses-B"));
  assert.ok(!rows.has("vestora-current-user"));
  assert.ok(!rows.has("vestora-kot-printer"));
});

test("a refreshed profile replaces the cached store assignment", async () => {
  const profile = { role: "cashier", allowedStoreIds: ["A"], storeId: "A" };
  const rows = new Map(), a = device(rows, profile);
  await a.ready();
  profile.allowedStoreIds = ["B"];
  profile.storeId = "B";
  await a.cloudProfile();
  a.context.window.vestoraCloudStateReady = true;
  a.businessStorage.setItem("vestora-inventory-B", '[{"id":"rice"}]');
  await a.syncLocalStateToCloud();
  assert.equal(rows.get("vestora-inventory-B").state_value[0].id, "rice");
});

test("retry refreshes a changed store assignment after a 403", async () => {
  const profile = { role: "cashier", allowedStoreIds: ["A"], storeId: "A" };
  const rows = new Map(), a = device(rows, profile);
  await a.ready();
  const fetch = a.context.fetch;
  profile.allowedStoreIds = ["B"];
  profile.storeId = "B";
  a.context.fetch = async (url, options = {}) => {
    if (String(url).includes("/api/cloud/state/")) {
      const key = options.method === "PUT" ? JSON.parse(options.body).key : new URL(url).searchParams.get("key");
      if (key?.endsWith("-A")) return Response.json({ error: "Store access denied" }, { status: 403 });
    }
    return fetch(url, options);
  };
  a.context.window.vestoraCloudStateReady = true;
  a.businessStorage.setItem("vestora-inventory-A", '[{"id":"retained"}]');
  await a.syncLocalStateToCloud();
  assert.equal(a.getCloudSyncStatus().state, "synced");
  assert.equal(a.raw.getItem("vestora-inventory-A"), '[{"id":"retained"}]');
});

test("a genuine 403 explains the assignment problem instead of exposing an API state code", async () => {
  const profile = { role: "cashier", allowedStoreIds: ["A"], storeId: "A" };
  const a = device(new Map(), profile);
  await a.ready();
  const fetch = a.context.fetch;
  a.context.fetch = async (url, options = {}) => String(url).includes("/api/cloud/state/")
    ? Response.json({ error: "Store access denied" }, { status: 403 })
    : fetch(url, options);
  a.context.window.vestoraCloudStateReady = true;
  a.businessStorage.setItem("vestora-inventory-A", '[{"id":"retained"}]');
  await assert.rejects(a.syncLocalStateToCloud(), /Store access denied/);
  assert.match(a.getCloudSyncStatus().message, /store assignment no longer permits/i);
  assert.doesNotMatch(a.getCloudSyncStatus().message, /\[state: 403\]/);
});
