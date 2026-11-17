import test from "node:test";
import assert from "node:assert/strict";
import { createProductionTransport, orderStockLines, stockLineKey, fulfillmentTargets } from "./production-transport.js";

function memory() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

test("lost fulfillment response survives reload and retries the exact same envelope once", async () => {
  const storage = memory(); const posted = new Map(); let effects = 0; let lose = true;
  const send = async (store, command, data, key) => {
    if (!posted.has(key)) { effects++; posted.set(key, { key, data, command }); }
    if (lose) { lose = false; throw new Error("Response lost"); }
    return posted.get(key);
  };
  const a = createProductionTransport({ storage, send, newKey: () => "stable-key" });
  const data = { reference: "order", targets: { full: "10", half: "8", extra: "4" } };
  await assert.rejects(a.execute("A", "fulfill", data, "serve:ticket"));
  const b = createProductionTransport({ storage, send });
  const result = await b.resume("A", "serve:ticket");
  assert.equal(result.key, "stable-key");
  assert.deepEqual(result.data, data);
  assert.equal(effects, 1);
  assert.equal(b.pending("A", "serve:ticket"), null);
});

test("concurrent clicks share one operation and changed content cannot reuse a pending request", async () => {
  const storage = memory(); let calls = 0; let finish;
  const send = () => { calls++; return new Promise((resolve) => { finish = resolve; }); };
  const client = createProductionTransport({ storage, send });
  const a = client.execute("A", "usage", { quantity: "150" }, "waste-1");
  const b = client.execute("A", "usage", { quantity: "150" }, "waste-1");
  await assert.rejects(client.execute("A", "usage", { quantity: "200" }, "waste-1"), /unacknowledged/);
  assert.equal(calls, 1);
  finish({ ok: true });
  assert.deepEqual(await a, await b);
});

test("definitive validation failures allow correction while transport failures keep the request", async () => {
  const client = createProductionTransport({ storage: memory(), send: async () => { const e = new Error("Shortage"); e.status = 400; throw e; } });
  await assert.rejects(client.execute("A", "confirm", { quantity: 2 }, "order"));
  assert.equal(client.pending("A", "order"), null);
});

test("order-line mappings retain independent variants, zero prices and revision identity", () => {
  const items = [{ id: "full", name: "Full biriyani", qty: 10, price: 180 }, { id: "half", name: "Half biriyani", qty: 8, price: 140 }, { id: "extra", name: "Extra rice", qty: 4, price: 0 }];
  const lines = orderStockLines(items, [{ key: stockLineKey(items[1]), revision: 3 }]);
  assert.deepEqual(lines.map((r) => [r.menu_key, r.quantity]), [["full", "10"], ["half", "8"], ["extra", "4"]]);
  assert.equal(lines[1].expected_revision, 3);
  assert.equal(lines[2].unit_price, "0");
  assert.equal(lines[1].quantity, "8");
  assert.equal(stockLineKey({ id: "other", name: "renamed", stockLineKey: "saved-line" }), "saved-line");
});

test("an older KOT cannot serve a subsequently cancelled quantity", () => {
  const items = [{ id: "full", name: "Full", qty: 10 }, { id: "extra", name: "Extra", qty: 4 }];
  const targets = fulfillmentTargets(items, [
    { key: stockLineKey(items[0]), quantity: "10", cancelled: "8", fulfilled: "2" },
    { key: stockLineKey(items[1]), quantity: "4", cancelled: "0", fulfilled: "0" },
  ]);
  assert.deepEqual(Object.values(targets), ["2", "4"]);
  assert.throws(() => fulfillmentTargets(items, []), /unconfirmed/);
});

test("mixed supermarket bills use master stock for packets and serving recipes for menu items", () => {
  const lines = orderStockLines([
    { id: "chilli::unit::box", productMasterId: "chilli", productMasterItem: true, name: "Chilli box", qty: 1, salesUnit: "box", price: 250, tax: 5 },
    { id: "water", productMasterItem: true, name: "Water", qty: 2, unit: "bottle", price: 20 },
    { id: "tea", name: "Tea", qty: 1, price: 10 },
  ], [], true);
  assert.equal(lines[0].product_id, "chilli");
  assert.equal(lines[0].sales_unit, "box");
  assert.equal(lines[1].product_id, "water");
  assert.equal(lines[2].menu_key, "tea");
  assert.equal("product_id" in lines[2], false);
  assert.equal("sales_unit" in lines[2], false);
});
