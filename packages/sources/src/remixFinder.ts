import { normalizeForMatch, similarity, type Track } from '@tuneshift/core';
import type { SourceAdapter } from './types';

export interface VersionKind {
  id: string;
  label: string;
  query: string;
  match: RegExp;
}

/** Spec §3 Remix Finder version types, in grouping priority order. */
export const VERSION_KINDS: readonly VersionKind[] = [
  { id: 'sped-up', label: 'Sped up', query: 'sped up', match: /\b(sped|speed)\s*up\b/i },
  { id: 'slowed', label: 'Slowed', query: 'slowed', match: /\bslow(ed)?\b/i },
  { id: 'nightcore', label: 'Nightcore', query: 'nightcore', match: /\bnightcore\b/i },
  { id: '8d', label: '8D', query: '8d', match: /\b8d\b/i },
  { id: 'phonk', label: 'Phonk', query: 'phonk', match: /\bphonk\b/i },
  {
    id: 'bass-boosted',
    label: 'Bass boosted',
    query: 'bass boosted',
    match: /\bbass\s*boost(ed)?\b/i,
  },
  { id: 'reverb', label: 'Reverb', query: 'reverb', match: /\breverb\b/i },
  {
    id: 'remix',
    label: 'Remixes',
    query: 'remix',
    match: /\b(remix|rmx|edit|flip|bootleg|vip)\b/i,
  },
];

const VERSION_WORDS =
  /[([]?\s*(?:sped\s*up|speed\s*up|slowed(?:\s*\+?\s*reverb)?|nightcore|8d(?:\s*audio)?|phonk|bass\s*boost(?:ed)?|reverb|remix|rmx|edit|tiktok\s*version)\s*[)\]]?/gi;

/** "Song (Sped Up) [Remix]" → "Song" — the base title to search versions of. */
export function baseTitle(title: string): string {
  const cleaned = title
    .replace(VERSION_WORDS, ' ')
    .replace(/[-–—|]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || title;
}

export interface VersionGroup {
  kind: VersionKind;
  tracks: Track[];
}

/**
 * Search a catalog (Audius) for alternate versions of `track`, grouped by version type and
 * de-duplicated (each result appears once, in the first matching group).
 */
export async function findVersions(
  adapter: Pick<SourceAdapter, 'search'>,
  track: Pick<Track, 'key' | 'title' | 'artist'>,
  perKind = 12,
): Promise<VersionGroup[]> {
  const base = baseTitle(track.title);
  const baseNorm = normalizeForMatch(base);
  const results = await Promise.allSettled(
    VERSION_KINDS.map((k) =>
      adapter.search(`${base} ${k.query}`, { type: 'track', limit: perKind * 2, offset: 0 }),
    ),
  );
  const seen = new Set<string>([track.key]);
  const groups: VersionGroup[] = VERSION_KINDS.map((kind) => ({ kind, tracks: [] }));
  const candidates: Track[] = [];
  for (const r of results) if (r.status === 'fulfilled') candidates.push(...r.value.tracks);
  for (const t of candidates) {
    if (seen.has(t.key)) continue;
    const titleBase = normalizeForMatch(baseTitle(t.title));
    const related = titleBase.includes(baseNorm) || similarity(baseNorm, titleBase) >= 0.72;
    if (!related) continue;
    const group = groups.find((g) => g.kind.match.test(t.title));
    if (!group || group.tracks.length >= perKind) continue;
    group.tracks.push(t);
    seen.add(t.key);
  }
  return groups.filter((g) => g.tracks.length > 0);
}
