import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type * as LibraryModule from '../db/library';
import type * as SyncModule from './sync';
import type * as DbModule from '../db/db';
import type * as AuthModule from '../state/auth';
import type * as SettingsModule from '../state/settings';

// ---- browser globals the app expects (Node has none of these) -------------------------
const memory = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
    clear: () => memory.clear(),
    key: (i: number) => [...memory.keys()][i] ?? null,
    get length() {
      return memory.size;
    },
  },
  window: globalThis,
});
Object.assign(globalThis, {
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
});
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true });

// ---- in-memory fake of the Supabase query builder --------------------------------------
type Row = Record<string, unknown>;
const tables = new Map<string, Row[]>();
let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 0, 1) + ++clock * 1000).toISOString();
const keyCols = (t: string) =>
  t === 'user_records'
    ? ['user_id', 'kind', 'id']
    : t === 'playlist_tracks'
      ? ['user_id', 'playlist_id', 'position']
      : ['user_id', 'id'];

function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: 'select' | 'delete' = 'select';
  let orderCol: string | null = null;
  let limitN = Infinity;
  const rows = () => tables.get(table) ?? [];
  const b = {
    select: () => ((op = 'select'), b),
    delete: () => ((op = 'delete'), b),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    gt: (c: string, v: string) => (filters.push((r) => String(r[c]) > v), b),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b),
    or: () => b,
    order: (c: string) => ((orderCol = c), b),
    limit: (n: number) => ((limitN = n), b),
    upsert: (row: Row) => {
      const all = rows().filter((r) => !keyCols(table).every((k) => r[k] === row[k]));
      tables.set(table, [...all, { ...row, synced_at: stamp() }]);
      return Promise.resolve({ error: null });
    },
    insert: (r: Row | Row[]) => {
      tables.set(table, [
        ...rows(),
        ...(Array.isArray(r) ? r : [r]).map((x) => ({ ...x, synced_at: stamp() })),
      ]);
      return Promise.resolve({ error: null });
    },
    then: (resolve: (v: { data: Row[] | null; error: null }) => void) => {
      const match = (r: Row) => filters.every((f) => f(r));
      if (op === 'delete') {
        tables.set(
          table,
          rows().filter((r) => !match(r)),
        );
        return resolve({ data: null, error: null });
      }
      let out = rows().filter(match);
      if (orderCol)
        out = [...out].sort((a, c) =>
          String(a[orderCol as string]).localeCompare(String(c[orderCol as string])),
        );
      resolve({ data: out.slice(0, limitN), error: null });
    },
  };
  return b;
}

const fakeClient = { from: (t: string) => builder(t) };
vi.mock('./supabase', () => ({
  loadSupabase: () => Promise.resolve(fakeClient),
  getSupabase: () => fakeClient,
  requireSupabase: () => fakeClient,
  isSupabaseConfigured: () => true,
}));

const UID = 'user-1';
// Modules are imported after the globals above exist (dynamic import), typed via `import type`.
let lib: typeof LibraryModule;
let sync: typeof SyncModule;
let dbm: typeof DbModule;
let auth: typeof AuthModule;
let settings: typeof SettingsModule;

beforeAll(async () => {
  lib = await import('../db/library');
  sync = await import('./sync');
  dbm = await import('../db/db');
  auth = await import('../state/auth');
  settings = await import('../state/settings');
  auth.setAuth({
    status: 'signed-in',
    session: { user: { id: UID } } as never,
    profile: {
      id: UID,
      username: 'me',
      display_name: 'Me',
      avatar_url: null,
      share_activity: true,
    },
  });
});

beforeEach(async () => {
  tables.clear();
  await Promise.all(dbm.db.tables.map((t) => t.clear()));
});

const track = (id: string, source: 'audius' | 'local' = 'audius') => ({
  key: `${source}:${id}`,
  source,
  id,
  title: `Song ${id}`,
  artist: 'Artist',
  durationSec: 120,
});

describe('sync engine (fake Supabase)', () => {
  it('pushes queued local writes, clears dirty flags and the queue', async () => {
    await lib.setLiked(track('a'), true);
    await lib.createSound('Car mix', (await import('@tuneshift/core')).presetSettings('club'));
    expect(await dbm.db.syncQueue.count()).toBe(2);
    await sync.syncNow();
    expect(tables.get('likes')).toHaveLength(1);
    expect(tables.get('likes')?.[0]).toMatchObject({
      user_id: UID,
      id: 'audius:a',
      deleted: false,
    });
    expect(tables.get('sounds')?.[0]).toMatchObject({ name: 'Car mix' });
    expect(await dbm.db.syncQueue.count()).toBe(0);
    expect((await dbm.db.likes.get('audius:a'))?.dirty).toBe(0);
    expect(auth.getAuth().syncError).toBeNull();
  });

  it('playlists sync their tracks; local files travel as local-only metadata', async () => {
    await dbm.db.tracks.bulkPut([track('x'), track('f1', 'local')]);
    const p = await lib.createPlaylist('Mix', ['audius:x', 'local:f1']);
    await sync.syncNow();
    const pt = tables.get('playlist_tracks') ?? [];
    expect(pt.map((r) => [r.position, r.track_key, r.local_only])).toEqual([
      [0, 'audius:x', false],
      [1, 'local:f1', true],
    ]);
    // A second device pulls it.
    await Promise.all(dbm.db.tables.map((t) => t.clear()));
    await sync.resetSyncCursors();
    await sync.syncNow();
    const pulled = await dbm.db.playlists.get(p.id);
    expect(pulled?.trackKeys).toEqual(['audius:x', 'local:f1']);
    expect(pulled?.name).toBe('Mix');
    expect(await dbm.db.tracks.get('audius:x')).toMatchObject({ title: 'Song x' });
  });

  it('last write wins in both directions; deletes propagate as tombstones', async () => {
    await lib.setLiked(track('old'), true);
    await lib.setLiked(track('new'), true);
    await sync.syncNow();
    // Remote edits: newer tombstone for "old", older version of "new".
    const likes = tables.get('likes') as Row[];
    const remoteOld = likes.find((r) => r.id === 'audius:old') as Row;
    remoteOld.updated_at = Date.now() + 60_000;
    remoteOld.deleted = true;
    remoteOld.synced_at = stamp();
    // Local edit to "new" after the push (local stays newer than remote).
    await lib.setLiked(track('new'), false);
    await sync.syncNow();
    expect((await dbm.db.likes.get('audius:old'))?.deleted).toBe(true);
    const remoteNew = (tables.get('likes') as Row[]).find((r) => r.id === 'audius:new');
    expect(remoteNew?.deleted).toBe(true);
  });

  it('syncs portable settings as one record', async () => {
    sync.startSync();
    settings.useSettings.getState().set({ themeId: 'ocean', crossfadeSec: 4 });
    await new Promise((r) => setTimeout(r, 20));
    await sync.syncNow();
    const rec = (tables.get('user_records') ?? []).find((r) => r.kind === 'settings');
    expect(rec?.data).toMatchObject({ themeId: 'ocean', crossfadeSec: 4 });
    sync.stopSync();
  });
});
