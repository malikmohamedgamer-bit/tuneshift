import { parseTrackKey, type SourceId, type Track } from '@tuneshift/core';
import {
  AudiusAdapter,
  JamendoAdapter,
  LocalAdapter,
  LrclibClient,
  SourceRegistry,
  type LocalLibraryProvider,
  type LyricsResult,
} from '@tuneshift/sources';
import { getKeys } from '../env';
import { db } from '../db/db';
import { getSettings } from '../state/settings';
import { localFileUrl } from './localFiles';
import { demoUrl, isDemoId } from './demo';
import { isTauri } from '../platform/detect';

const localProvider: LocalLibraryProvider = {
  getTrack: (id) => db.tracks.get(`local:${id}`),
  async search(q, limit, offset) {
    const needle = q.toLowerCase();
    return db.tracks
      .where('source')
      .equals('local')
      .filter((t) => `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(needle))
      .offset(offset)
      .limit(limit)
      .toArray();
  },
  async fileUrl(track) {
    if (isDemoId(track.id)) return demoUrl(track.id);
    const rec = await db.localFiles.get(track.id);
    if (rec?.kind === 'tauri' && rec.path && isTauri()) {
      const { convertFileSrc } = await import('@tauri-apps/api/core');
      return convertFileSrc(rec.path);
    }
    return localFileUrl(track.id);
  },
};

export const audius = new AudiusAdapter({ apiKey: () => getKeys().audiusApiKey });
export const jamendo = new JamendoAdapter({ clientId: () => getKeys().jamendoClientId });
export const local = new LocalAdapter(localProvider);

export const registry = new SourceRegistry([local, audius, jamendo], (id: SourceId) => {
  const enabled = getSettings().sourcesEnabled[id] !== false;
  if (id === 'jamendo' && !getKeys().jamendoClientId) {
    return { enabled, available: false, reason: 'Add a Jamendo client ID in Settings to enable' };
  }
  return { enabled, available: true };
});

export const lyrics = new LrclibClient({
  async get(key) {
    const hit = await db.lyricsCache.get(key);
    // "No lyrics" answers are re-checked after a week; found lyrics are kept.
    if (hit && (hit.value.status === 'found' || Date.now() - hit.at < 7 * 86_400_000))
      return hit.value;
    return undefined;
  },
  async set(key: string, value: LyricsResult) {
    await db.lyricsCache.put({ key, value, at: Date.now() });
  },
});

/** Cache metadata of tracks the user sees/plays so likes, history and playlists can show them. */
export async function rememberTracks(tracks: Track[]): Promise<void> {
  const remote = tracks.filter((t) => t.source !== 'local');
  if (remote.length) await db.tracks.bulkPut(remote);
}

/** Load full track metadata for keys (IndexedDB first, then the source). */
export async function loadTracks(keys: string[]): Promise<Map<string, Track>> {
  const out = new Map<string, Track>();
  const cached = await db.tracks.bulkGet(keys);
  const missing: string[] = [];
  keys.forEach((k, i) => {
    const t = cached[i];
    if (t) out.set(k, t);
    else missing.push(k);
  });
  await Promise.all(
    missing.map(async (k) => {
      const ref = parseTrackKey(k);
      if (!ref || !registry.has(ref.source) || !registry.isUsable(ref.source)) return;
      try {
        const t = await registry.get(ref.source).getTrack(ref.id);
        out.set(k, t);
        if (t.source !== 'local') await db.tracks.put(t);
      } catch {
        // unavailable track: callers show it as missing
      }
    }),
  );
  return out;
}

export function sourceLabel(id: SourceId): string {
  return id === 'local' ? 'Local' : id === 'audius' ? 'Audius' : 'Jamendo';
}
