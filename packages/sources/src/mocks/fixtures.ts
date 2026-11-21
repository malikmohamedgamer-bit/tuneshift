/**
 * Realistic API fixtures (shapes copied from live responses on 2026-11-21, values invented).
 * Used by unit tests (MSW) and the Playwright E2E route mocks.
 */

const art = (seed: string) => ({
  '150x150': `https://audius.test/content/${seed}/150x150.jpg`,
  '480x480': `https://audius.test/content/${seed}/480x480.jpg`,
  '1000x1000': `https://audius.test/content/${seed}/1000x1000.jpg`,
});

const user = (id: string, name: string, handle: string) => ({
  id,
  name,
  handle,
  profile_picture: art(`u-${id}`),
  bio: `${name} makes music.`,
  follower_count: 1200,
  track_count: 24,
});

export const audiusTracks = [
  {
    id: 'Trk001',
    title: 'Night Runner',
    duration: 184,
    genre: 'Electronic',
    mood: 'Energizing',
    tags: 'synthwave,night',
    artwork: art('t1'),
    permalink: '/lumen/night-runner',
    play_count: 50123,
    release_date: '2025-05-01T00:00:00Z',
    is_streamable: true,
    access: { stream: true, download: false },
    user: user('Usr01', 'Lumen', 'lumen'),
  },
  {
    id: 'Trk002',
    title: 'Night Runner (Sped Up)',
    duration: 147,
    genre: 'Electronic',
    mood: 'Energizing',
    tags: 'sped up',
    artwork: art('t2'),
    permalink: '/edits/night-runner-sped-up',
    play_count: 9000,
    is_streamable: true,
    access: { stream: true },
    user: user('Usr02', 'Edit Lab', 'editlab'),
  },
  {
    id: 'Trk003',
    title: 'Night Runner - Slowed + Reverb',
    duration: 230,
    genre: 'Lo-Fi',
    mood: 'Peaceful',
    tags: null,
    artwork: art('t3'),
    permalink: '/edits/night-runner-slowed',
    play_count: 4000,
    is_streamable: true,
    access: { stream: true },
    user: user('Usr02', 'Edit Lab', 'editlab'),
  },
  {
    id: 'Trk004',
    title: 'Cowbell Cruise',
    duration: 132,
    genre: 'Hip-Hop/Rap',
    mood: 'Aggressive',
    tags: 'phonk',
    artwork: null,
    permalink: '/drift/cowbell-cruise',
    play_count: 70000,
    is_streamable: true,
    access: { stream: true },
    user: user('Usr03', 'Drift King', 'driftking'),
  },
  {
    id: 'Gated01',
    title: 'Premium Only',
    duration: 200,
    genre: 'Pop',
    artwork: null,
    permalink: '/x/premium',
    is_streamable: true,
    access: { stream: false },
    user: user('Usr04', 'Gate', 'gate'),
  },
];

export const audiusUsers = [
  user('Usr01', 'Lumen', 'lumen'),
  user('Usr03', 'Drift King', 'driftking'),
];

export const audiusPlaylists = [
  {
    id: 'Pl001',
    playlist_name: 'Night Drives',
    description: 'For the road',
    is_album: false,
    track_count: 2,
    artwork: art('p1'),
    permalink: '/lumen/playlist/night-drives',
    user: user('Usr01', 'Lumen', 'lumen'),
  },
  {
    id: 'Alb001',
    playlist_name: 'Runner EP',
    is_album: true,
    track_count: 3,
    artwork: art('a1'),
    permalink: '/lumen/album/runner-ep',
    user: user('Usr01', 'Lumen', 'lumen'),
  },
];

export const jamendoTracks = [
  {
    id: '1532771',
    name: 'Open Fields',
    duration: '201',
    artist_id: '7890',
    artist_name: 'Commons Band',
    album_name: 'Meadow',
    album_id: '555',
    album_image: 'https://usercontent.jamendo.test/?type=album&id=555&width=300',
    image: 'https://usercontent.jamendo.test/?type=album&id=555&width=300',
    audio: 'https://prod-1.storage.jamendo.test/?trackid=1532771&format=mp31',
    shareurl: 'https://www.jamendo.com/track/1532771',
    license_ccurl: 'http://creativecommons.org/licenses/by-nc-sa/3.0/',
    releasedate: '2019-02-02',
    musicinfo: { tags: { genres: ['folk', 'acoustic'], vartags: ['calm'] } },
  },
];

export const lrclibRecord = {
  id: 4242,
  trackName: 'Night Runner',
  artistName: 'Lumen',
  albumName: 'Runner EP',
  duration: 184,
  instrumental: false,
  plainLyrics: 'City lights are calling\nI keep running through the night\nNever looking back',
  syncedLyrics:
    '[00:00.50]City lights are calling\n[00:02.00]I keep running through the night\n[00:03.50]Never looking back\n[00:05.00]Into the neon light',
};

export const envelope = <T>(data: T) => ({ data });
export const jamendoEnvelope = (results: unknown[]) => ({
  headers: {
    status: 'success',
    code: 0,
    error_message: '',
    warnings: '',
    results_count: results.length,
  },
  results,
});
export const jamendoBadKey = {
  headers: {
    status: 'failed',
    code: 5,
    error_message: 'Jamendo Api Invalid Client Id Error',
    results_count: 0,
  },
  results: [],
};
