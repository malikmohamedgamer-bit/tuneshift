import {
  similarity,
  type Artist,
  type Collection,
  type SearchType,
  type SourceCapabilities,
  type SourceId,
  type Track,
} from '@tuneshift/core';
import { SourceError } from './http';
import type { SourceAdapter, SourceStatus } from './types';

export interface UnifiedSearchOptions {
  types?: SearchType[];
  sources?: SourceId[];
  limit?: number;
  signal?: AbortSignal;
}

export type TopResult =
  | { kind: 'track'; item: Track }
  | { kind: 'artist'; item: Artist }
  | { kind: 'collection'; item: Collection };

export interface UnifiedSearchResult {
  query: string;
  top?: TopResult;
  tracks: Track[];
  artists: Artist[];
  collections: Collection[];
  errors: { source: SourceId; message: string }[];
}

/**
 * Holds the adapters, which are enabled, and runtime capability overrides (e.g. a CORS probe
 * that failed for a host downgrades that source to "Speed only").
 */
export class SourceRegistry {
  private readonly adapters = new Map<SourceId, SourceAdapter>();
  private readonly runtimeFullEffects = new Map<SourceId, boolean>();

  constructor(
    adapters: SourceAdapter[],
    private readonly status: (id: SourceId) => SourceStatus,
  ) {
    for (const a of adapters) this.adapters.set(a.id, a);
  }

  get(id: SourceId): SourceAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new SourceError(`Unknown source ${id}`, 400, id);
    return a;
  }

  has(id: SourceId): boolean {
    return this.adapters.has(id);
  }

  all(): SourceAdapter[] {
    return [...this.adapters.values()];
  }

  statusOf(id: SourceId): SourceStatus {
    return this.status(id);
  }

  /** Adapters that are both enabled by the user and usable (e.g. have their key). */
  usable(): SourceAdapter[] {
    return this.all().filter((a) => {
      const s = this.status(a.id);
      return s.enabled && s.available;
    });
  }

  isUsable(id: SourceId): boolean {
    const s = this.status(id);
    return this.has(id) && s.enabled && s.available;
  }

  /** Record what the CORS probe found for a source (spec: "store the capability on the adapter"). */
  setFullEffects(id: SourceId, ok: boolean): void {
    this.runtimeFullEffects.set(id, ok);
  }

  capabilities(id: SourceId): SourceCapabilities {
    const base = this.get(id).capabilities;
    const rt = this.runtimeFullEffects.get(id);
    return rt === undefined ? base : { ...base, fullEffects: base.fullEffects && rt };
  }

  async search(q: string, opts: UnifiedSearchOptions = {}): Promise<UnifiedSearchResult> {
    const query = q.trim();
    const types = opts.types ?? ['track', 'artist', 'playlist', 'album'];
    const limit = opts.limit ?? 20;
    const sources = this.usable().filter((a) => !opts.sources || opts.sources.includes(a.id));
    const out: UnifiedSearchResult = {
      query,
      tracks: [],
      artists: [],
      collections: [],
      errors: [],
    };
    if (!query) return out;
    const jobs = sources.flatMap((a) =>
      types.map(async (type) => ({ a, page: await a.search(query, { type, limit, offset: 0 }) })),
    );
    const settled = await Promise.allSettled(jobs);
    const seenErr = new Set<SourceId>();
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        out.tracks.push(...r.value.page.tracks);
        out.artists.push(...r.value.page.artists);
        out.collections.push(...r.value.page.collections);
      } else {
        const src = sources[Math.floor(i / types.length)] as SourceAdapter;
        if (!seenErr.has(src.id) && !(r.reason instanceof DOMException)) {
          seenErr.add(src.id);
          out.errors.push({
            source: src.id,
            message:
              r.reason instanceof Error ? r.reason.message : `${src.displayName} search failed`,
          });
        }
      }
    });
    out.tracks = rankTracks(query, out.tracks);
    // Searching for an artist by name: their own most-played songs come first, ahead of fan
    // flips and remixes that merely mention them.
    const artist = out.artists
      .filter((a) => similarity(query, a.name) >= 0.9)
      .sort(
        (a, b) =>
          Number(b.verified ?? 0) - Number(a.verified ?? 0) ||
          (b.followerCount ?? 0) - (a.followerCount ?? 0),
      )[0];
    const adapter = artist && sources.find((s) => s.id === artist.source);
    if (artist && adapter?.getArtist && types.includes('track')) {
      try {
        const own = (await adapter.getArtist(artist.id)).tracks?.slice(0, 10) ?? [];
        const keys = new Set(own.map((t) => t.key));
        out.tracks = [...own, ...out.tracks.filter((t) => !keys.has(t.key))];
      } catch {
        // The artist page failing must not break search; ranked results still show.
      }
    }
    out.top = pickTop(query, out);
    return out;
  }
}

/**
 * Order merged track results: songs by an artist whose name matches the query first, then
 * verified uploaders and popular tracks, then each source's own relevance order (as a tiebreak,
 * interleaved so one catalog doesn't bury the other).
 */
export function rankTracks(query: string, tracks: Track[]): Track[] {
  const rankInSource = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const t of tracks) {
    const n = seen.get(t.source) ?? 0;
    rankInSource.set(t.key, n);
    seen.set(t.source, n + 1);
  }
  const score = (t: Track) => {
    const artistMatch = similarity(query, t.artist);
    const titleMatch = similarity(query, t.title);
    return (
      (artistMatch >= 0.9 ? 3 : artistMatch * 0.8) +
      titleMatch * 0.6 +
      (t.artistVerified ? 0.6 : 0) +
      Math.min(1, Math.log10(1 + (t.playCount ?? 0)) / 7) -
      (rankInSource.get(t.key) ?? 0) * 0.02
    );
  };
  const scored = tracks.map((t) => ({ t, s: score(t) }));
  return scored.sort((a, b) => b.s - a.s).map((x) => x.t);
}

function pickTop(q: string, r: UnifiedSearchResult): TopResult | undefined {
  let best: TopResult | undefined;
  let bestScore = 0.55;
  const consider = (cand: TopResult, label: string, boost = 0) => {
    const s = similarity(q, label) + boost;
    if (s > bestScore) {
      bestScore = s;
      best = cand;
    }
  };
  r.artists.slice(0, 5).forEach((a) => consider({ kind: 'artist', item: a }, a.name, 0.05));
  r.tracks
    .slice(0, 10)
    .forEach((t) =>
      consider({ kind: 'track', item: t }, t.title, Math.min(0.04, (t.playCount ?? 0) / 2_500_000)),
    );
  r.collections.slice(0, 5).forEach((c) => consider({ kind: 'collection', item: c }, c.title));
  return best ?? (r.tracks[0] ? { kind: 'track', item: r.tracks[0] } : undefined);
}
