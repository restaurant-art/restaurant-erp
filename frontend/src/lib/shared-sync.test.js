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
test("new records from simultaneous sessions both survive, including a reload", async () => {
  const key = "vestora-recipes-A", cloud = server(), a = device(cloud), b = device(cloud);
  a.edit(key, []); await a.sync(key); await b.sync(key);
  a.edit(key, [{ id: "rice" }]); b.edit(key, [{ id: "chicken" }]);
  await Promise.all([a.sync(key), b.sync(key)]);
  const reloaded = device(cloud, a.storage); await reloaded.sync(key);
  assert.deepEqual(new Set(reloaded.value(key).map((row) => row.id)), new Set(["rice", "chicken"]));
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
test("food stock deductions from two devices accumulate and cannot become negative", () => {
  const base = [{ id: 1, available: 10, sold: 0 }];
  assert.deepEqual(mergeShared(base, [{ id: 1, available: 8, sold: 2 }], [{ id: 1, available: 8, sold: 2 }], "vestora-food-stock-A"), [{ id: 1, available: 6, sold: 4 }]);
  assert.deepEqual(mergeShared(base, [{ id: 1, available: 8, sold: 2 }], [{ id: 1, available: 7, sold: 3 }], "vestora-food-stock-A"), [{ id: 1, available: 5, sold: 5 }]);
  assert.throws(() => mergeShared(base, [{ id: 1, available: 3, sold: 7 }], [{ id: 1, available: 4, sold: 6 }], "vestora-food-stock-A"), /used this stock/);
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
