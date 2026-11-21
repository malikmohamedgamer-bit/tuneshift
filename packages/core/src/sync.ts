/**
 * Offline-first sync primitives. IndexedDB is the source of truth; the server is a replica.
 * Conflicts resolve last-write-wins per record using `updatedAt` (ties go to the remote so all
 * devices converge on the same value).
 */

export interface SyncRecord {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export type Winner = 'local' | 'remote' | 'none';

export function resolveConflict<T extends SyncRecord>(
  local: T | undefined,
  remote: T | undefined,
): { winner: Winner; record: T | undefined } {
  if (!local && !remote) return { winner: 'none', record: undefined };
  if (!remote) return { winner: 'local', record: local };
  if (!local) return { winner: 'remote', record: remote };
  return local.updatedAt > remote.updatedAt
    ? { winner: 'local', record: local }
    : { winner: 'remote', record: remote };
}

export interface MergePlan<T extends SyncRecord> {
  /** Records to write into IndexedDB (remote won). */
  applyLocal: T[];
  /** Records to upload (local won and differs from remote). */
  push: T[];
}

/** Plan a two-way merge of one table. Tombstones (`deleted`) propagate like normal writes. */
export function planMerge<T extends SyncRecord>(
  locals: readonly T[],
  remotes: readonly T[],
): MergePlan<T> {
  const lm = new Map(locals.map((r) => [r.id, r]));
  const rm = new Map(remotes.map((r) => [r.id, r]));
  const ids = new Set([...lm.keys(), ...rm.keys()]);
  const plan: MergePlan<T> = { applyLocal: [], push: [] };
  for (const id of ids) {
    const l = lm.get(id);
    const r = rm.get(id);
    const { winner, record } = resolveConflict(l, r);
    if (!record) continue;
    if (winner === 'remote' && (!l || l.updatedAt !== r?.updatedAt || l.deleted !== r?.deleted))
      plan.applyLocal.push(record);
    if (winner === 'local' && (!r || r.updatedAt !== l?.updatedAt)) plan.push.push(record);
  }
  return plan;
}

export interface SyncOp {
  table: string;
  id: string;
  op: 'upsert' | 'delete';
  updatedAt: number;
}

/** Collapse a queue so only the latest op per (table, id) remains, in first-seen order. */
export function coalesceQueue(ops: readonly SyncOp[]): SyncOp[] {
  const latest = new Map<string, SyncOp>();
  const order: string[] = [];
  for (const op of ops) {
    const k = `${op.table}\u0000${op.id}`;
    const prev = latest.get(k);
    if (!prev) order.push(k);
    if (!prev || op.updatedAt >= prev.updatedAt) latest.set(k, op);
  }
  return order.map((k) => latest.get(k) as SyncOp);
}

/** Monotonic timestamp: never returns a value ≤ the previous one (same-ms edits still order). */
let lastStamp = 0;
export function nextStamp(now = Date.now()): number {
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}
