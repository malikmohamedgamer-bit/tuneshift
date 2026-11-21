import {
  createId,
  migrateSound,
  neutralSound,
  nextStamp,
  presetSettings,
  soundPreset,
  type HistoryEntry,
  type Playlist,
  type PlaylistFolder,
  type RuleGroup,
  type SavedSound,
  type SmartPlaylist,
  type SoundRef,
  type SoundSettings,
  type Track,
} from '@tuneshift/core';
import { db, type SyncedTable } from './db';
import { rememberTracks } from '../lib/sources';

/**
 * All library writes go through here: they stamp `updatedAt`, mark records dirty and enqueue a
 * sync op, so the Supabase sync engine (when signed in) can push them later. Deletes of synced
 * records are tombstones (`deleted: true`) so they propagate to other devices.
 */

async function enqueue(table: SyncedTable, id: string, op: 'upsert' | 'delete', updatedAt: number) {
  await db.syncQueue.add({ table, id, op, updatedAt });
}

function stamp<T extends object>(rec: T): T & { updatedAt: number; dirty: 1 } {
  return { ...rec, updatedAt: nextStamp(), dirty: 1 };
}

// ---------------------------------------------------------------- likes
export async function isLiked(key: string): Promise<boolean> {
  const l = await db.likes.get(key);
  return Boolean(l && !l.deleted);
}

export async function setLiked(track: Track, liked: boolean): Promise<void> {
  await rememberTracks([track]);
  const rec = stamp({ id: track.key, likedAt: Date.now(), deleted: !liked });
  await db.transaction('rw', db.likes, db.syncQueue, async () => {
    await db.likes.put(rec);
    await enqueue('likes', rec.id, liked ? 'upsert' : 'delete', rec.updatedAt);
  });
}

export async function toggleLike(track: Track): Promise<boolean> {
  const next = !(await isLiked(track.key));
  await setLiked(track, next);
  return next;
}

// ---------------------------------------------------------------- playlists
export async function createPlaylist(
  name: string,
  trackKeys: string[] = [],
  folderId: string | null = null,
): Promise<Playlist> {
  const count = await db.playlists.count();
  const p: Playlist = stamp({
    id: createId(),
    name: name.trim() || 'New playlist',
    trackKeys,
    folderId,
    createdAt: Date.now(),
    order: count,
  });
  await savePlaylist(p);
  return p;
}

export async function savePlaylist(p: Playlist): Promise<void> {
  const rec = stamp(p);
  await db.transaction('rw', db.playlists, db.syncQueue, async () => {
    await db.playlists.put(rec);
    await enqueue('playlists', rec.id, rec.deleted ? 'delete' : 'upsert', rec.updatedAt);
  });
}

export async function updatePlaylist(id: string, patch: Partial<Playlist>): Promise<void> {
  const cur = await db.playlists.get(id);
  if (cur) await savePlaylist({ ...cur, ...patch });
}

export async function addToPlaylist(id: string, tracks: Track[]): Promise<number> {
  const cur = await db.playlists.get(id);
  if (!cur) return 0;
  await rememberTracks(tracks);
  const fresh = tracks.map((t) => t.key).filter((k) => !cur.trackKeys.includes(k));
  await savePlaylist({ ...cur, trackKeys: [...cur.trackKeys, ...fresh] });
  return fresh.length;
}

export async function removeFromPlaylist(id: string, index: number): Promise<void> {
  const cur = await db.playlists.get(id);
  if (!cur) return;
  await savePlaylist({ ...cur, trackKeys: cur.trackKeys.filter((_, i) => i !== index) });
}

export async function movePlaylistTrack(id: string, from: number, to: number): Promise<void> {
  const cur = await db.playlists.get(id);
  if (!cur) return;
  const keys = [...cur.trackKeys];
  const [k] = keys.splice(from, 1);
  if (k === undefined) return;
  keys.splice(Math.max(0, Math.min(to, keys.length)), 0, k);
  await savePlaylist({ ...cur, trackKeys: keys });
}

export async function duplicatePlaylist(id: string): Promise<Playlist | undefined> {
  const cur = await db.playlists.get(id);
  if (!cur) return undefined;
  const p = await createPlaylist(`${cur.name} (copy)`, [...cur.trackKeys], cur.folderId ?? null);
  await updatePlaylist(p.id, {
    description: cur.description,
    coverDataUrl: cur.coverDataUrl,
    soundId: cur.soundId,
    themeId: cur.themeId,
  });
  return p;
}

/** Soft-delete (tombstone). Returns an undo function (spec: delete with undo). */
export async function deletePlaylist(id: string): Promise<() => Promise<void>> {
  const cur = await db.playlists.get(id);
  if (!cur) return async () => undefined;
  await savePlaylist({ ...cur, deleted: true });
  return async () => savePlaylist({ ...cur, deleted: false });
}

export async function reorderPlaylists(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, order) => updatePlaylist(id, { order })));
}

// ---------------------------------------------------------------- playlist folders
export async function createFolder(name: string): Promise<PlaylistFolder> {
  const f: PlaylistFolder = stamp({
    id: createId(),
    name: name.trim() || 'New folder',
    order: await db.playlistFolders.count(),
  });
  await saveFolder(f);
  return f;
}

export async function saveFolder(f: PlaylistFolder): Promise<void> {
  const rec = stamp(f);
  await db.transaction('rw', db.playlistFolders, db.syncQueue, async () => {
    await db.playlistFolders.put(rec);
    await enqueue('playlistFolders', rec.id, rec.deleted ? 'delete' : 'upsert', rec.updatedAt);
  });
}

export async function deleteFolder(id: string): Promise<void> {
  const f = await db.playlistFolders.get(id);
  if (!f) return;
  const inside = await db.playlists.where('folderId').equals(id).toArray();
  for (const p of inside) await savePlaylist({ ...p, folderId: null });
  await saveFolder({ ...f, deleted: true });
}

// ---------------------------------------------------------------- smart playlists
export function emptyRules(): RuleGroup {
  return { id: createId(), match: 'all', rules: [] };
}

export async function saveSmartPlaylist(sp: SmartPlaylist): Promise<void> {
  const rec = stamp(sp);
  await db.transaction('rw', db.smartPlaylists, db.syncQueue, async () => {
    await db.smartPlaylists.put(rec);
    await enqueue('smartPlaylists', rec.id, rec.deleted ? 'delete' : 'upsert', rec.updatedAt);
  });
}

export async function createSmartPlaylist(name: string): Promise<SmartPlaylist> {
  const sp: SmartPlaylist = stamp({
    id: createId(),
    name: name.trim() || 'Smart playlist',
    root: emptyRules(),
    sort: { field: 'dateAdded', dir: 'desc' },
    limit: 100,
    createdAt: Date.now(),
  });
  await saveSmartPlaylist(sp);
  return sp;
}

// ---------------------------------------------------------------- My Sounds
export async function listSounds(): Promise<SavedSound[]> {
  const all = await db.sounds.orderBy('order').toArray();
  return all.filter((s) => !s.deleted).map((s) => ({ ...s, settings: migrateSound(s.settings) }));
}

export async function saveSound(s: SavedSound): Promise<void> {
  const rec = stamp(s);
  await db.transaction('rw', db.sounds, db.syncQueue, async () => {
    await db.sounds.put(rec);
    await enqueue('sounds', rec.id, rec.deleted ? 'delete' : 'upsert', rec.updatedAt);
  });
}

export async function createSound(name: string, settings: SoundSettings): Promise<SavedSound> {
  const all = await db.sounds.count();
  const s: SavedSound = stamp({
    id: createId(),
    name: name.trim().slice(0, 60) || 'My sound',
    settings,
    favourite: false,
    order: all,
    createdAt: Date.now(),
  });
  await saveSound(s);
  return s;
}

export async function updateSound(id: string, patch: Partial<SavedSound>): Promise<void> {
  const cur = await db.sounds.get(id);
  if (cur) await saveSound({ ...cur, ...patch });
}

export async function deleteSound(id: string): Promise<() => Promise<void>> {
  const cur = await db.sounds.get(id);
  if (!cur) return async () => undefined;
  await saveSound({ ...cur, deleted: true });
  return async () => saveSound({ ...cur, deleted: false });
}

export async function duplicateSound(id: string): Promise<SavedSound | undefined> {
  const cur = await db.sounds.get(id);
  return cur ? createSound(`${cur.name} copy`, migrateSound(cur.settings)) : undefined;
}

export async function reorderSounds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id, order) => updateSound(id, { order })));
}

/** Resolve a sound reference to settings + label. Unknown refs fall back to Normal. */
export async function resolveSoundRef(
  ref: SoundRef,
): Promise<{ settings: SoundSettings; label: string; ref: SoundRef }> {
  if (ref.kind === 'preset') {
    const p = soundPreset(ref.id);
    return p
      ? { settings: presetSettings(ref.id), label: p.name, ref }
      : { settings: neutralSound(), label: 'Normal', ref: { kind: 'preset', id: 'normal' } };
  }
  const s = await db.sounds.get(ref.id);
  if (!s || s.deleted)
    return { settings: neutralSound(), label: 'Normal', ref: { kind: 'preset', id: 'normal' } };
  return { settings: migrateSound(s.settings), label: s.name, ref };
}

// ---------------------------------------------------------------- sound assignments
export const songAssignmentId = (key: string) => `track:${key}`;
export const playlistAssignmentId = (id: string) => `playlist:${id}`;

export async function setAssignment(id: string, ref: SoundRef | null): Promise<void> {
  const cur = await db.assignments.get(id);
  const rec = stamp({
    id,
    ref: ref ?? cur?.ref ?? { kind: 'preset', id: 'normal' },
    deleted: ref === null,
  });
  await db.transaction('rw', db.assignments, db.syncQueue, async () => {
    await db.assignments.put(rec);
    await enqueue('assignments', id, ref ? 'upsert' : 'delete', rec.updatedAt);
  });
}

export async function getAssignment(id: string): Promise<SoundRef | null> {
  const a = await db.assignments.get(id);
  return a && !a.deleted ? a.ref : null;
}

// ---------------------------------------------------------------- history
export async function addHistory(entry: Omit<HistoryEntry, 'id' | 'updatedAt'>): Promise<void> {
  const rec: HistoryEntry = stamp({ ...entry, id: createId() });
  await db.transaction('rw', db.history, db.syncQueue, async () => {
    await db.history.put(rec);
    await enqueue('history', rec.id, 'upsert', rec.updatedAt);
  });
}

export async function clearHistory(): Promise<void> {
  const all = await db.history.toArray();
  const now = nextStamp();
  await db.transaction('rw', db.history, db.syncQueue, async () => {
    await db.history.bulkPut(
      all.map((h) => ({ ...h, deleted: true, updatedAt: now, dirty: 1 as const })),
    );
    for (const h of all) await enqueue('history', h.id, 'delete', now);
  });
}

export async function recentTrackKeys(limit = 20): Promise<string[]> {
  const rows = await db.history
    .orderBy('playedAt')
    .reverse()
    .limit(limit * 4)
    .toArray();
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.deleted) continue;
    seen.add(r.trackKey);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

// ---------------------------------------------------------------- lyrics offsets
export async function setLyricsOffset(trackKeyValue: string, offsetMs: number): Promise<void> {
  const rec = stamp({ id: trackKeyValue, offsetMs });
  await db.transaction('rw', db.lyricsOffsets, db.syncQueue, async () => {
    await db.lyricsOffsets.put(rec);
    await enqueue('lyricsOffsets', rec.id, 'upsert', rec.updatedAt);
  });
}

// ---------------------------------------------------------------- recent searches
export async function addRecentSearch(q: string): Promise<void> {
  const v = q.trim();
  if (!v) return;
  await db.searches.put({ q: v, at: Date.now() });
  const all = await db.searches.orderBy('at').reverse().toArray();
  if (all.length > 20) await db.searches.bulkDelete(all.slice(20).map((s) => s.q));
}
