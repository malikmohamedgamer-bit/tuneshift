import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { Track } from '@tuneshift/core';
import {
  AudiusAdapter,
  JamendoAdapter,
  LocalAdapter,
  LrclibClient,
  SourceRegistry,
  rankTracks,
  baseTitle,
  findVersions,
  isAudioFileName,
  licenseFromUrl,
  loadCollection,
  metadataFromFileName,
  parseAudiusTrack,
  COLLECTIONS,
  LRCLIB_API,
  type LyricsResult,
} from '../src';
import { handlers, audiusTracks } from '../src/mocks';

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('Audius adapter', () => {
  const audius = new AudiusAdapter();

  it('parses tracks, skips gated ones, builds attribution links', async () => {
    const page = await audius.search('night premium', { type: 'track', limit: 20, offset: 0 });
    expect(page.tracks.map((t) => t.id)).toEqual(['Trk001', 'Trk002', 'Trk003']);
    const t = page.tracks[0] as Track;
    expect(t).toMatchObject({
      key: 'audius:Trk001',
      source: 'audius',
      title: 'Night Runner',
      artist: 'Lumen',
      durationSec: 184,
      permalink: 'https://audius.co/lumen/night-runner',
      tags: ['synthwave', 'night'],
    });
    expect(t.artwork?.medium).toContain('480x480');
    expect(parseAudiusTrack(audiusTracks[4])).toBeNull();
    expect(parseAudiusTrack({ nope: true })).toBeNull();
  });

  it('streams through the re-signing API endpoint with app_name, or api_key when set', async () => {
    const t = (await audius.getTrack('Trk001')) as Track;
    expect(await audius.resolveStreamUrl(t)).toBe(
      'https://api.audius.co/v1/tracks/Trk001/stream?app_name=Tuneshift',
    );
    const keyed = new AudiusAdapter({ apiKey: () => 'k123' });
    expect(await keyed.resolveStreamUrl(t)).toContain('api_key=k123');
    expect(await audius.resolveStreamUrl(t, { bust: true })).toMatch(/&_=\d+/);
  });

  it('artists, playlists/albums, trending and 404s', async () => {
    const artists = await audius.search('lumen', { type: 'artist', limit: 10, offset: 0 });
    expect(artists.artists[0]).toMatchObject({
      name: 'Lumen',
      permalink: 'https://audius.co/lumen',
    });
    const albums = await audius.search('runner', { type: 'album', limit: 10, offset: 0 });
    expect(albums.collections.map((c) => c.title)).toEqual(['Runner EP']);
    const pls = await audius.search('night', { type: 'playlist', limit: 10, offset: 0 });
    expect(pls.collections.map((c) => c.kind)).toEqual(['playlist']);
    const pl = await audius.getAlbumOrPlaylist('Pl001');
    expect(pl.tracks).toHaveLength(2);
    expect(pl.owner).toBe('Lumen');
    const artist = await audius.getArtist('Usr01');
    expect(artist.tracks?.length).toBe(2);
    expect((await audius.trending({ time: 'week' })).length).toBe(4);
    await expect(audius.getTrack('missing')).rejects.toMatchObject({ status: 404 });
  });

  it('retries once on 429 with Retry-After', async () => {
    let calls = 0;
    server.use(
      http.get('https://api.audius.co/v1/tracks/trending', () => {
        calls++;
        return calls === 1
          ? new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } })
          : HttpResponse.json({ data: [] });
      }),
    );
    expect(await audius.trending()).toEqual([]);
    expect(calls).toBe(2);
  });
});

describe('Jamendo adapter', () => {
  it('needs a client id and reports a bad one', async () => {
    const none = new JamendoAdapter({ clientId: () => undefined });
    expect(none.hasKey).toBe(false);
    await expect(none.search('x', { type: 'track', limit: 5, offset: 0 })).rejects.toMatchObject({
      status: 401,
    });
    const bad = new JamendoAdapter({ clientId: () => 'wrong' });
    await expect(bad.search('x', { type: 'track', limit: 5, offset: 0 })).rejects.toMatchObject({
      status: 401,
    });
    expect(await bad.validateKey('wrong')).toBe(false);
    expect(await bad.validateKey('goodkey123')).toBe(true);
  });

  it('parses tracks with licence badge and attribution', async () => {
    const j = new JamendoAdapter({ clientId: () => 'goodkey123' });
    const page = await j.search('fields', { type: 'track', limit: 5, offset: 0 });
    expect(page.tracks[0]).toMatchObject({
      key: 'jamendo:1532771',
      title: 'Open Fields',
      artist: 'Commons Band',
      durationSec: 201,
      genre: 'folk',
      permalink: 'https://www.jamendo.com/track/1532771',
      license: {
        name: 'CC BY-NC-SA 3.0',
        url: 'https://creativecommons.org/licenses/by-nc-sa/3.0/',
      },
    });
    expect(await j.resolveStreamUrl(page.tracks[0] as Track)).toContain('trackid=1532771');
    expect(licenseFromUrl(undefined)).toBeUndefined();
  });
});

describe('LRCLIB', () => {
  it('finds synced lyrics and caches them', async () => {
    const store = new Map<string, LyricsResult>();
    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: LyricsResult) => void store.set(k, v),
    };
    const c = new LrclibClient(cache);
    const r = await c.find({ title: 'Night Runner', artist: 'Lumen', durationSec: 184 });
    expect(r.status).toBe('found');
    if (r.status === 'found') {
      expect(r.lyrics.synced).toBe(true);
      expect(r.lyrics.lines[1]).toEqual({ timeMs: 2000, text: 'I keep running through the night' });
    }
    expect(store.size).toBe(1);
    server.use(http.get(`${LRCLIB_API}/get`, () => HttpResponse.error()));
    expect(
      (await c.find({ title: 'Night Runner', artist: 'Lumen', durationSec: 184 })).status,
    ).toBe('found');
  });

  it('falls back to search, returns none on 404, surfaces 429', async () => {
    const c = new LrclibClient();
    expect((await c.find({ title: 'Fuzzy Song', artist: 'Lumen' })).status).toBe('found');
    expect(await c.find({ title: 'Unknown', artist: 'Nobody' })).toEqual({ status: 'none' });
    server.use(
      http.get(
        `${LRCLIB_API}/get`,
        () => new HttpResponse(null, { status: 429, headers: { 'Retry-After': '60' } }),
      ),
    );
    await expect(c.find({ title: 'Rate Limited', artist: 'X' })).rejects.toMatchObject({
      status: 429,
      retryAfterSec: 60,
    });
  });
});

describe('registry + unified search', () => {
  const local = new LocalAdapter({
    getTrack: async () => undefined,
    search: async (q) =>
      q.includes('night')
        ? [
            {
              key: 'local:f1',
              source: 'local',
              id: 'f1',
              title: 'Night Runner (my rip)',
              artist: 'Me',
              durationSec: 180,
            },
          ]
        : [],
    fileUrl: async () => 'blob:x',
  });
  const registry = new SourceRegistry(
    [local, new AudiusAdapter(), new JamendoAdapter({ clientId: () => undefined })],
    (id) => ({
      enabled: true,
      available: id !== 'jamendo',
      reason: id === 'jamendo' ? 'Add a key' : undefined,
    }),
  );

  it('queries every usable source in parallel and groups results', async () => {
    const r = await registry.search('night runner');
    expect(r.tracks.map((t) => t.source)).toContain('local');
    expect(r.tracks.map((t) => t.source)).toContain('audius');
    expect(r.artists.length).toBeGreaterThan(0);
    expect(r.collections.length).toBeGreaterThan(0);
    expect(r.top?.kind).toBe('track');
    expect(r.errors).toEqual([]);
    expect(registry.usable().map((a) => a.id)).toEqual(['local', 'audius']);
  });

  it('a failing source becomes an error, not a crash', async () => {
    server.use(
      http.get('https://api.audius.co/v1/tracks/search', () =>
        HttpResponse.json({}, { status: 500 }),
      ),
    );
    const r = await registry.search('night', { types: ['track'] });
    expect(r.tracks.map((t) => t.source)).toEqual(['local']);
    expect(r.errors[0]?.source).toBe('audius');
  });

  it('runtime CORS results downgrade capabilities', () => {
    expect(registry.capabilities('audius').fullEffects).toBe(true);
    registry.setFullEffects('audius', false);
    expect(registry.capabilities('audius')).toMatchObject({ fullEffects: false, tapeSpeed: true });
    expect(registry.capabilities('local').export).toBe(true);
  });
});

describe('remix finder + collections', () => {
  it('strips version words to a base title', () => {
    expect(baseTitle('Night Runner (Sped Up)')).toBe('Night Runner');
    expect(baseTitle('Night Runner - Slowed + Reverb')).toBe('Night Runner');
    expect(baseTitle('Plain Song')).toBe('Plain Song');
  });

  it('groups versions by type, de-duplicated, excluding the original', async () => {
    const groups = await findVersions(new AudiusAdapter(), {
      key: 'audius:Trk001',
      title: 'Night Runner',
      artist: 'Lumen',
    });
    const byKind = Object.fromEntries(groups.map((g) => [g.kind.id, g.tracks.map((t) => t.id)]));
    expect(byKind['sped-up']).toEqual(['Trk002']);
    expect(byKind.slowed).toEqual(['Trk003']);
    const all = groups.flatMap((g) => g.tracks.map((t) => t.id));
    expect(new Set(all).size).toBe(all.length);
    expect(all).not.toContain('Trk001');
  });

  it('loads a collection from Audius (and skips Jamendo without a key)', async () => {
    expect(COLLECTIONS).toHaveLength(12);
    const tracks = await loadCollection(COLLECTIONS[0]!, new AudiusAdapter(), null, 10);
    expect(tracks.length).toBeGreaterThan(0);
  });
});

describe('local file helpers', () => {
  it('recognises audio files and parses names', () => {
    expect(isAudioFileName('song.FLAC')).toBe(true);
    expect(isAudioFileName('cover.jpg')).toBe(false);
    expect(metadataFromFileName('03 - Drift King - Cowbell Cruise.mp3')).toEqual({
      artist: 'Drift King',
      title: 'Cowbell Cruise',
      trackNo: 3,
    });
    expect(metadataFromFileName('untitled_take_2.wav')).toEqual({
      title: 'untitled take 2',
      artist: 'Unknown artist',
      trackNo: undefined,
    });
  });
});

describe('search ranking', () => {
  const mk = (
    id: string,
    title: string,
    artist: string,
    playCount: number,
    artistVerified?: boolean,
  ): Track => ({
    key: `audius:${id}`,
    source: 'audius',
    id,
    title,
    artist,
    durationSec: 180,
    playCount,
    artistVerified,
  });
  it("puts the artist's own popular songs above fan flips that mention them", () => {
    const ranked = rankTracks('skrillex', [
      mk('1', 'SKRILLEX - XERECA NA VARA (bauti flip)', 'bauti', 8185),
      mk('2', 'skrillex 7', 'um..', 2454),
      mk('3', 'Kliptown Empyrean', 'Skrillex', 1_162_093, true),
      mk('4', 'Skrillex - Kliptown Empyrean (Dabow Flip)', 'Dabow', 5087, true),
    ]);
    expect(ranked[0]?.artist).toBe('Skrillex');
  });
  it('prefers verified, popular uploads for a song title', () => {
    const ranked = rankTracks('kliptown empyrean', [
      mk('1', 'Kliptown Empyrean (cover)', 'someone', 12),
      mk('2', 'Kliptown Empyrean', 'Skrillex', 1_162_093, true),
    ]);
    expect(ranked[0]?.id).toBe('2');
  });
});
