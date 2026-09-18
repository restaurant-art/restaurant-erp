// Pure sync core: every business snapshot uses an acknowledged baseline and
// conditional writes. Failed uploads never replace the local working copy.
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v) => object(v) && v.id != null ? `id:${v.id}` : typeof v === 'string' ? `text:${v}` : null;
const keyed = (v) => Array.isArray(v) && v.every((item) => id(item) !== null) && new Set(v.map(id)).size === v.length;

export function mergeShared(base, local, remote, path = 'Record') {
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;
  if (/^vestora-(food-stock|inventory)-/.test(path) && /\.(stock|available|sold|produced)$/.test(path) && [base, local, remote].every((value) => typeof value === "number" && Number.isFinite(value))) {
    const total = remote + local - base;
    if (total < 0) throw new Error("Another computer used this stock. Your change is retained locally; reconcile the stock before retrying.");
    return total;
  }
  if (/\.(updatedAt|changedAt)$/.test(path) && [local, remote].every((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))) return Date.parse(local) > Date.parse(remote) ? local : remote;
  if (object(local) && object(remote) && object(base)) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeShared(base[key], local[key], remote[key], `${path}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
  if (keyed(base) && keyed(local) && keyed(remote)) {
    const before = new Map(base.map((v) => [id(v), v]));
    const mine = new Map(local.map((v) => [id(v), v]));
    const theirs = new Map(remote.map((v) => [id(v), v]));
    // Preserve an intentional local reorder; otherwise adopt the remote order.
    const order = equal(base.map(id), local.map(id)) ? [...theirs.keys(), ...mine.keys()] : [...mine.keys(), ...theirs.keys()];
    return [...new Set(order)].map((key) => mergeShared(before.get(key), mine.get(key), theirs.get(key), `${path} ${mine.get(key)?.name || theirs.get(key)?.name || key}`)).filter((v) => v !== undefined);
  }
  if (equal(local, remote)) return local;
  throw new Error(`${path} changed on another computer. Your unsent changes are retained on this computer; review both copies before retrying.`);
}

export function recoverShared(local, remote) {
  if (remote === undefined) return local;
  if (keyed(local) && keyed(remote)) {
    const ids = new Set(remote.map(id));
    return [...remote, ...local.filter((v) => !ids.has(id(v)))];
  }
  if (object(local) && object(remote)) {
    const result = { ...remote };
    for (const key of Object.keys(local)) result[key] = recoverShared(local[key], remote[key]);
    return result;
  }
  return remote;
}

export function createSharedSync({ storage, namespace, read, write, changed = () => {}, valid = () => true }) {
  const jobs = new Map();
  const checkpoint = (key) => `cloud-sync:${namespace}:${key}`;
  const local = (key) => { const raw = storage.getItem(key); return raw === null ? undefined : JSON.parse(raw); };
  const remember = (key, row) => storage.setItem(checkpoint(key), JSON.stringify({ value: row?.state_value, revision: row?.updated_at ?? null }));
  const pendingKey = (key) => `${checkpoint(key)}:pending`;
  function acknowledge(key, operation, saved) {
    const last = storage.getItem(checkpoint(key));
    if (last && JSON.parse(last).revision === saved.updated_at) {
      storage.setItem(pendingKey(key), "null");
      return;
    }
    const latest = local(key);
    const next = equal(latest, operation.local) ? saved.state_value : mergeShared(operation.local, latest, saved.state_value, key);
    remember(key, saved);
    storage.setItem(key, JSON.stringify(next));
    storage.setItem(pendingKey(key), "null");
    changed(key, next);
  }
  async function run(key, snapshot) {
    const pending = JSON.parse(storage.getItem(pendingKey(key)) || "null");
    if (pending) {
      snapshot = undefined;
      try {
        const saved = await write(key, pending.value, pending.expected, pending.id);
        if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
        acknowledge(key, pending, saved);
      } catch (error) {
        if (error.status !== 409) throw error;
        storage.setItem(pendingKey(key), "null");
      }
    }
    for (let attempt = 0; attempt < 6; attempt++) {
      const row = attempt === 0 && snapshot ? snapshot.row : await read(key);
      if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
      const remote = row?.state_value;
      const mine = local(key);
      const raw = storage.getItem(checkpoint(key));
      const base = raw === null ? undefined : JSON.parse(raw).value;
      if (raw === null && mine !== undefined && storage.getItem(`${checkpoint(key)}:backup`) === null) storage.setItem(`${checkpoint(key)}:backup`, JSON.stringify(mine));
      const merged = raw === null ? recoverShared(mine, remote) : mergeShared(base, mine, remote, key);
      let saved = row;
      if (!equal(merged, remote)) {
        const operation = { id: crypto.randomUUID(), local: mine, value: merged ?? null, expected: row?.updated_at ?? null };
        storage.setItem(pendingKey(key), JSON.stringify(operation));
        try { saved = await write(key, operation.value, operation.expected, operation.id); }
        catch (error) {
          if (error.status === 409) { storage.setItem(pendingKey(key), "null"); if (attempt < 5) continue; }
          throw error;
        }
        if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
        acknowledge(key, operation, saved);
        if (equal(local(key), saved.state_value)) return saved.state_value;
        continue;
      }
      if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
      const value = saved?.state_value;
      const latest = local(key);
      const next = equal(mine, latest) ? value : mergeShared(mine, latest, value, key);
      remember(key, saved);
      if (next !== undefined) storage.setItem(key, JSON.stringify(next));
      changed(key, next);
      if (equal(next, value)) return value;
    }
    throw new Error('Changes are arriving from another computer. Your local changes are retained; retry shortly.');
  }
  return { sync(key, snapshot) {
    if (jobs.has(key)) return jobs.get(key);
    const job = run(key, snapshot).finally(() => jobs.delete(key));
    jobs.set(key, job);
    return job;
  }, checkpoint };
}
