import type { Track } from '@tuneshift/core';
import type { AudiusAdapter } from './audius';
import type { JamendoAdapter } from './jamendo';

export type CollectionQuery =
  | { kind: 'search'; query: string }
  | { kind: 'trending'; genre: string; time?: 'week' | 'month' | 'allTime' };

export interface CollectionDef {
  id: string;
  name: string;
  subtitle: string;
  colors: readonly [string, string];
  audius: CollectionQuery;
  /** Jamendo tags (used when Jamendo is enabled). */
  jamendoTags?: string;
}

/** Home "Collections" (spec §7), built from Audius genre/search queries + Jamendo tags. */
export const COLLECTIONS: readonly CollectionDef[] = [
  {
    id: 'phonk',
    name: 'Phonk',
    subtitle: 'Cowbells & drift',
    colors: ['#7f1d1d', '#7c3aed'],
    audius: { kind: 'search', query: 'phonk' },
    jamendoTags: 'phonk',
  },
  {
    id: 'edm-anthems',
    name: 'EDM Anthems',
    subtitle: 'Big room energy',
    colors: ['#0891b2', '#7c3aed'],
    audius: { kind: 'trending', genre: 'Electronic', time: 'month' },
    jamendoTags: 'edm',
  },
  {
    id: 'hip-hop',
    name: 'Hip-Hop',
    subtitle: 'Fresh bars',
    colors: ['#b45309', '#be123c'],
    audius: { kind: 'trending', genre: 'Hip-Hop/Rap' },
    jamendoTags: 'hiphop',
  },
  {
    id: 'lofi-chill',
    name: 'Lo-fi & Chill',
    subtitle: 'Study & unwind',
    colors: ['#a16207', '#9333ea'],
    audius: { kind: 'trending', genre: 'Lo-Fi', time: 'month' },
    jamendoTags: 'lofi',
  },
  {
    id: 'sped-up',
    name: 'Sped Up',
    subtitle: 'Faster, higher, now',
    colors: ['#db2777', '#f97316'],
    audius: { kind: 'search', query: 'sped up' },
  },
  {
    id: 'slowed-reverb',
    name: 'Slowed + Reverb',
    subtitle: 'Dreamy & heavy',
    colors: ['#4338ca', '#0ea5e9'],
    audius: { kind: 'search', query: 'slowed reverb' },
  },
  {
    id: 'nightcore',
    name: 'Nightcore',
    subtitle: 'Bright & fast',
    colors: ['#06b6d4', '#c026d3'],
    audius: { kind: 'search', query: 'nightcore' },
  },
  {
    id: 'remixes',
    name: 'Remixes',
    subtitle: 'Flips & edits',
    colors: ['#16a34a', '#2563eb'],
    audius: { kind: 'search', query: 'remix' },
  },
  {
    id: 'chill-rnb',
    name: 'Chill R&B',
    subtitle: 'Smooth & late',
    colors: ['#9d174d', '#6d28d9'],
    audius: { kind: 'trending', genre: 'R&B/Soul', time: 'month' },
    jamendoTags: 'rnb',
  },
  {
    id: 'gaming-mix',
    name: 'Gaming Mix',
    subtitle: 'Locked in',
    colors: ['#15803d', '#0f766e'],
    audius: { kind: 'search', query: 'gaming' },
    jamendoTags: 'videogame',
  },
  {
    id: 'workout',
    name: 'Workout',
    subtitle: 'One more rep',
    colors: ['#dc2626', '#ea580c'],
    audius: { kind: 'search', query: 'workout' },
    jamendoTags: 'energetic',
  },
  {
    id: 'late-night',
    name: 'Late Night',
    subtitle: 'After hours',
    colors: ['#1e3a8a', '#581c87'],
    audius: { kind: 'search', query: 'late night' },
    jamendoTags: 'night',
  },
];

export function collectionDef(id: string): CollectionDef | undefined {
  return COLLECTIONS.find((c) => c.id === id);
}

/** Load a collection's tracks from the enabled catalogs (Audius first, Jamendo merged in). */
export async function loadCollection(
  def: CollectionDef,
  audius: AudiusAdapter | null,
  jamendo: JamendoAdapter | null,
  limit = 40,
): Promise<Track[]> {
  const jobs: Promise<Track[]>[] = [];
  if (audius) {
    jobs.push(
      def.audius.kind === 'search'
        ? audius.search(def.audius.query, { type: 'track', limit, offset: 0 }).then((p) => p.tracks)
        : audius.trending({ genre: def.audius.genre, time: def.audius.time ?? 'week', limit }),
    );
  }
  if (jamendo && def.jamendoTags) jobs.push(jamendo.byTags(def.jamendoTags, Math.ceil(limit / 3)));
  const settled = await Promise.allSettled(jobs);
  const lists = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (!lists.length && settled[0]?.status === 'rejected') throw settled[0].reason;
  const seen = new Set<string>();
  const out: Track[] = [];
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) {
    for (const l of lists) {
      const t = l[i];
      if (t && !seen.has(t.key)) {
        seen.add(t.key);
        out.push(t);
      }
    }
  }
  return out;
}

/** Autoplay radio: similar tracks (same genre trending, same artist, mood) for when the queue ends. */
export async function radioFor(seed: Track, audius: AudiusAdapter, limit = 20): Promise<Track[]> {
  const jobs: Promise<Track[]>[] = [
    audius.search(seed.artist, { type: 'track', limit: 10, offset: 0 }).then((p) => p.tracks),
    audius.trending({ genre: seed.genre, time: 'week', limit: 25 }),
  ];
  if (seed.mood)
    jobs.push(
      audius
        .search(`${seed.mood} ${seed.genre ?? ''}`.trim(), { type: 'track', limit: 10, offset: 0 })
        .then((p) => p.tracks),
    );
  const settled = await Promise.allSettled(jobs);
  const pool: Track[] = [];
  const seen = new Set<string>([seed.key]);
  const lists = settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  for (let i = 0; pool.length < limit && i < 30; i++) {
    for (const l of lists) {
      const t = l[i];
      if (t && !seen.has(t.key) && t.title.toLowerCase() !== seed.title.toLowerCase()) {
        seen.add(t.key);
        pool.push(t);
      }
    }
  }
  return pool.slice(0, limit);
}
