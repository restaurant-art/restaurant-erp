// Shared by the browser and the regression tests. No auth credentials belong
// here; the caller supplies authenticated read/write functions.
export const isInventoryStateKey = (key) => /^vestora-inventory-(?!transactions-)/.test(key);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const identity = (item) => typeof item === "string" ? `category:${item}` : `item:${item.id}`;

function indexed(items) {
  const result = new Map();
  for (const item of items) {
    if (typeof item !== "string" && (!item || item.id == null)) throw new Error("Inventory contains a record without an ID; export it before repairing it.");
    const id = identity(item);
    if (result.has(id)) throw new Error("Inventory contains duplicate IDs; export it before repairing it.");
    result.set(id, item);
  }
  return result;
}

export function mergeInventory(base, local, remote) {
  const mine = indexed(local);
  const theirs = indexed(remote);
  // First upgrade: retain cloud values for known IDs and recover missing local
  // records. This imports browser-only additions without replacing live stock.
  if (base === null) return [...remote, ...local.filter((item) => !theirs.has(identity(item)))];
  const before = indexed(base);
  const result = [];
  for (const id of new Set([...theirs.keys(), ...mine.keys(), ...before.keys()])) {
    const original = before.get(id);
    const localValue = mine.get(id);
    const remoteValue = theirs.get(id);
    const localChanged = !equal(localValue, original);
    const remoteChanged = !equal(remoteValue, original);
    if (localChanged && remoteChanged && !equal(localValue, remoteValue)) {
      throw new Error(`${localValue?.name || remoteValue?.name || original?.name || "Inventory"} was also changed on another device. Your local copy is retained; export it before resolving the conflict.`);
    }
    const value = localChanged ? localValue : remoteValue;
    if (value !== undefined) result.push(value);
  }
  return result;
}

export function createInventorySync({ storage, namespace, read, write, changed = () => {} }) {
  const jobs = new Map();
  const checkpointKey = (key) => `inventory-sync:${namespace}:${key}`;
  const readLocal = (key) => {
    const value = JSON.parse(storage.getItem(key) || "[]");
    if (!Array.isArray(value)) throw new Error("Saved inventory is invalid. Export a backup before repairing it.");
    return value;
  };

  async function run(key) {
    const checkpoint = checkpointKey(key);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const row = await read(key);
      const remote = row?.state_value ?? [];
      if (!Array.isArray(remote)) throw new Error("Cloud inventory is invalid; local data has been retained.");
      const local = readLocal(key);
      const previous = storage.getItem(checkpoint);
      const base = previous === null ? null : JSON.parse(previous).value;
      if (previous === null && local.length && storage.getItem(`${checkpoint}:backup`) === null) {
        storage.setItem(`${checkpoint}:backup`, JSON.stringify(local));
      }
      const merged = mergeInventory(base, local, remote);
      let saved = row;
      if (!equal(merged, remote)) {
        try {
          saved = await write(key, merged, row?.updated_at ?? null);
        } catch (error) {
          if (error.status === 409 && attempt < 4) continue;
          throw error;
        }
      }
      const value = saved?.state_value ?? remote;
      // Writes may finish after another local edit. Rebase that edit on the
      // acknowledged snapshot, then send it in the next iteration.
      const latest = readLocal(key);
      const next = equal(latest, local) ? value : mergeInventory(local, latest, value);
      storage.setItem(checkpoint, JSON.stringify({ value, revision: saved?.updated_at ?? null }));
      storage.setItem(key, JSON.stringify(next));
      changed(key, next);
      if (equal(next, value)) return next;
    }
    throw new Error("Inventory is changing on another device. Your edits are saved locally and will retry.");
  }

  return (key) => {
    if (jobs.has(key)) return jobs.get(key);
    const job = run(key).finally(() => jobs.delete(key));
    jobs.set(key, job);
    return job;
  };
}
