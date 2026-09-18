import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";

const source = readFileSync(new URL("../../../supabase/functions/vestora-api/index.ts", import.meta.url), "utf8");
const compiled = stripTypeScriptTypes(source.replace(/^import .*createClient.*;\r?\n/, ""));

function endpoint({ linked = true, superAdmin = true, role = "restaurant_admin", seed = [] } = {}) {
  const rows = new Map(seed.map((row) => [row.state_key, structuredClone(row)]));
  const operations = new Map();
  let handle;
  const createClient = () => ({
    rpc: async (name, request) => {
      if (operations.has(request.p_operation_id)) return { data: operations.get(request.p_operation_id), error: null };
      const before = rows.get(request.p_key);
      if ((before?.updated_at ?? null) !== request.p_expected) return { data: { conflict: true }, error: null };
      const data = { state_key: request.p_key, state_value: structuredClone(request.p_value), updated_at: new Date(Math.max(Date.now(), (Date.parse(request.p_expected || "") || 0) + 1)).toISOString() };
      rows.set(request.p_key, data); operations.set(request.p_operation_id, data);
      return { data, error: null };
    },
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
            if (table === "core_user") return { data: linked ? { id: 1, user_type: superAdmin ? "super_admin" : role, is_superuser: superAdmin } : null, error: null };
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
    method, headers: { Origin: "https://uvpro.in", "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify({ ...("expectedUpdatedAt" in body ? { mutationId: crypto.randomUUID() } : {}), ...body }) } : {}),
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

test("tables and floors use the same protected cloud write path", async () => {
  const request = endpoint();
  const tablesKey = "vestora-tables-STORE-001";
  const floorsKey = "vestora-floors-STORE-001";
  const table = { id: 9, name: "Family table", floor: "Main", seats: 6, status: "Available" };
  const saved = await request("PUT", { key: tablesKey, value: [table], expectedUpdatedAt: null });
  assert.equal(saved.status, 200);
  const revision = (await saved.json()).updated_at;
  assert.equal((await request("PUT", { key: tablesKey, value: [], expectedUpdatedAt: null })).status, 409);
  assert.equal((await request("PUT", { key: floorsKey, value: ["Main", "Garden"], expectedUpdatedAt: null })).status, 200);
  assert.equal((await request("PUT", { key: tablesKey, value: [{ ...table, seats: 8 }], expectedUpdatedAt: revision })).status, 200);
});

test("a login without a linked profile receives a visible error instead of private-only saves", async () => {
  const response = await endpoint({ linked: false })("PUT", { key: "vestora-inventory-STORE-001", value: [], expectedUpdatedAt: null });
  assert.equal(response.status, 403);
});

test("shared user and settings snapshots cannot publish nested credentials", async () => {
  const request = endpoint();
  const response = await request("PUT", { key: "vestora-users", expectedUpdatedAt: null, value: [{ id: 1, name: "Cashier", password: "not-for-sharing", settings: { apiKey: "private", language: "English" } }] });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).state_value, [{ id: 1, name: "Cashier", settings: { language: "English" } }]);
});

const scopeSeed = [
  { state_key: "vestora-stores", state_value: [{ id: "A", adminEmail: "test@example.test" }, { id: "B", adminEmail: "other@example.test" }], updated_at: "1" },
  { state_key: "vestora-sales-ledger", state_value: [{ id: "a", storeId: "A", total: 1 }, { id: "b", storeId: "B", total: 2 }], updated_at: "1" },
  { state_key: "vestora-menu-items-B", state_value: [{ id: "secret" }], updated_at: "1" },
];
test("a store login cannot read or write another store even by specifying its key", async () => {
  const request = endpoint({ superAdmin: false, seed: scopeSeed });
  assert.equal((await request("GET", null, "?key=vestora-menu-items-B")).status, 403);
  assert.equal((await request("GET", null, "?storeId=B")).status, 403);
  assert.equal((await request("PUT", { key: "vestora-inventory-B", value: [], expectedUpdatedAt: null })).status, 403);
  const rows = await (await request("GET")).json();
  assert.deepEqual(rows.find((row) => row.state_key === "vestora-sales-ledger").state_value.map((row) => row.id), ["a"]);
  assert.ok(!rows.some((row) => row.state_key === "vestora-menu-items-B"));
});
test("a scoped ledger save preserves the other store and rejects injected store records", async () => {
  const request = endpoint({ superAdmin: false, seed: scopeSeed });
  const saved = await request("PUT", { key: "vestora-sales-ledger", value: [{ id: "a", storeId: "A", total: 4 }], expectedUpdatedAt: "1" });
  assert.equal(saved.status, 200);
  const row = await saved.json();
  assert.deepEqual(row.state_value, [{ id: "a", storeId: "A", total: 4 }]);
  const denied = await request("PUT", { key: "vestora-sales-ledger", value: [{ id: "b", storeId: "B" }], expectedUpdatedAt: row.updated_at });
  assert.equal(denied.status, 403);
});
test("staff cannot edit shared users or roles and old clients cannot overwrite any module", async () => {
  const request = endpoint({ superAdmin: false, role: "cashier", seed: scopeSeed });
  assert.equal((await request("PUT", { key: "vestora-users", value: [], expectedUpdatedAt: null })).status, 403);
  for (const key of ["vestora-recipes-A", "vestora-food-stock-A", "vestora-finance-expenses-A", "vestora-menu-setup-A", "vestora-attendance-logs-A", "vestora-offers-A"]) {
    assert.equal((await request("PUT", { key, value: [] })).status, 409, key);
    assert.equal((await request("PUT", { key, value: [], expectedUpdatedAt: null })).status, 200, key);
  }
});
