import {
  coalesceQueue,
  migrateSound,
  nextStamp,
  planMerge,
  type HistoryEntry,
  type Like,
  type Playlist,
  type SavedSound,
  type SyncOp,
  type Track,
} from '@tuneshift/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { db, kvGet, kvSet, type SyncedTable, type ThemeRecord } from '../db/db';
import { getSupabase } from './supabase';
import { getAuth, setAuth } from '../state/auth';
import { DEFAULT_SETTINGS, useSettings, type Settings } from '../state/settings';

/**
 * Offline-first sync (spec §8): IndexedDB is the source of truth. Local writes enqueue ops
 * (db/library.ts); `syncNow()` pushes them, then pulls everything that changed on the server
 * since the last cursor (server `synced_at`, immune to clock skew) and merges per record with
 * last-write-wins on the client `updated_at` stamp.
 */

type Row = Record<string, unknown> & { id: string; updated_at: number; deleted: boolean };
const RECORD_KINDS = ['playlistFolders', 'smartPlaylists', 'assignments', 'lyricsOffsets'] as const;
type RecordKind = (typeof RECORD_KINDS)[number];
const isRecordKind = (t: string): t is RecordKind =>
  (RECORD_KINDS as readonly string[]).includes(t);

/** Settings that follow the user across devices (device-specific ones stay local). */
const SYNCED_SETTINGS = [
  'displayName',
  'themeId',
  'layout',
  'textScale',
  'visualizer',
  'showVisualizer',
  'crossfadeSec',
  'normalization',
  'autoplay',
  'smartShuffle',
  'defaultSound',
  'sourcesEnabled',
  'shortcuts',
  'shareActivity',
] as const satisfies readonly (keyof Settings)[];

function pickSettings(s: Settings): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_SETTINGS) out[k] = s[k];
  return out as Partial<Settings>;
}

let settingsWatch = false;
function watchSettings(): void {
  if (settingsWatch) return;
  settingsWatch = true;
  useSettings.subscribe((s, p) => {
    if (SYNCED_SETTINGS.some((k) => JSON.stringify(s[k]) !== JSON.stringify(p[k]))) {
      const updatedAt = nextStamp();
      void kvSet('settings:updatedAt', updatedAt).then(() =>
        db.syncQueue.add({ table: 'settings', id: 'settings', op: 'upsert', updatedAt }),
      );
    }
  });
}

// ------------------------------------------------------------------ local → remote mapping
async function toRemote(
  table: SyncedTable | 'settings',
  id: string,
  uid: string,
): Promise<{ table: string; row: Record<string, unknown>; extra?: () => Promise<void> } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  switch (table) {
    case 'likes': {
      const l = await db.likes.get(id);
      if (!l) return null;
      const t = await db.tracks.get(id);
      return {
        table: 'likes',
        row: {
          user_id: uid,
          id,
          liked_at: l.likedAt,
          track: t ? slimTrack(t) : {},
          updated_at: l.updatedAt,
          deleted: Boolean(l.deleted),
        },
      };
    }
    case 'playlists': {
      const p = await db.playlists.get(id);
      if (!p) return null;
      const tracks = await db.tracks.bulkGet(p.trackKeys);
      return {
        table: 'playlists',
        row: {
          user_id: uid,
          id,
          name: p.name,
          description: p.description ?? null,
          folder_id: p.folderId ?? null,
          sort_order: p.order,
          data: {
            coverDataUrl: p.coverDataUrl,
            soundId: p.soundId,
            themeId: p.themeId,
            createdAt: p.createdAt,
          },
          updated_at: p.updatedAt,
          deleted: Boolean(p.deleted),
        },
        extra: async () => {
          await sb.from('playlist_tracks').delete().eq('user_id', uid).eq('playlist_id', id);
          if (p.deleted || !p.trackKeys.length) return;
          const rows = p.trackKeys.map((k, position) => {
            const t = tracks[position];
            const source = (k.split(':')[0] ?? 'audius') as Track['source'];
            return {
              user_id: uid,
              playlist_id: id,
              position,
              track_key: k,
              source,
              local_only: source === 'local',
              meta: t ? slimTrack(t) : {},
            };
          });
          const { error } = await sb.from('playlist_tracks').insert(rows);
          if (error) throw error;
        },
      };
    }
    case 'sounds': {
      const s = await db.sounds.get(id);
      if (!s) return null;
      return {
        table: 'sounds',
        row: {
          user_id: uid,
          id,
          name: s.name,
          settings: s.settings,
          favourite: s.favourite,
          sort_order: s.order,
          updated_at: s.updatedAt,
          deleted: Boolean(s.deleted),
        },
      };
    }
    case 'themes': {
      const t = await db.themes.get(id);
      if (!t) return null;
      const { updatedAt, deleted, dirty: _d, ...theme } = t;
      return {
        table: 'themes',
        row: { user_id: uid, id, data: theme, updated_at: updatedAt, deleted: Boolean(deleted) },
      };
    }
    case 'history': {
      const h = await db.history.get(id);
      if (!h) return null;
      return {
        table: 'history',
        row: {
          user_id: uid,
          id,
          track_key: h.trackKey,
          source: h.source,
          title: h.title,
          artist: h.artist,
          genre: h.genre ?? null,
          played_at: h.playedAt,
          ms_listened: h.msListened,
          preset_name: h.presetName ?? null,
          updated_at: h.updatedAt,
          deleted: Boolean(h.deleted),
        },
      };
    }
    case 'settings': {
      const updatedAt = (await kvGet<number>('settings:updatedAt')) ?? 0;
      return {
        table: 'user_records',
        row: {
          user_id: uid,
          kind: 'settings',
          id: 'settings',
          data: pickSettings(useSettings.getState()),
          updated_at: updatedAt,
          deleted: false,
        },
      };
    }
    default: {
      if (!isRecordKind(table)) return null;
      const rec = (await db[table].get(id)) as
        (Record<string, unknown> & { updatedAt: number; deleted?: boolean }) | undefined;
      if (!rec) return null;
      const { updatedAt, deleted, dirty: _d, ...data } = rec;
      return {
        table: 'user_records',
        row: {
          user_id: uid,
          kind: table,
          id,
          data,
          updated_at: updatedAt,
          deleted: Boolean(deleted),
        },
      };
    }
  }
}

function slimTrack(t: Track): Record<string, unknown> {
  return {
    key: t.key,
    source: t.source,
    id: t.id,
    title: t.title,
    artist: t.artist,
    artistId: t.artistId,
    album: t.album,
    durationSec: t.durationSec,
    artwork: t.artwork,
    genre: t.genre,
    permalink: t.permalink,
    license: t.license,
  };
}

async function push(sb: SupabaseClient, uid: string): Promise<number> {
  const queued = await db.syncQueue.orderBy('seq').limit(500).toArray();
  if (!queued.length) return 0;
  const maxSeq = queued[queued.length - 1]?.seq ?? 0;
  const ops = coalesceQueue(queued as SyncOp[]);
  for (const op of ops) {
    const m = await toRemote(op.table as SyncedTable, op.id, uid);
    if (!m) continue;
    const conflict = m.table === 'user_records' ? 'user_id,kind,id' : 'user_id,id';
    const { error } = await sb.from(m.table).upsert(m.row, { onConflict: conflict });
    if (error) throw new Error(`${op.table}: ${error.message}`);
    await m.extra?.();
    if (op.table !== 'settings' && db.tables.some((t) => t.name === op.table)) {
      await db.table(op.table).update(op.id, { dirty: 0 });
    }
  }
  await db.syncQueue.where('seq').belowOrEqual(maxSeq).delete();
  return ops.length;
}

// ------------------------------------------------------------------ remote → local
interface Puller {
  table: string;
  kind?: string;
  apply: (rows: Row[]) => Promise<void>;
}

async function mergeInto<T extends { id: string; updatedAt: number; deleted?: boolean }>(
  table: {
    bulkGet: (ids: string[]) => Promise<(T | undefined)[]>;
    bulkPut: (rows: T[]) => Promise<unknown>;
  },
  remote: T[],
): Promise<T[]> {
  const local = (await table.bulkGet(remote.map((r) => r.id))).filter((x): x is T => Boolean(x));
  const plan = planMerge(local, remote);
  if (plan.applyLocal.length) await table.bulkPut(plan.applyLocal.map((r) => ({ ...r, dirty: 0 })));
  return plan.applyLocal;
}

function pullers(sb: SupabaseClient, uid: string): Puller[] {
  return [
    {
      table: 'likes',
      apply: async (rows) => {
        const applied = await mergeInto(
          db.likes,
          rows.map((r): Like => ({
            id: r.id,
            likedAt: Number(r.liked_at),
            updatedAt: r.updated_at,
            deleted: r.deleted,
          })),
        );
        const tracks = rows
          .map((r) => r.track as Track)
          .filter((t) => t?.key && t.source !== 'local');
        if (applied.length && tracks.length) await db.tracks.bulkPut(tracks);
      },
    },
    {
      table: 'playlists',
      apply: async (rows) => {
        const ids = rows.map((r) => r.id);
        const { data, error } = await sb
          .from('playlist_tracks')
          .select('playlist_id, position, track_key, meta')
          .eq('user_id', uid)
          .in('playlist_id', ids)
          .order('position');
        if (error) throw error;
        const byPl = new Map<string, { track_key: string; meta: Track }[]>();
        for (const t of (data ?? []) as { playlist_id: string; track_key: string; meta: Track }[])
          byPl.set(t.playlist_id, [...(byPl.get(t.playlist_id) ?? []), t]);
        const remote = rows.map((r): Playlist => {
          const d = (r.data ?? {}) as {
            coverDataUrl?: string;
            soundId?: string | null;
            themeId?: string | null;
            createdAt?: number;
          };
          return {
            id: r.id,
            name: String(r.name),
            description: (r.description as string | null) ?? undefined,
            folderId: (r.folder_id as string | null) ?? null,
            order: Number(r.sort_order ?? 0),
            coverDataUrl: d.coverDataUrl,
            soundId: d.soundId ?? null,
            themeId: d.themeId ?? null,
            createdAt: d.createdAt ?? Date.now(),
            trackKeys: (byPl.get(r.id) ?? []).map((t) => t.track_key),
            updatedAt: r.updated_at,
            deleted: r.deleted,
          };
        });
        await mergeInto(db.playlists, remote);
        const metas = [...byPl.values()]
          .flat()
          .map((t) => t.meta)
          .filter((m) => m?.key && m.source !== 'local');
        if (metas.length) {
          const have = new Set(
            (await db.tracks.bulkGet(metas.map((m) => m.key)))
              .filter(Boolean)
              .map((t) => (t as Track).key),
          );
          await db.tracks.bulkPut(metas.filter((m) => !have.has(m.key)));
        }
      },
    },
    {
      table: 'sounds',
      apply: async (rows) => {
        await mergeInto(
          db.sounds,
          rows.map((r): SavedSound => ({
            id: r.id,
            name: String(r.name),
            settings: migrateSound(r.settings),
            favourite: Boolean(r.favourite),
            order: Number(r.sort_order ?? 0),
            createdAt: r.updated_at,
            updatedAt: r.updated_at,
            deleted: r.deleted,
          })),
        );
      },
    },
    {
      table: 'themes',
      apply: async (rows) => {
        await mergeInto(
          db.themes,
          rows.map(
            (r) =>
              ({
                ...(r.data as object),
                id: r.id,
                updatedAt: r.updated_at,
                deleted: r.deleted,
              }) as ThemeRecord,
          ),
        );
      },
    },
    {
      table: 'history',
      apply: async (rows) => {
        await mergeInto(
          db.history,
          rows.map((r): HistoryEntry => ({
            id: r.id,
            trackKey: String(r.track_key),
            source: r.source as HistoryEntry['source'],
            title: String(r.title),
            artist: String(r.artist),
            genre: (r.genre as string | null) ?? undefined,
            playedAt: Number(r.played_at),
            msListened: Number(r.ms_listened),
            presetName: (r.preset_name as string | null) ?? undefined,
            updatedAt: r.updated_at,
            deleted: r.deleted,
          })),
        );
      },
    },
    ...RECORD_KINDS.map((kind): Puller => ({
      table: 'user_records',
      kind,
      apply: async (rows) => {
        const t = db[kind] as unknown as Parameters<typeof mergeInto>[0];
        await mergeInto(
          t,
          rows.map((r) => ({
            ...(r.data as object),
            id: r.id,
            updatedAt: r.updated_at,
            deleted: r.deleted,
          })),
        );
      },
    })),
    {
      table: 'user_records',
      kind: 'settings',
      apply: async (rows) => {
        const r = rows[0];
        if (!r) return;
        const localStamp = (await kvGet<number>('settings:updatedAt')) ?? 0;
        if (r.updated_at > localStamp) {
          const data = r.data as Partial<Settings>;
          const patch: Partial<Settings> = {};
          for (const k of SYNCED_SETTINGS)
            if (k in data) (patch as Record<string, unknown>)[k] = data[k] ?? DEFAULT_SETTINGS[k];
          useSettings.getState().set(patch);
          await kvSet('settings:updatedAt', r.updated_at);
        }
      },
    },
  ];
}

async function pull(sb: SupabaseClient, uid: string): Promise<number> {
  let total = 0;
  for (const p of pullers(sb, uid)) {
    const cursorKey = `sync:cursor:${p.table}:${p.kind ?? ''}`;
    let cursor = (await kvGet<string>(cursorKey)) ?? '1970-01-01T00:00:00Z';
    for (let page = 0; page < 20; page++) {
      let q = sb
        .from(p.table)
        .select('*')
        .eq('user_id', uid)
        .gt('synced_at', cursor)
        .order('synced_at')
        .limit(500);
      if (p.kind) q = q.eq('kind', p.kind);
      const { data, error } = await q;
      if (error) throw new Error(`${p.table}: ${error.message}`);
      const rows = (data ?? []) as (Row & { synced_at: string })[];
      if (!rows.length) break;
      await p.apply(rows);
      total += rows.length;
      cursor = rows[rows.length - 1]?.synced_at ?? cursor;
      await kvSet(cursorKey, cursor);
      if (rows.length < 500) break;
    }
  }
  return total;
}

let running: Promise<void> | null = null;
let hooked = false;
let timer: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;

export function syncNow(): Promise<void> {
  if (running) return running;
  const sb = getSupabase();
  const uid = getAuth().session?.user.id;
  if (!sb || !uid || getAuth().status !== 'signed-in' || !navigator.onLine)
    return Promise.resolve();
  setAuth({ syncing: true, syncError: null });
  running = (async () => {
    try {
      await push(sb, uid);
      await pull(sb, uid);
      setAuth({ lastSync: Date.now() });
    } catch (e) {
      setAuth({ syncError: e instanceof Error ? e.message : String(e) });
    } finally {
      setAuth({ syncing: false });
      running = null;
    }
  })();
  return running;
}

/** Start background sync for the signed-in user (on sign-in, online, interval, local writes). */
export function startSync(): void {
  watchSettings();
  void syncNow();
  if (!timer) {
    timer = setInterval(() => void syncNow(), 120_000);
    window.addEventListener('online', onOnline);
    if (!hooked) {
      hooked = true;
      db.syncQueue.hook('creating', () => {
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(() => void syncNow(), 4000);
      });
    }
  }
}

const onOnline = () => void syncNow();

export function stopSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
  window.removeEventListener('online', onOnline);
}

/** After signing out, reset cursors so the next account pulls fresh. Local data is kept. */
export async function resetSyncCursors(): Promise<void> {
  const keys = (await db.kv.toArray())
    .map((k) => k.key)
    .filter((k) => k.startsWith('sync:cursor:'));
  await db.kv.bulkDelete(keys);
}
