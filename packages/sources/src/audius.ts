import {
  emptySearchPage,
  trackKey,
  type Artist,
  type Artwork,
  type Collection,
  type SearchPage,
  type Track,
} from '@tuneshift/core';
import { z } from 'zod';
import { fetchJson, qs, Semaphore, SourceError } from './http';
import type { SearchOptions, SourceAdapter, TrendingOptions } from './types';

export const AUDIUS_API = 'https://api.audius.co/v1';
export const AUDIUS_WEB = 'https://audius.co';
export const AUDIUS_APP_NAME = 'Tuneshift';

const ArtworkSchema = z
  .object({
    '150x150': z.string().optional(),
    '480x480': z.string().optional(),
    '1000x1000': z.string().optional(),
    mirrors: z.array(z.string()).optional(),
  })
  .partial()
  .nullish();

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  handle: z.string().optional(),
  profile_picture: ArtworkSchema,
  bio: z.string().nullish(),
  follower_count: z.number().optional(),
  is_verified: z.boolean().optional(),
  track_count: z.number().optional(),
});

const TrackSchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  genre: z.string().nullish(),
  mood: z.string().nullish(),
  tags: z.string().nullish(),
  artwork: ArtworkSchema,
  permalink: z.string().nullish(),
  play_count: z.number().nullish(),
  release_date: z.string().nullish(),
  is_streamable: z.boolean().optional(),
  access: z.object({ stream: z.boolean() }).partial().nullish(),
  user: UserSchema,
});

const PlaylistSchema = z.object({
  id: z.string(),
  playlist_name: z.string(),
  description: z.string().nullish(),
  is_album: z.boolean().optional(),
  track_count: z.number().optional(),
  artwork: ArtworkSchema,
  permalink: z.string().nullish(),
  user: z.union([UserSchema, z.string()]).nullish(),
});

type ATrack = z.infer<typeof TrackSchema>;
type AUser = z.infer<typeof UserSchema>;
type APlaylist = z.infer<typeof PlaylistSchema>;

function artwork(a: z.infer<typeof ArtworkSchema>): Artwork | undefined {
  if (!a) return undefined;
  const out: Artwork = { small: a['150x150'], medium: a['480x480'], large: a['1000x1000'] };
  if (a.mirrors?.length) out.mirrors = a.mirrors.slice(0, 3);
  return out.small || out.medium || out.large ? out : undefined;
}

const abs = (p?: string | null) =>
  p ? (p.startsWith('http') ? p : `${AUDIUS_WEB}${p}`) : undefined;

export function parseAudiusTrack(raw: unknown): Track | null {
  const r = TrackSchema.safeParse(raw);
  if (!r.success) return null;
  const t: ATrack = r.data;
  // Gated / non-streamable tracks can't be played through the public API.
  if (t.is_streamable === false || t.access?.stream === false) return null;
  return {
    key: trackKey('audius', t.id),
    source: 'audius',
    id: t.id,
    title: t.title,
    artist: t.user.name,
    artistId: t.user.id,
    artistVerified: t.user.is_verified || undefined,
    durationSec: t.duration,
    artwork: artwork(t.artwork),
    genre: t.genre ?? undefined,
    mood: t.mood ?? undefined,
    tags: t.tags
      ? t.tags
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    permalink: abs(t.permalink),
    playCount: t.play_count ?? undefined,
    releaseDate: t.release_date ?? undefined,
  };
}

export function parseAudiusUser(raw: unknown): Artist | null {
  const r = UserSchema.safeParse(raw);
  if (!r.success) return null;
  const u: AUser = r.data;
  return {
    key: `audius:${u.id}`,
    source: 'audius',
    id: u.id,
    name: u.name,
    artwork: artwork(u.profile_picture),
    bio: u.bio ?? undefined,
    followerCount: u.follower_count,
    trackCount: u.track_count,
    verified: u.is_verified || undefined,
    permalink: u.handle ? `${AUDIUS_WEB}/${u.handle}` : undefined,
  };
}

export function parseAudiusPlaylist(raw: unknown, tracks: Track[] = []): Collection | null {
  const r = PlaylistSchema.safeParse(raw);
  if (!r.success) return null;
  const p: APlaylist = r.data;
  const owner = typeof p.user === 'string' ? p.user : p.user?.name;
  const ownerId = typeof p.user === 'object' && p.user ? p.user.id : undefined;
  return {
    key: `audius:${p.id}`,
    source: 'audius',
    id: p.id,
    kind: p.is_album ? 'album' : 'playlist',
    title: p.playlist_name,
    owner,
    ownerId,
    artwork: artwork(p.artwork),
    description: p.description ?? undefined,
    trackCount: p.track_count,
    tracks,
    permalink: abs(p.permalink),
  };
}

const list = <T>(raw: unknown, parse: (x: unknown) => T | null): T[] => {
  const data = (raw as { data?: unknown })?.data;
  return Array.isArray(data) ? data.map(parse).filter((x): x is T => x !== null) : [];
};

export interface AudiusOptions {
  apiKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
}

/** Audius via its public REST API (key optional — verified 2026-11-21, see DECISIONS.md). */
export class AudiusAdapter implements SourceAdapter {
  readonly id = 'audius' as const;
  readonly displayName = 'Audius';
  readonly capabilities = { fullEffects: true, tapeSpeed: true, export: false, shareable: true };

  /** Audius free tier allows ~10 req/s; keep at most 4 requests in flight. */
  private readonly slots = new Semaphore(4);

  constructor(private readonly opts: AudiusOptions = {}) {}

  private auth(): Record<string, string> {
    const key = this.opts.apiKey?.();
    return key ? { api_key: key } : { app_name: AUDIUS_APP_NAME };
  }

  private get<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    return this.slots.run(() =>
      fetchJson<T>(`${AUDIUS_API}${path}?${qs({ ...params, ...this.auth() })}`, {
        source: 'Audius',
        fetchImpl: this.opts.fetchImpl,
        retryOn429: true,
        signal,
      }),
    );
  }

  async search(q: string, opts: SearchOptions): Promise<SearchPage> {
    const page = emptySearchPage();
    const query = q.trim();
    if (!query) return page;
    const params = { query, limit: opts.limit, offset: opts.offset };
    if (opts.type === 'track') {
      page.tracks = list(await this.get('/tracks/search', params), parseAudiusTrack);
      page.hasMore = page.tracks.length >= opts.limit;
    } else if (opts.type === 'artist') {
      page.artists = list(await this.get('/users/search', params), parseAudiusUser);
      page.hasMore = page.artists.length >= opts.limit;
    } else {
      const all = list(await this.get('/playlists/search', params), (x) => parseAudiusPlaylist(x));
      page.collections = all.filter((c) =>
        opts.type === 'album' ? c.kind === 'album' : c.kind === 'playlist',
      );
      page.hasMore = all.length >= opts.limit;
    }
    return page;
  }

  async getTrack(id: string): Promise<Track> {
    const raw = await this.get<{ data?: unknown }>(`/tracks/${encodeURIComponent(id)}`);
    const t = parseAudiusTrack(raw.data);
    if (!t) throw new SourceError('This Audius track is unavailable', 404, 'Audius');
    return t;
  }

  /** The API stream endpoint re-signs on every request, so it never goes stale. */
  async resolveStreamUrl(track: Track, opts: { bust?: boolean } = {}): Promise<string> {
    const params: Record<string, string> = { ...this.auth() };
    if (opts.bust) params._ = String(Date.now());
    return Promise.resolve(
      `${AUDIUS_API}/tracks/${encodeURIComponent(track.id)}/stream?${qs(params)}`,
    );
  }

  async trending(opts: TrendingOptions = {}): Promise<Track[]> {
    const raw = await this.get('/tracks/trending', {
      time: opts.time ?? 'week',
      genre: opts.genre,
      limit: opts.limit,
    });
    const tracks = list(raw, parseAudiusTrack);
    return opts.limit ? tracks.slice(0, opts.limit) : tracks;
  }

  async getArtist(id: string): Promise<Artist> {
    const [u, t] = await Promise.all([
      this.get<{ data?: unknown }>(`/users/${encodeURIComponent(id)}`),
      this.get(`/users/${encodeURIComponent(id)}/tracks`, { limit: 50, sort: 'plays' }),
    ]);
    const artist = parseAudiusUser(u.data);
    if (!artist) throw new SourceError('Artist not found', 404, 'Audius');
    artist.tracks = list(t, parseAudiusTrack);
    return artist;
  }

  async getAlbumOrPlaylist(id: string): Promise<Collection> {
    const [p, t] = await Promise.all([
      this.get<{ data?: unknown }>(`/playlists/${encodeURIComponent(id)}`),
      this.get(`/playlists/${encodeURIComponent(id)}/tracks`),
    ]);
    const first = Array.isArray(p.data) ? p.data[0] : p.data;
    const c = parseAudiusPlaylist(first, list(t, parseAudiusTrack));
    if (!c) throw new SourceError('Playlist not found', 404, 'Audius');
    return c;
  }

  /** Validate a pasted API key with a cheap request (Settings → Sources → API keys). */
  async validateKey(key: string): Promise<boolean> {
    try {
      await fetchJson(`${AUDIUS_API}/tracks/trending?${qs({ api_key: key, limit: 1 })}`, {
        source: 'Audius',
        fetchImpl: this.opts.fetchImpl,
      });
      return true;
    } catch {
      return false;
    }
  }
}

export const AUDIUS_GENRES = [
  'Electronic',
  'Hip-Hop/Rap',
  'Lo-Fi',
  'R&B/Soul',
  'Pop',
  'Alternative',
  'Rock',
  'Trap',
  'House',
  'Techno',
  'Dubstep',
  'Drum & Bass',
  'Future Bass',
  'Ambient',
  'Jazz',
  'Latin',
  'Hyperpop',
  'Vaporwave',
  'Acoustic',
  'Experimental',
] as const;

export const AUDIUS_MOODS = [
  'Energizing',
  'Aggressive',
  'Upbeat',
  'Peaceful',
  'Romantic',
  'Melancholy',
  'Cool',
  'Fiery',
  'Easygoing',
  'Yearning',
] as const;
