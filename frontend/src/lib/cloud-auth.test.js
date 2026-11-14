import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  #data = new Map();
  get length() { return this.#data.size; }
  key(index) { return [...this.#data.keys()][index] ?? null; }
  getItem(key) { return this.#data.has(String(key)) ? this.#data.get(String(key)) : null; }
  setItem(key, value) { this.#data.set(String(key), String(value)); }
  removeItem(key) { this.#data.delete(String(key)); }
}

test("cloud retry replaces an expired Authorization header with the refreshed token", async () => {
  const localStorage = new MemoryStorage();
  localStorage.setItem("uvpro-aws-session", JSON.stringify({ access_token: "expired-token", refresh_token: "refresh-token", user: { id: "user-1" } }));
  globalThis.window = { localStorage, location: { origin: "http://localhost:8000" }, dispatchEvent() {}, clearTimeout, setTimeout };
  const authorizationHeaders = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith("/api/auth/token/refresh/")) return new Response(JSON.stringify({ access: "fresh-token" }), { status: 200, headers: { "Content-Type": "application/json" } });
    authorizationHeaders.push(options.headers?.Authorization);
    if (authorizationHeaders.length === 1) return new Response(JSON.stringify({ error: "expired" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return new Response(JSON.stringify([]), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const { cloudJson } = await import(`./cloud.js?auth-refresh=${Date.now()}`);
    assert.deepEqual(await cloudJson("/api/cloud/state/"), []);
    assert.deepEqual(authorizationHeaders, ["Bearer expired-token", "Bearer fresh-token"]);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});
