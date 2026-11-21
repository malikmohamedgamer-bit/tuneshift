import { LRCLIB_CLIENT, parseLrc, type ParsedLyrics } from '@tuneshift/core';
import { z } from 'zod';
import { fetchJson, qs, SourceError } from './http';

export const LRCLIB_API = 'https://lrclib.net/api';

const LrcRecord = z.object({
  id: z.number(),
  trackName: z.string().nullish(),
  artistName: z.string().nullish(),
  albumName: z.string().nullish(),
  duration: z.number().nullish(),
  instrumental: z.boolean().nullish(),
  plainLyrics: z.string().nullish(),
  syncedLyrics: z.string().nullish(),
});

export type LyricsResult =
  | { status: 'found'; lyrics: ParsedLyrics; instrumental: false; sourceId: number }
  | { status: 'instrumental' }
  | { status: 'none' };

export interface LyricsQuery {
  title: string;
  artist: string;
  album?: string;
  durationSec?: number;
}

export interface LyricsCache {
  get(key: string): Promise<LyricsResult | undefined>;
  set(key: string, value: LyricsResult): Promise<void>;
}

export function lyricsCacheKey(q: LyricsQuery): string {
  return `${q.artist.toLowerCase().trim()}|${q.title.toLowerCase().trim()}|${Math.round(q.durationSec ?? 0)}`;
}

function toResult(raw: z.infer<typeof LrcRecord>): LyricsResult {
  if (raw.instrumental) return { status: 'instrumental' };
  const text = raw.syncedLyrics || raw.plainLyrics;
  if (!text) return { status: 'none' };
  const lyrics = parseLrc(text);
  if (!raw.syncedLyrics && raw.plainLyrics) lyrics.plain = raw.plainLyrics.trim();
  return { status: 'found', lyrics, instrumental: false, sourceId: raw.id };
}

/** LRCLIB client: /api/get first (exact), then /api/search; 404 → none, 429 respects Retry-After. */
export class LrclibClient {
  constructor(
    private readonly cache?: LyricsCache,
    private readonly fetchImpl?: typeof fetch,
  ) {}

  private headers = { 'Lrclib-Client': LRCLIB_CLIENT, 'X-User-Agent': LRCLIB_CLIENT };

  async find(q: LyricsQuery, signal?: AbortSignal): Promise<LyricsResult> {
    const key = lyricsCacheKey(q);
    const cached = await this.cache?.get(key);
    if (cached) return cached;
    const result = await this.fetch(q, signal);
    await this.cache?.set(key, result);
    return result;
  }

  private async fetch(q: LyricsQuery, signal?: AbortSignal): Promise<LyricsResult> {
    const opts = {
      source: 'LRCLIB',
      headers: this.headers,
      fetchImpl: this.fetchImpl,
      retryOn429: true,
      signal,
    };
    try {
      const raw = await fetchJson<unknown>(
        `${LRCLIB_API}/get?${qs({
          track_name: q.title,
          artist_name: q.artist,
          album_name: q.album,
          duration: q.durationSec ? Math.round(q.durationSec) : undefined,
        })}`,
        opts,
      );
      const r = LrcRecord.safeParse(raw);
      if (r.success) return toResult(r.data);
    } catch (e) {
      if (!(e instanceof SourceError && e.isNotFound)) throw e;
    }
    // Fuzzy fallback: search, prefer synced lyrics with a close duration.
    const list = await fetchJson<unknown>(
      `${LRCLIB_API}/search?${qs({ track_name: q.title, artist_name: q.artist })}`,
      opts,
    );
    const records = (Array.isArray(list) ? list : [])
      .map((x) => LrcRecord.safeParse(x))
      .filter((r) => r.success)
      .map((r) => r.data);
    if (!records.length) return { status: 'none' };
    const score = (r: z.infer<typeof LrcRecord>) =>
      (r.syncedLyrics ? 2 : 0) +
      (q.durationSec && r.duration
        ? Math.abs(r.duration - q.durationSec) <= 3
          ? 2
          : Math.abs(r.duration - q.durationSec) <= 10
            ? 1
            : -1
        : 0);
    records.sort((a, b) => score(b) - score(a));
    return toResult(records[0] as z.infer<typeof LrcRecord>);
  }
}
