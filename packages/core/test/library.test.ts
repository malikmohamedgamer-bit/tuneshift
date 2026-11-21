import { describe, expect, it } from 'vitest';
import {
  bestMatch,
  computeStats,
  duplicateKey,
  findDuplicates,
  isDuplicate,
  evaluateSmartPlaylist,
  normalizeForMatch,
  parseCsv,
  parseImportCsv,
  parseImportText,
  parseTrackLines,
  similarity,
  type HistoryEntry,
  type RuleGroup,
  type Track,
  type TrackStats,
} from '../src';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 12);

function track(id: string, over: Partial<Track> = {}): Track {
  return {
    key: `audius:${id}`,
    source: 'audius',
    id,
    title: `Song ${id}`,
    artist: 'Someone',
    durationSec: 180,
    ...over,
  };
}

describe('smart playlists', () => {
  const lib: Track[] = [
    track('1', { artist: 'Kordhell', genre: 'Phonk', durationSec: 150, addedAt: NOW - 2 * DAY }),
    track('2', { artist: 'Kordhell', genre: 'Phonk', durationSec: 240, addedAt: NOW - 40 * DAY }),
    track('3', { artist: 'Lofi Girl', genre: 'Lo-Fi', durationSec: 120, addedAt: NOW - 1 * DAY }),
    track('4', { source: 'local', key: 'local:4', artist: 'Me', genre: 'EDM', durationSec: 300 }),
  ];
  const stats: Record<string, TrackStats> = {
    'audius:1': { playCount: 12, lastPlayed: NOW - DAY, liked: true, hasSavedSound: false },
    'audius:2': { playCount: 2, lastPlayed: NOW - 20 * DAY, liked: false, hasSavedSound: true },
    'audius:3': { playCount: 0, liked: true, hasSavedSound: false },
    'local:4': { playCount: 5, lastPlayed: NOW - 3 * DAY, liked: false, hasSavedSound: false },
  };
  const st = (k: string) => stats[k]!;

  it('AND: phonk and liked', () => {
    const root: RuleGroup = {
      id: 'r',
      match: 'all',
      rules: [
        { id: 'a', field: 'genre', op: 'is', value: 'phonk' },
        { id: 'b', field: 'liked', op: 'isTrue' },
      ],
    };
    const out = evaluateSmartPlaylist({ root, sort: { field: 'title', dir: 'asc' } }, lib, st, NOW);
    expect(out.map((t) => t.id)).toEqual(['1']);
  });

  it('OR with nested group, numeric and date rules, sort + limit', () => {
    const root: RuleGroup = {
      id: 'r',
      match: 'any',
      rules: [
        { id: 'a', field: 'source', op: 'is', value: 'local' },
        {
          id: 'g',
          match: 'all',
          rules: [
            { id: 'b', field: 'duration', op: 'between', value: 100, value2: 160 },
            { id: 'c', field: 'dateAdded', op: 'inLast', value: 7 },
          ],
        },
      ],
    };
    const out = evaluateSmartPlaylist(
      { root, sort: { field: 'playCount', dir: 'desc' }, limit: 2 },
      lib,
      st,
      NOW,
    );
    expect(out.map((t) => t.id)).toEqual(['1', '4']);
  });

  it('play count, last played, saved sound and text ops', () => {
    const run = (rules: RuleGroup['rules']) =>
      evaluateSmartPlaylist(
        { root: { id: 'r', match: 'all', rules }, sort: { field: 'title', dir: 'asc' } },
        lib,
        st,
        NOW,
      ).map((t) => t.id);
    expect(run([{ id: '1', field: 'playCount', op: 'gt', value: 4 }])).toEqual(['1', '4']);
    expect(run([{ id: '1', field: 'lastPlayed', op: 'notInLast', value: 7 }])).toEqual(['2', '3']);
    expect(run([{ id: '1', field: 'hasSavedSound', op: 'isTrue' }])).toEqual(['2']);
    expect(run([{ id: '1', field: 'artist', op: 'contains', value: 'kord' }])).toEqual(['1', '2']);
    expect(run([{ id: '1', field: 'artist', op: 'notContains', value: 'kord' }])).toEqual([
      '3',
      '4',
    ]);
  });

  it('empty group matches everything; random sort is stable per seed', () => {
    const def = {
      root: { id: 'r', match: 'all' as const, rules: [] },
      sort: { field: 'random' as const, dir: 'asc' as const },
    };
    const a = evaluateSmartPlaylist(def, lib, st, NOW, 42);
    const b = evaluateSmartPlaylist(def, lib, st, NOW, 42);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(a).toHaveLength(4);
  });
});

describe('fuzzy matching + import parsing', () => {
  it('normalizes noise, accents and features', () => {
    expect(normalizeForMatch('Beyoncé – Halo (Official Video) feat. X')).toBe('beyonce halo');
    expect(normalizeForMatch('Rock & Roll')).toBe('rock and roll');
  });

  it('similarity tolerates extra words', () => {
    expect(similarity('Metamorphosis', 'METAMORPHOSIS')).toBe(1);
    expect(similarity('Murder In My Mind', 'Murder in my Mind (Sped Up)')).toBeGreaterThan(0.8);
    expect(similarity('Hello', 'Goodbye')).toBeLessThan(0.5);
  });

  it('bestMatch uses title + artist + duration tolerance', () => {
    const candidates = [
      track('a', { title: 'Close Eyes', artist: 'DVRST', durationSec: 132 }),
      track('b', { title: 'Close Eyes (Slowed)', artist: 'someone else', durationSec: 190 }),
      track('c', { title: 'Open Eyes', artist: 'DVRST', durationSec: 130 }),
    ];
    const m = bestMatch({ title: 'Close Eyes', artist: 'DVRST', durationSec: 133 }, candidates);
    expect(m?.track.id).toBe('a');
    expect(bestMatch({ title: 'Totally Different', artist: 'Nobody' }, candidates)).toBeNull();
  });

  it('parses pasted lines in several formats', () => {
    const rows = parseTrackLines(
      '1. DVRST – Close Eyes\nKordhell - Murder In My Mind\nSahara by Hensonn\n\n• Lone Title',
    );
    expect(rows).toEqual([
      { artist: 'DVRST', title: 'Close Eyes' },
      { artist: 'Kordhell', title: 'Murder In My Mind' },
      { title: 'Sahara', artist: 'Hensonn' },
      { title: 'Lone Title', artist: '' },
    ]);
  });

  it('parses RFC 4180 CSV with quotes', () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('parses an Exportify CSV', () => {
    const csv =
      '"Track URI","Track Name","Artist Name(s)","Album Name","Duration (ms)"\n' +
      '"spotify:track:1","Close Eyes","DVRST","Close Eyes","132000"\n' +
      '"spotify:track:2","Shadow","A;B","Shadow","95500"\n';
    expect(parseImportCsv(csv)).toEqual([
      { title: 'Close Eyes', artist: 'DVRST', durationSec: 132, album: 'Close Eyes' },
      { title: 'Shadow', artist: 'A', durationSec: 96, album: 'Shadow' },
    ]);
    expect(parseImportText(csv)).toHaveLength(2);
    expect(parseImportText('X - Y')).toEqual([{ artist: 'X', title: 'Y' }]);
  });

  it('duplicate detection ignores case and tiny duration differences', () => {
    expect(duplicateKey({ title: 'Song', artist: 'A' })).toBe(
      duplicateKey({ title: 'song ', artist: 'a' }),
    );
    const lib = [
      { id: 1, title: 'Song', artist: 'A', durationSec: 180 },
      { id: 2, title: 'song', artist: 'a', durationSec: 181 },
      { id: 3, title: 'Song', artist: 'A', durationSec: 240 },
      { id: 4, title: 'Other', artist: 'A', durationSec: 180 },
    ];
    expect(isDuplicate(lib[0]!, lib[1]!)).toBe(true);
    expect(isDuplicate(lib[0]!, lib[2]!)).toBe(false);
    expect(findDuplicates(lib).map((g) => g.map((t) => t.id))).toEqual([[1, 2]]);
  });
});

describe('stats', () => {
  const h = (i: number, over: Partial<HistoryEntry>): HistoryEntry => ({
    id: `h${i}`,
    trackKey: 'audius:1',
    source: 'audius',
    title: 'One',
    artist: 'A',
    playedAt: NOW - DAY,
    msListened: 120_000,
    updatedAt: NOW,
    ...over,
  });
  const history = [
    h(1, { presetName: 'Nightcore', genre: 'Phonk' }),
    h(2, { presetName: 'Nightcore', genre: 'Phonk' }),
    h(3, { trackKey: 'audius:2', title: 'Two', artist: 'B', genre: 'EDM', presetName: 'Normal' }),
    h(4, { msListened: 5_000 }), // too short to count as a play
    h(5, { playedAt: NOW - 60 * DAY, trackKey: 'audius:3', title: 'Old', artist: 'C' }),
  ];

  it('ranks tracks, artists, genres and presets for a period', () => {
    const s = computeStats(history, 'week', NOW);
    expect(s.plays).toBe(3);
    expect(s.minutes).toBe(6);
    expect(s.topTracks[0]).toMatchObject({ key: 'audius:1', plays: 2 });
    expect(s.topArtists[0]!.label).toBe('A');
    expect(s.topGenres.map((g) => g.label)).toEqual(['Phonk', 'EDM']);
    expect(s.mostUsedPreset?.label).toBe('Nightcore');
    expect(s.clock).toHaveLength(7);
    expect(s.clock.flat().reduce((a, b) => a + b, 0)).toBeCloseTo(6 + 5 / 60, 3);
    expect(computeStats(history, 'all', NOW).plays).toBe(4);
  });
});
