import {
  emptySearchPage,
  trackKey,
  type Artist,
  type Collection,
  type SearchPage,
  type Track,
  type TrackLicense,
} from '@tuneshift/core';
import { z } from 'zod';
import { fetchJson, qs, SourceError } from './http';
import type { SearchOptions, SourceAdapter, TrendingOptions } from './types';

export const JAMENDO_API = 'https://api.jamendo.com/v3.0';

const Headers = z.object({
  status: z.string(),
  code: z.number().optional(),
  error_message: z.string().optional(),
  results_count: z.number().optional(),
});

const TrackSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.coerce.number(),
  artist_id: z.string().optional(),
  artist_name: z.string(),
  album_name: z.string().optional(),
  album_id: z.string().optional(),
  album_image: z.string().optional(),
  image: z.string().optional(),
  audio: z.string().optional(),
  shareurl: z.string().optional(),
  license_ccurl: z.string().optional(),
  releasedate: z.string().optional(),
  musicinfo: z
    .object({
      tags: z
        .object({ genres: z.array(z.string()).optional(), vartags: z.array(z.string()).optional() })
        .partial(),
    })
    .partial()
    .optional(),
  audiodownload_allowed: z.boolean().optional(),
});

const ArtistSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string().optional(),
  shareurl: z.string().optional(),
  website: z.string().optional(),
});

const AlbumSchema = z.object({
  id: z.string(),
  name: z.string(),
  artist_name: z.string().optional(),
  artist_id: z.string().optional(),
  image: z.string().optional(),
  shareurl: z.string().optional(),
});

const PlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  user_name: z.string().optional(),
  shareurl: z.string().optional(),
});

/** "http://creativecommons.org/licenses/by-nc-sa/3.0/" → "CC BY-NC-SA 3.0". */
export function licenseFromUrl(url?: string): TrackLicense | undefined {
  if (!url) return undefined;
  const m = /licenses\/([a-z-]+)\/([\d.]+)/i.exec(url);
  const name = m ? `CC ${(m[1] as string).toUpperCase()} ${m[2]}` : 'Creative Commons';
  return { name, url: url.replace(/^http:/, 'https:') };
}

export function parseJamendoTrack(raw: unknown): Track | null {
  const r = TrackSchema.safeParse(raw);
  if (!r.success) return null;
  const t = r.data;
  if (!t.audio) return null;
  const img = t.image || t.album_image;
  const big = (u?: string) => (u ? u.replace(/width=\d+/, 'width=600') : undefined);
  return {
    key: trackKey('jamendo', t.id),
    source: 'jamendo',
    id: t.id,
    title: t.name,
    artist: t.artist_name,
    artistId: t.artist_id,
    album: t.album_name || undefined,
    albumId: t.album_id || undefined,
    durationSec: t.duration,
    artwork: img ? { small: img, medium: big(img), large: big(img) } : undefined,
    genre: t.musicinfo?.tags?.genres?.[0],
    tags: [...(t.musicinfo?.tags?.genres ?? []), ...(t.musicinfo?.tags?.vartags ?? [])],
    permalink: t.shareurl,
    license: licenseFromUrl(t.license_ccurl),
    releaseDate: t.releasedate,
  };
}

interface Envelope {
  headers?: unknown;
  results?: unknown[];
}

export interface JamendoOptions {
  clientId: () => string | undefined;
  fetchImpl?: typeof fetch;
}

/** Jamendo API v3.0 — Creative Commons catalog, non-commercial use, needs a client_id. */
export class JamendoAdapter implements SourceAdapter {
  readonly id = 'jamendo' as const;
  readonly displayName = 'Jamendo';
  readonly capabilities = { fullEffects: true, tapeSpeed: true, export: false, shareable: true };

  constructor(private readonly opts: JamendoOptions) {}

  get hasKey(): boolean {
    return Boolean(this.opts.clientId());
  }

  private async get(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<unknown[]> {
    const clientId = this.opts.clientId();
    if (!clientId)
      throw new SourceError(
        'Add a Jamendo client ID in Settings to enable Jamendo',
        401,
        'Jamendo',
      );
    const env = await fetchJson<Envelope>(
      `${JAMENDO_API}${path}?${qs({ client_id: clientId, format: 'json', ...params })}`,
      { source: 'Jamendo', fetchImpl: this.opts.fetchImpl, retryOn429: true },
    );
    const h = Headers.safeParse(env.headers);
    if (h.success && h.data.status !== 'success') {
      throw new SourceError(
        h.data.error_message || 'Jamendo request failed',
        h.data.code === 5 ? 401 : 400,
        'Jamendo',
      );
    }
    return Array.isArray(env.results) ? env.results : [];
  }

  private trackParams = { include: 'musicinfo licenses', audioformat: 'mp32', imagesize: 300 };

  async search(q: string, opts: SearchOptions): Promise<SearchPage> {
    const page = emptySearchPage();
    const query = q.trim();
    if (!query) return page;
    const base = { limit: opts.limit, offset: opts.offset };
    if (opts.type === 'track') {
      const res = await this.get('/tracks/', { ...base, ...this.trackParams, search: query });
      page.tracks = res.map(parseJamendoTrack).filter((t): t is Track => t !== null);
      page.hasMore = res.length >= opts.limit;
    } else if (opts.type === 'artist') {
      const res = await this.get('/artists/', { ...base, namesearch: query });
      page.artists = res
        .map((x) => ArtistSchema.safeParse(x))
        .filter((r) => r.success)
        .map((r) => toArtist(r.data));
      page.hasMore = res.length >= opts.limit;
    } else if (opts.type === 'album') {
      const res = await this.get('/albums/', { ...base, namesearch: query, imagesize: 300 });
      page.collections = res
        .map((x) => AlbumSchema.safeParse(x))
        .filter((r) => r.success)
        .map((r) => toAlbum(r.data, []));
      page.hasMore = res.length >= opts.limit;
    } else {
      const res = await this.get('/playlists/', { ...base, namesearch: query });
      page.collections = res
        .map((x) => PlaylistSchema.safeParse(x))
        .filter((r) => r.success)
        .map((r) => ({
          key: `jamendo:pl:${r.data.id}`,
          source: 'jamendo' as const,
          id: `pl:${r.data.id}`,
          kind: 'playlist' as const,
          title: r.data.name,
          owner: r.data.user_name,
          tracks: [],
          permalink: r.data.shareurl,
        }));
      page.hasMore = res.length >= opts.limit;
    }
    return page;
  }

  async getTrack(id: string): Promise<Track> {
    const res = await this.get('/tracks/', { ...this.trackParams, id });
    const t = res.map(parseJamendoTrack).find((x) => x !== null);
    if (!t) throw new SourceError('This Jamendo track is unavailable', 404, 'Jamendo');
    return t;
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    // Stream URLs embed the client_id; ask for a fresh one on every play.
    const res = await this.get('/tracks/', { id: track.id, audioformat: 'mp32' });
    const audio = (res[0] as { audio?: string } | undefined)?.audio;
    if (!audio) throw new SourceError('Jamendo has no stream for this track', 404, 'Jamendo');
    return audio;
  }

  /** Jamendo "featured"/popular tracks; `genre` maps to a tag. */
  async trending(opts: TrendingOptions = {}): Promise<Track[]> {
    const order =
      opts.time === 'allTime'
        ? 'popularity_total'
        : opts.time === 'month'
          ? 'popularity_month'
          : 'popularity_week';
    const res = await this.get('/tracks/', {
      ...this.trackParams,
      order,
      limit: opts.limit ?? 30,
      tags: opts.genre?.toLowerCase(),
    });
    return res.map(parseJamendoTrack).filter((t): t is Track => t !== null);
  }

  async byTags(tags: string, limit = 30): Promise<Track[]> {
    const res = await this.get('/tracks/', {
      ...this.trackParams,
      tags,
      limit,
      order: 'popularity_month',
    });
    return res.map(parseJamendoTrack).filter((t): t is Track => t !== null);
  }

  async getArtist(id: string): Promise<Artist> {
    const [a, t] = await Promise.all([
      this.get('/artists/', { id }),
      this.get('/tracks/', {
        ...this.trackParams,
        artist_id: id,
        limit: 50,
        order: 'popularity_total',
      }),
    ]);
    const parsed = ArtistSchema.safeParse(a[0]);
    if (!parsed.success) throw new SourceError('Artist not found', 404, 'Jamendo');
    const artist = toArtist(parsed.data);
    artist.tracks = t.map(parseJamendoTrack).filter((x): x is Track => x !== null);
    return artist;
  }

  async getAlbumOrPlaylist(id: string): Promise<Collection> {
    if (id.startsWith('pl:')) {
      const plId = id.slice(3);
      const res = await this.get('/playlists/tracks/', {
        id: plId,
        audioformat: 'mp32',
        imagesize: 300,
      });
      const pl = res[0] as { name?: string; user_name?: string; tracks?: unknown[] } | undefined;
      if (!pl) throw new SourceError('Playlist not found', 404, 'Jamendo');
      const tracks = (pl.tracks ?? [])
        .map((x) =>
          parseJamendoTrack({
            ...(x as object),
            artist_name: (x as { artist_name?: string }).artist_name ?? '',
          }),
        )
        .filter((t): t is Track => t !== null);
      return {
        key: `jamendo:${id}`,
        source: 'jamendo',
        id,
        kind: 'playlist',
        title: pl.name ?? 'Playlist',
        owner: pl.user_name,
        tracks,
      };
    }
    const [a, t] = await Promise.all([
      this.get('/albums/', { id, imagesize: 600 }),
      this.get('/tracks/', {
        ...this.trackParams,
        album_id: id,
        limit: 100,
        order: 'track_position',
      }),
    ]);
    const parsed = AlbumSchema.safeParse(a[0]);
    if (!parsed.success) throw new SourceError('Album not found', 404, 'Jamendo');
    return toAlbum(
      parsed.data,
      t.map(parseJamendoTrack).filter((x): x is Track => x !== null),
    );
  }

  async validateKey(clientId: string): Promise<boolean> {
    try {
      const env = await fetchJson<Envelope>(
        `${JAMENDO_API}/tracks/?${qs({ client_id: clientId, format: 'json', limit: 1 })}`,
        {
          source: 'Jamendo',
          fetchImpl: this.opts.fetchImpl,
        },
      );
      const h = Headers.safeParse(env.headers);
      return h.success && h.data.status === 'success';
    } catch {
      return false;
    }
  }
}

function toArtist(a: z.infer<typeof ArtistSchema>): Artist {
  return {
    key: `jamendo:${a.id}`,
    source: 'jamendo',
    id: a.id,
    name: a.name,
    artwork: a.image ? { small: a.image, medium: a.image, large: a.image } : undefined,
    permalink: a.shareurl,
  };
}

function toAlbum(a: z.infer<typeof AlbumSchema>, tracks: Track[]): Collection {
  return {
    key: `jamendo:${a.id}`,
    source: 'jamendo',
    id: a.id,
    kind: 'album',
    title: a.name,
    owner: a.artist_name,
    ownerId: a.artist_id,
    artwork: a.image ? { small: a.image, medium: a.image, large: a.image } : undefined,
    tracks,
    trackCount: tracks.length || undefined,
    permalink: a.shareurl,
  };
}
