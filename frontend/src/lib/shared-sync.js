// Pure sync core: every business snapshot uses an acknowledged baseline and
// conditional writes. Failed uploads never replace the local working copy.
export function equal(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => equal(value, b[index]));
  }
  if (!object(a) || !object(b)) return false;
  const keys = Object.keys(a).filter((key) => a[key] !== undefined);
  return keys.length === Object.keys(b).filter((key) => b[key] !== undefined).length
    && keys.every((key) => Object.hasOwn(b, key) && equal(a[key], b[key]));
}
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const id = (v) => object(v) && v.id != null ? `id:${v.id}` : typeof v === 'string' ? `text:${v}` : null;
const keyed = (v) => Array.isArray(v) && v.every((item) => id(item) !== null) && new Set(v.map(id)).size === v.length;
const managedFields = [
  'stock', 'cost', 'unit', 'productionManaged', 'productionConsumption',
  'productionBaseUnit', 'productionUnitFactor', 'packTracking',
  'unopenedPacks', 'looseStock', 'totalBaseStock', 'stockLocations',
];
const inventoryState = (path) => path.startsWith('vestora-inventory-') && !path.includes(' ');

function authoritativeInventory(local, remote) {
  if (!keyed(local) || !keyed(remote)) return local;
  const managed = new Map(remote.filter((row) => object(row) && row.productionManaged).map((row) => [id(row), row]));
  if (!managed.size) return local;
  const present = new Set(local.map(id));
  return [...local.map((row) => {
    const source = managed.get(id(row));
    if (!source) return row;
    const projected = { ...row };
    for (const field of managedFields) {
      if (source[field] === undefined) delete projected[field];
      else projected[field] = source[field];
    }
    return projected;
  }), ...[...managed].filter(([key]) => !present.has(key)).map(([, row]) => row)];
}

// Older POS sessions could insert the same bill twice before sync completed.
// Only remove byte-identical duplicates; conflicting copies must be reviewed.
function uniqueSalesBills(value) {
  if (!Array.isArray(value)) return value;
  const bills = new Map();
  for (const bill of value) {
    const key = id(bill);
    if (key === null) return value;
    if (bills.has(key) && !equal(bills.get(key), bill)) return value;
    if (!bills.has(key)) bills.set(key, bill);
  }
  return [...bills.values()];
}

export function mergeShared(base, local, remote, path = 'Record') {
  // Kitchen projections own these fields. A stale browser may still have a
  // different balance while editing product metadata; never replay that delta.
  if (inventoryState(path)) local = authoritativeInventory(local, remote);
  if (path === 'vestora-sales-ledger') {
    base = uniqueSalesBills(base);
    local = uniqueSalesBills(local);
    remote = uniqueSalesBills(remote);
  }
  if (equal(local, base)) return remote;
  if (equal(remote, base)) return local;
  // A newly initialized ledger can have no acknowledged baseline while both
  // sides already contain sales. Merge distinct bill IDs as additions, and
  // retain the normal conflict check for different versions of the same bill.
  if (path === 'vestora-sales-ledger' && base == null && keyed(local) && keyed(remote)) {
    return mergeShared([], local, remote, path);
  }
  if (/^vestora-(food-stock|inventory)-/.test(path) && /\.(stock|available|sold|produced)$/.test(path) && [base, local, remote].every((value) => typeof value === "number" && Number.isFinite(value))) {
    return remote + local - base;
  }
  if (/\.(updatedAt|changedAt)$/.test(path) && [local, remote].every((value) => typeof value === "string" && Number.isFinite(Date.parse(value)))) return Date.parse(local) > Date.parse(remote) ? local : remote;
  if (path.startsWith('vestora-inventory-') && object(local) && object(remote) && object(base) && remote.productionManaged) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = managedFields.includes(key) ? remote[key] : mergeShared(base[key], local[key], remote[key], `${path}.${key}`);
      if (value !== undefined) result[key] = value;
    }
    return result;
  }
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
  function adoptReadOnly(key, row) {
    const mine = local(key);
    const pending = JSON.parse(storage.getItem(pendingKey(key)) || "null");
    if ((mine !== undefined && !equal(mine, row.state_value)) || pending) {
      // Retired snapshots cannot be replayed into the ledger. Keep every
      // distinct unsent copy (including a lost-ack operation) for review.
      const recoveryKey = `${checkpoint(key)}:read-only-recovery`;
      const copies = JSON.parse(storage.getItem(recoveryKey) || "[]");
      const copy = { local: mine, pending, baseline: JSON.parse(storage.getItem(checkpoint(key)) || "null"), reason: row.read_only_reason };
      if (!copies.some((saved) => equal(saved, copy))) copies.push(copy);
      storage.setItem(recoveryKey, JSON.stringify(copies));
    }
    remember(key, row);
    storage.setItem(key, JSON.stringify(row.state_value));
    storage.setItem(pendingKey(key), "null");
    changed(key, row.state_value);
    return row.state_value;
  }
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
    const hasInitialRow = snapshot && !Array.isArray(snapshot) && Object.prototype.hasOwnProperty.call(snapshot, 'row');
    const initialRow = hasInitialRow ? snapshot.row : await read(key);
    if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
    if (initialRow?.read_only === true) return adoptReadOnly(key, initialRow);
    snapshot = { row: initialRow };
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
      const hasSnapshotRow = snapshot && !Array.isArray(snapshot) && Object.prototype.hasOwnProperty.call(snapshot, 'row');
      const row = attempt === 0 && hasSnapshotRow ? snapshot.row : await read(key);
      if (!valid()) throw new Error('Sign-in changed. Synchronization stopped.');
      if (row?.read_only === true) return adoptReadOnly(key, row);
      const remote = row?.state_value;
      const mine = local(key);
      const raw = storage.getItem(checkpoint(key));
      const base = raw === null ? undefined : JSON.parse(raw).value;
      if (raw === null && mine !== undefined && storage.getItem(`${checkpoint(key)}:backup`) === null) storage.setItem(`${checkpoint(key)}:backup`, JSON.stringify(mine));
      const merged = raw === null && key === 'vestora-sales-ledger' && keyed(uniqueSalesBills(mine)) && keyed(uniqueSalesBills(remote))
        ? mergeShared([], mine, remote, key)
        : raw === null ? recoverShared(mine, remote) : mergeShared(base, mine, remote, key);
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
