import test from "node:test";
import assert from "node:assert/strict";
import { createSharedSync, mergeShared } from "./shared-sync.js";
import { storePrefixes, globalBusinessKeys, isBusinessKey, stateStore } from "./business-state.js";

const memory = () => { const map = new Map(); return { getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) }; };
function server() {
  const rows = new Map(); let revision = 0;
  const operations = new Map();
  return {
    read: async (key) => structuredClone(rows.get(key)),
    write: async (key, value, expected, mutationId) => {
      if (operations.has(mutationId)) return structuredClone(operations.get(mutationId));
      if ((rows.get(key)?.updated_at ?? null) !== expected) throw Object.assign(new Error("Conflict"), { status: 409 });
      const row = { state_key: key, state_value: structuredClone(value), updated_at: String(++revision) };
      rows.set(key, row); if (mutationId) operations.set(mutationId, row); return structuredClone(row);
    },
  };
}
function device(cloud, storage = memory(), changed) {
  return { storage, sync: createSharedSync({ storage, namespace: "test", ...cloud, changed }).sync,
    edit: (key, value) => storage.setItem(key, JSON.stringify(value)),
    value: (key) => JSON.parse(storage.getItem(key)) };
}

test("cutover archives stale legacy edits and pending writes without replaying them", async () => {
  const key = "vestora-food-stock-A", storage = memory();
  const prefix = `cloud-sync:test:${key}`;
  const local = [{ id: "rice", available: 99 }];
  const remote = [{ id: "rice", available: 10 }];
  const pending = { id: "old-request", value: local, local, expected: "old" };
  storage.setItem(key, JSON.stringify(local));
  storage.setItem(prefix, JSON.stringify({ value: remote, revision: "old" }));
  storage.setItem(`${prefix}:pending`, JSON.stringify(pending));
  let writes = 0, notifications = 0;
  const row = { state_value: remote, updated_at: "new", read_only: true, read_only_reason: "production_ledger" };
  const sync = createSharedSync({ storage, namespace: "test", read: async () => row,
    write: async () => { writes++; throw new Error("Must not upload retired stock"); }, changed: () => notifications++ });
  assert.deepEqual(await sync.sync(key), remote);
  assert.equal(writes, 0);
  const copies = JSON.parse(storage.getItem(`${prefix}:read-only-recovery`));
  assert.deepEqual(copies[0].local, local);
  assert.deepEqual(copies[0].pending, pending);
  assert.equal(storage.getItem(`${prefix}:pending`), "null");
  await sync.sync(key);
  assert.equal(JSON.parse(storage.getItem(`${prefix}:read-only-recovery`)).length, 1);
  assert.equal(notifications, 2);
});

test("empty legacy defaults hydrate from a missing read-only server row without writing", async () => {
  const key = "vestora-recipes-A", storage = memory();
  storage.setItem(key, "[]");
  const sync = createSharedSync({ storage, namespace: "test", read: async () => { throw new Error("Use bulk snapshot"); },
    write: async () => { throw new Error("Must not initialize retired recipes"); } });
  assert.deepEqual(await sync.sync(key, { row: { state_value: [], updated_at: null, read_only: true } }), []);
  assert.equal(storage.getItem(`cloud-sync:test:${key}:read-only-recovery`), null);
});

test("cutover racing a write adopts the read-only snapshot after one conflict", async () => {
  const key = "vestora-recipes-A", storage = memory();
  storage.setItem(key, JSON.stringify([{ id: "unsent" }]));
  let reads = 0, writes = 0;
  const sync = createSharedSync({ storage, namespace: "test",
    read: async () => ({ state_value: [], updated_at: "r1", read_only: ++reads > 1 }),
    write: async () => { writes++; throw Object.assign(new Error("Cut over"), { status: 409 }); } });
  assert.deepEqual(await sync.sync(key), []);
  assert.equal(writes, 1);
  assert.deepEqual(JSON.parse(storage.getItem(`cloud-sync:test:${key}:read-only-recovery`))[0].local, [{ id: "unsent" }]);
});

test("sign-in changes cannot replace a retired local snapshot or archive it", async () => {
  const key = "vestora-food-stock-A", storage = memory();
  storage.setItem(key, "[1]");
  const sync = createSharedSync({ storage, namespace: "test", valid: () => false,
    read: async () => ({ state_value: [], read_only: true }), write: async () => assert.fail() });
  await assert.rejects(sync.sync(key), /Sign-in changed/);
  assert.equal(storage.getItem(key), "[1]");
  assert.equal(storage.getItem(`cloud-sync:test:${key}:read-only-recovery`), null);
});
for (const key of [...storePrefixes.map((prefix) => `vestora-${prefix}-STORE-A`), ...globalBusinessKeys]) {
  test(`${key}: add, edit, delete and refresh on an independent device`, async () => {
    const cloud = server(), a = device(cloud), b = device(cloud);
    const one = { id: "one", name: "First", storeId: "STORE-A" };
    a.edit(key, [one]); await a.sync(key); await b.sync(key);
    assert.deepEqual(b.value(key), [one]);
    a.edit(key, [{ ...one, name: "Edited" }]); await a.sync(key); await b.sync(key);
    assert.equal(b.value(key)[0].name, "Edited");
    b.edit(key, []); await b.sync(key); await a.sync(key);
    assert.deepEqual(a.value(key), []);
  });
}
test("settings and nested menu categories merge independent changes", async () => {
  const key = "vestora-menu-setup-A", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, { Categories: [], tax: { rate: 5, enabled: true } }); await a.sync(key); await b.sync(key);
  a.edit(key, { Categories: [{ id: "veg" }], tax: { rate: 5, enabled: true } });
  b.edit(key, { Categories: [], tax: { rate: 10, enabled: true } });
  await Promise.all([a.sync(key), b.sync(key)]); await a.sync(key);
  assert.deepEqual(a.value(key), { Categories: [{ id: "veg" }], tax: { rate: 10, enabled: true } });
});
test("numeric-store POS drafts sync and reload on another device", async () => {
  const key = "vestora-pos-drafts-1", cloud = server(), a = device(cloud), b = device(cloud);
  assert.equal(isBusinessKey(key), true);
  assert.equal(stateStore(key), "1");
  const value = { "cashier-1": { active: { items: [{ id: "rice", qty: 1 }] }, held: [] } };
  a.edit(key, value);
  await a.sync(key);
  await b.sync(key);
  assert.deepEqual(b.value(key), value);
});
test("new records from simultaneous sessions both survive, including a reload", async () => {
  const key = "vestora-recipes-A", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, []); await a.sync(key); await b.sync(key);
  a.edit(key, [{ id: "rice" }]); b.edit(key, [{ id: "chicken" }]);
  await Promise.all([a.sync(key), b.sync(key)]);
  const reloaded = device(cloud, a.storage); await reloaded.sync(key);
  assert.deepEqual(new Set(reloaded.value(key).map((row) => row.id)), new Set(["rice", "chicken"]));
});
test("sales ledger recovers independent bills without an acknowledged baseline", async () => {
  const key = "vestora-sales-ledger", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, [{ id: "bill-a", total: 10 }]); await a.sync(key);
  b.edit(key, [{ id: "bill-b", total: 20 }]); await b.sync(key);
  assert.deepEqual(new Set((await cloud.read(key)).state_value.map((bill) => bill.id)), new Set(["bill-a", "bill-b"]));
  assert.deepEqual(new Set(mergeShared(null, [{ id: "bill-a" }], [{ id: "bill-b" }], key).map((bill) => bill.id)), new Set(["bill-a", "bill-b"]));
});
test("sales recovery retains conflicting versions of the same bill for review", async () => {
  const key = "vestora-sales-ledger", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, [{ id: "bill-a", total: 10 }]); await a.sync(key);
  b.edit(key, [{ id: "bill-a", total: 20 }]);
  await assert.rejects(b.sync(key), /changed on another computer/);
  assert.equal(b.value(key)[0].total, 20);
  assert.equal((await cloud.read(key)).state_value[0].total, 10);
});
test("sales ledger merges identical duplicate bills without losing another device's sale", () => {
  const bill = { id: "bill-a", total: 10 };
  const merged = mergeShared([bill, bill], [bill, bill, { id: "bill-b", total: 20 }], [bill, { id: "bill-c", total: 30 }], "vestora-sales-ledger");
  assert.deepEqual(new Set(merged.map((entry) => entry.id)), new Set(["bill-a", "bill-b", "bill-c"]));
  assert.throws(() => mergeShared([], [bill, { id: "bill-a", total: 99 }], [{ id: "bill-b" }], "vestora-sales-ledger"), /changed on another computer/);
});
test("a bill list passed to sync never substitutes for the current server ledger", async () => {
  const key = "vestora-sales-ledger", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, [{ id: "bill-a", total: 10 }]); await a.sync(key); await b.sync(key);
  b.edit(key, [{ id: "bill-b", total: 20 }, { id: "bill-a", total: 10 }]);
  await b.sync(key, b.value(key));
  assert.deepEqual((await cloud.read(key)).state_value.map((bill) => bill.id), ["bill-b", "bill-a"]);
});
test("offline changes survive failure, reload and a simultaneous remote edit", async () => {
  const key = "vestora-finance-expenses-A", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, [{ id: 1, amount: 10 }]); await a.sync(key); await b.sync(key);
  a.edit(key, [{ id: 1, amount: 10 }, { id: 2, amount: 40 }]);
  const offline = device({ ...cloud, write: async () => { throw new Error("offline"); } }, a.storage);
  await assert.rejects(offline.sync(key), /offline/);
  b.edit(key, [{ id: 1, amount: 20 }]); await b.sync(key);
  const reloaded = device(cloud, a.storage); await reloaded.sync(key); await b.sync(key);
  assert.deepEqual(reloaded.value(key), [{ id: 1, amount: 20 }, { id: 2, amount: 40 }]);
});
test("conflicting edits never silently discard the local record", async () => {
  const key = "vestora-menu-items-A", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, [{ id: 1, price: 10 }]); await a.sync(key); await b.sync(key);
  a.edit(key, [{ id: 1, price: 20 }]); b.edit(key, [{ id: 1, price: 30 }]);
  await a.sync(key); await assert.rejects(b.sync(key), /changed on another computer/);
  assert.equal(b.value(key)[0].price, 30);
});
test("food stock deductions from two devices accumulate and can become negative", () => {
  const base = [{ id: 1, available: 10, sold: 0 }];
  assert.deepEqual(mergeShared(base, [{ id: 1, available: 8, sold: 2 }], [{ id: 1, available: 8, sold: 2 }], "vestora-food-stock-A"), [{ id: 1, available: 6, sold: 4 }]);
  assert.deepEqual(mergeShared(base, [{ id: 1, available: 8, sold: 2 }], [{ id: 1, available: 7, sold: 3 }], "vestora-food-stock-A"), [{ id: 1, available: 5, sold: 5 }]);
  assert.deepEqual(mergeShared(base, [{ id: 1, available: 3, sold: 7 }], [{ id: 1, available: 4, sold: 6 }], "vestora-food-stock-A"), [{ id: 1, available: -3, sold: 13 }]);
});

test("Production balances override stale inventory while product details still sync", async () => {
  const key = "vestora-inventory-A", cloud = server(), initial = { id: "rice", name: "Rice", unit: "kg", stock: 0, cost: 0, productionManaged: true };
  const first = device(cloud);
  first.edit(key, [initial]);
  await first.sync(key);
  const projected = { ...initial, stock: 7, cost: 42 };
  const before = await cloud.read(key);
  await cloud.write(key, [projected], before.updated_at, "projection");
  first.edit(key, [{ ...initial, name: "Basmati rice", unit: "pack", stock: 2, cost: 25 }]);
  const guarded = device({
    read: cloud.read,
    write: async (stateKey, value, expected, mutationId) => {
      assert.equal(value[0].stock, 7);
      assert.equal(value[0].cost, 42);
      assert.equal(value[0].unit, "kg");
      return cloud.write(stateKey, value, expected, mutationId);
    },
  }, first.storage);
  await guarded.sync(key);
  assert.deepEqual((await cloud.read(key)).state_value, [{ ...projected, name: "Basmati rice" }]);
  assert.deepEqual(guarded.value(key), [{ ...projected, name: "Basmati rice" }]);
});

test("a stale browser cannot remove a Production managed inventory item", () => {
  const item = { id: "rice", name: "Rice", unit: "kg", stock: 7, cost: 42, productionManaged: true };
  assert.deepEqual(mergeShared([item], [], [item], "vestora-inventory-A"), [item]);
});

test("a rejected legacy inventory upload recovers against the Production projection", async () => {
  const key = "vestora-inventory-A", storage = memory(), prefix = `cloud-sync:test:${key}`;
  const old = [{ id: "rice", name: "Rice", unit: "kg", stock: 0, cost: 0, productionManaged: false }];
  const projected = [{ ...old[0], stock: 7, cost: 42, productionManaged: true }];
  storage.setItem(key, JSON.stringify([{ ...old[0], name: "Basmati rice", stock: 2 }]));
  storage.setItem(prefix, JSON.stringify({ value: old, revision: "r1" }));
  storage.setItem(`${prefix}:pending`, JSON.stringify({ id: "old-write", local: old, value: [{ ...old[0], stock: 2 }], expected: "r1" }));
  let writes = 0;
  const sync = createSharedSync({ storage, namespace: "test", read: async () => ({ state_value: projected, updated_at: "r2" }),
    write: async (_key, value) => {
      writes++;
      if (value[0].stock !== 7 || value[0].cost !== 42) throw Object.assign(new Error("Managed balance blocked"), { status: 409 });
      return { state_value: value, updated_at: "r3" };
    } });
  assert.equal((await sync.sync(key))[0].name, "Basmati rice");
  assert.equal(JSON.parse(storage.getItem(key))[0].stock, 7);
  assert.equal(storage.getItem(`${prefix}:pending`), "null");
  assert.equal(writes, 2);
});
test("newly typed edits are not lost when an older request completes", async () => {
  const key = "vestora-offers-A", cloud = server(); let a;
  let once = true;
  a = device({ ...cloud, write: async (...args) => { const row = await cloud.write(...args); if (once) { once = false; a.edit(key, [{ id: 1 }, { id: 2 }]); } return row; } });
  a.edit(key, [{ id: 1 }]); await a.sync(key);
  assert.deepEqual((await cloud.read(key)).state_value, [{ id: 1 }, { id: 2 }]);
});
test("stock state, settings and secrets are correctly classified", () => {
  assert.equal(stateStore("vestora-inventory-transactions-STORE-A"), "STORE-A");
  assert.equal(stateStore("vestora-inventory-brands-STORE-A"), "STORE-A");
  assert.equal(stateStore("vestora-inventory-manufacturers-STORE-A"), "STORE-A");
  assert.equal(stateStore("vestora-grn-register-STORE-A"), "STORE-A");
  assert.equal(stateStore("vestora-grn-template-STORE-A"), "STORE-A");
  for (const key of ["vestora-current-user", "vestora-pos-cashier", "vestora-current-shift", "vestora-offline-orders", "vestora-kot-printer", "vestora-printer-choices", "vestora-api-token"]) assert.equal(isBusinessKey(key), false, key);
});

test("a lost upload response followed by reload applies a stock deduction exactly once", async () => {
  const key = "vestora-food-stock-A", cloud = server();
  const a = device(cloud); a.edit(key, [{ id: 1, available: 10, sold: 0 }]); await a.sync(key);
  let lost = true;
  const interrupted = device({ ...cloud, write: async (...args) => { const saved = await cloud.write(...args); if (lost) { lost = false; throw new Error("response lost"); } return saved; } }, a.storage);
  interrupted.edit(key, [{ id: 1, available: 8, sold: 2 }]);
  await assert.rejects(interrupted.sync(key), /response lost/);
  const reloaded = device(cloud, a.storage);
  await reloaded.sync(key);
  assert.deepEqual((await cloud.read(key)).state_value, [{ id: 1, available: 8, sold: 2 }]);
  assert.deepEqual(reloaded.value(key), [{ id: 1, available: 8, sold: 2 }]);
});
