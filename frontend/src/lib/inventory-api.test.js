import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../../../supabase/functions/vestora-api/index.ts", import.meta.url), "utf8");
const compiled = stripTypeScriptTypes(source.replace(/^import .*createClient.*;\r?\n/, ""));

function endpoint({ linked = true } = {}) {
  const rows = new Map();
  let handle;
  const createClient = () => ({
    auth: { getUser: async () => ({ data: { user: { id: "auth-user", email: "test@example.test" } }, error: null }) },
    from(table) {
      const filters = [];
      let operation = "read";
      let payload;
      let single = false;
      const query = {
        select() { return query; },
        eq(k, v) { filters.push([k, v]); return query; },
        insert(value) { operation = "insert"; payload = value; return query; },
        update(value) { operation = "update"; payload = value; return query; },
        upsert(value) { operation = "upsert"; payload = value; return query; },
        maybeSingle() { single = true; return query; },
        single() { single = true; return query; },
        then(resolve, reject) {
          const execute = () => {
            if (table === "core_user") return { data: linked ? { id: 1, user_type: "super_admin", is_superuser: true } : null, error: null };
            const matched = [...rows.values()].filter((row) => filters.every(([k, v]) => row[k] === v));
            if (operation === "insert" && rows.has(payload.state_key)) return { data: null, error: { code: "23505" } };
            if (operation === "update" && !matched.length) return { data: null, error: null };
            if (operation !== "read") {
              rows.set(payload.state_key, structuredClone(payload));
              return { data: structuredClone(payload), error: null };
            }
            return { data: single ? (matched[0] || null) : structuredClone(matched), error: null };
          };
          return Promise.resolve().then(execute).then(resolve, reject);
        },
      };
      return query;
    },
  });
  vm.runInNewContext(compiled, { createClient, Request, Response, URL, Date, Deno: { env: { get: () => "test" }, serve: (handler) => { handle = handler; } } });
  return (method, body, query = "") => handle(new Request(`https://example.test/functions/v1/vestora-api/state${query}`, {
    method, headers: { Origin: "https://uvpro.in", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  }));
}

test("live handler preflight permits the PUT used by browser inventory saves", async () => {
  const response = await endpoint()("OPTIONS");
  assert.equal(response.status, 200);
  assert.ok(response.headers.get("access-control-allow-methods").split(/,\s*/).includes("PUT"));
});

test("the actual handler rejects stale snapshots and returns the latest inventory", async () => {
  const request = endpoint();
  const key = "vestora-inventory-STORE-001";
  const rice = { id: "rice", name: "Rice", stock: 10 };
  const saved = await request("PUT", { key, value: [rice], expectedUpdatedAt: null });
  assert.equal(saved.status, 200);
  const first = await saved.json();
  assert.equal((await request("PUT", { key, value: [], expectedUpdatedAt: null })).status, 409);
  const second = await request("PUT", { key, value: [{ ...rice, stock: 7 }], expectedUpdatedAt: first.updated_at });
  assert.equal(second.status, 200);
  assert.notEqual((await second.json()).updated_at, first.updated_at);
  assert.equal((await request("PUT", { key, value: [], expectedUpdatedAt: first.updated_at })).status, 409);
  const rows = await (await request("GET", null, `?key=${key}`)).json();
  assert.equal(rows[0].state_value[0].stock, 7);
});

test("old clients cannot overwrite inventory without a version", async () => {
  const response = await endpoint()("PUT", { key: "vestora-inventory-STORE-001", value: [] });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /Refresh/);
});

test("a login without a linked profile receives a visible error instead of private-only saves", async () => {
  const response = await endpoint({ linked: false })("PUT", { key: "vestora-inventory-STORE-001", value: [], expectedUpdatedAt: null });
  assert.equal(response.status, 403);
});

test("shared user and settings snapshots cannot publish nested credentials", async () => {
  const request = endpoint();
  const response = await request("PUT", { key: "vestora-users", value: [{ id: 1, name: "Cashier", password: "not-for-sharing", settings: { apiKey: "private", language: "English" } }] });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).state_value, [{ id: 1, name: "Cashier", settings: { language: "English" } }]);
});
