import test from "node:test";
import assert from "node:assert/strict";
import { createInventorySync, mergeInventory } from "./inventory-sync.js";

const key = "vestora-inventory-STORE-001";
const rice = { id: "rice", name: "Rice", stock: 10 };
const chicken = { id: "chicken", name: "Chicken", stock: 5 };
const clone = (value) => JSON.parse(JSON.stringify(value));
function memory() {
  const values = new Map();
  return { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
}
function cloud() {
  let row = null;
  let version = 0;
  return {
    read: async () => clone(row),
    write: async (state_key, state_value, expected) => {
      if ((row?.updated_at ?? null) !== expected) throw Object.assign(new Error("Conflict"), { status: 409 });
      row = { state_key, state_value: clone(state_value), updated_at: String(++version) };
      return clone(row);
    },
  };
}
function device(server, records) {
  const storage = memory();
  if (records) storage.setItem(key, JSON.stringify(records));
  const sync = createInventorySync({ storage, namespace: "test", ...server });
  return { storage, sync: () => sync(key), value: () => JSON.parse(storage.getItem(key) || "[]"), edit: (items) => storage.setItem(key, JSON.stringify(items)) };
}

test("rice and chicken uploaded on device A appear on a clean device B", async () => {
  const server = cloud();
  const a = device(server, [rice, chicken]);
  const b = device(server);
  await a.sync();
  await b.sync();
  assert.deepEqual(b.value(), [rice, chicken]);
});

test("stale device refresh does not overwrite updated stock", async () => {
  const server = cloud();
  const a = device(server, [rice]);
  const b = device(server);
  await a.sync(); await b.sync();
  a.edit([{ ...rice, stock: 2 }, chicken]);
  await a.sync(); await b.sync();
  assert.deepEqual(b.value(), [{ ...rice, stock: 2 }, chicken]);
  assert.deepEqual((await server.read()).state_value, b.value());
});

test("concurrent additions are retried with compare-and-swap and both survive", async () => {
  const server = cloud();
  const a = device(server, [rice]);
  const b = device(server, [chicken]);
  await Promise.all([a.sync(), b.sync()]);
  await Promise.all([a.sync(), b.sync()]);
  assert.deepEqual(new Set(a.value().map((item) => item.id)), new Set(["rice", "chicken"]));
  assert.deepEqual(a.value(), b.value());
});

test("failed writes retain local data and retry successfully", async () => {
  const server = cloud();
  let failing = true;
  const a = device({ ...server, write: (...args) => { if (failing) throw new Error("Network offline"); return server.write(...args); } }, [rice, chicken]);
  await assert.rejects(a.sync(), /Network offline/);
  assert.deepEqual(a.value(), [rice, chicken]);
  assert.equal(await server.read(), null);
  failing = false;
  await a.sync();
  assert.deepEqual((await server.read()).state_value, [rice, chicken]);
});

test("deletion propagates and a stale device does not resurrect deleted inventory", async () => {
  const server = cloud();
  const a = device(server, [rice, chicken]);
  const b = device(server);
  await a.sync(); await b.sync();
  a.edit([chicken]);
  await a.sync(); await b.sync();
  assert.deepEqual(b.value(), [chicken]);
});

test("simultaneous edits to the same stock fail visibly instead of losing data", async () => {
  const server = cloud();
  const a = device(server, [rice]);
  const b = device(server);
  await a.sync(); await b.sync();
  a.edit([{ ...rice, stock: 3 }]); b.edit([{ ...rice, stock: 7 }]);
  await a.sync();
  await assert.rejects(b.sync(), /also changed on another device/);
  assert.equal(b.value()[0].stock, 7);
  assert.equal((await server.read()).state_value[0].stock, 3);
});

test("first-upgrade recovery adds missing local items and retains cloud stock for known IDs", () => {
  assert.deepEqual(mergeInventory(null, [rice, chicken], [{ ...rice, stock: 2 }]), [{ ...rice, stock: 2 }, chicken]);
});

test("edits made during an upload are sent before sync is reported complete", async () => {
  const server = cloud();
  let a;
  let editOnce = true;
  a = device({ ...server, write: async (...args) => {
    const row = await server.write(...args);
    if (editOnce) { editOnce = false; a.edit([rice, chicken]); }
    return row;
  } }, [rice]);
  await a.sync();
  assert.deepEqual((await server.read()).state_value, [rice, chicken]);
});

test("one branch does not share the checkpoint or local inventory of another", async () => {
  const storage = memory();
  const rows = new Map();
  storage.setItem(key, JSON.stringify([rice]));
  const otherKey = "vestora-inventory-STORE-002";
  storage.setItem(otherKey, JSON.stringify([chicken]));
  const sync = createInventorySync({ storage, namespace: "test", read: async (k) => rows.get(k) || null, write: async (k, value) => { const row = { state_value: value, updated_at: "1" }; rows.set(k, row); return row; } });
  await sync(key); await sync(otherKey);
  assert.deepEqual(rows.get(key).state_value, [rice]);
  assert.deepEqual(rows.get(otherKey).state_value, [chicken]);
});
