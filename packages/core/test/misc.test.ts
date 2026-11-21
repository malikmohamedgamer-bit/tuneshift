import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_THEMES,
  ShareCodeError,
  ThemeSchema,
  activeLineIndex,
  base64UrlToBytes,
  bytesToBase64Url,
  coalesceQueue,
  contrastPairs,
  contrastRatio,
  decodeShareCode,
  encodeShareCode,
  ensureContrast,
  extractCode,
  formatDuration,
  generateShortCode,
  greeting,
  isShortCode,
  lyricsClock,
  makeBackup,
  parseBackup,
  parseLrc,
  planMerge,
  presetSettings,
  realTimeRemaining,
  resolveConflict,
  seededRng,
  themeToCssVars,
  utf8Decode,
  utf8Encode,
  wallClockMsUntil,
} from '../src';

describe('LRC parsing', () => {
  const lrc = `[ti:Demo]
[ar:Tuneshift]
[offset:+250]
[00:01.00]First line
[00:05.50][00:20.25]Chorus <00:05.60>with <00:05.80>words
[00:10.123]Third
not a timed line`;

  it('parses metadata, multi-stamp lines, fractions and offset', () => {
    const p = parseLrc(lrc);
    expect(p.synced).toBe(true);
    expect(p.meta).toMatchObject({ ti: 'Demo', ar: 'Tuneshift', offset: '+250' });
    expect(p.lines.map((l) => l.timeMs)).toEqual([750, 5250, 9873, 20000]);
    expect(p.lines[1]!.text).toBe('Chorus with words');
    expect(p.plain).toContain('not a timed line');
  });

  it('plain text is unsynced', () => {
    const p = parseLrc('just\nplain\nlyrics');
    expect(p.synced).toBe(false);
    expect(p.plain).toBe('just\nplain\nlyrics');
  });

  it('finds the active line and scales timing with playback speed', () => {
    const { lines } = parseLrc(lrc);
    expect(activeLineIndex(lines, 0)).toBe(-1);
    expect(activeLineIndex(lines, 6000)).toBe(1);
    expect(activeLineIndex(lines, 99999)).toBe(3);
    // Song time advances 1.25× faster than wall-clock at 1.25× speed.
    expect(wallClockMsUntil(10_000, 5_000, 1.25)).toBe(4000);
    expect(wallClockMsUntil(10_000, 5_000, 0.8)).toBe(6250);
    expect(lyricsClock(12.5, -500)).toBe(12000);
    expect(realTimeRemaining(200, 100, 1.25)).toBe(80);
  });
});

describe('share codes', () => {
  it('round-trips a sound, theme and playlist', () => {
    const sound = {
      kind: 'sound' as const,
      data: { name: 'Car mix', settings: presetSettings('club') },
    };
    const code = encodeShareCode(sound);
    expect(code.startsWith('ts1.s.')).toBe(true);
    expect(decodeShareCode(code)).toEqual(sound);
    expect(decodeShareCode(`https://x.github.io/tuneshift/s/${code}`)).toEqual(sound);

    const theme = { ...BUILT_IN_THEMES[3]!, builtIn: false, id: 'mine', name: 'Mine' };
    expect(decodeShareCode(encodeShareCode({ kind: 'theme', data: theme }))).toEqual({
      kind: 'theme',
      data: theme,
    });

    const playlist = {
      kind: 'playlist' as const,
      data: {
        name: 'Gym',
        tracks: [
          {
            key: 'audius:1',
            source: 'audius' as const,
            id: '1',
            title: 'Héllo ✨',
            artist: 'A',
            durationSec: 100,
          },
        ],
      },
    };
    expect(decodeShareCode(encodeShareCode(playlist))).toEqual(playlist);
  });

  it('rejects damaged or foreign codes', () => {
    const code = encodeShareCode({
      kind: 'sound',
      data: { name: 'X', settings: presetSettings('normal') },
    });
    const broken = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13);
    expect(() => decodeShareCode(broken)).toThrow(ShareCodeError);
    expect(() => decodeShareCode('hello')).toThrow(ShareCodeError);
    expect(() => decodeShareCode('ts1.z.abc.0000')).toThrow(ShareCodeError);
  });

  it('short codes avoid ambiguous characters', () => {
    const c = generateShortCode(8, seededRng(5));
    expect(c).toHaveLength(8);
    expect(c).not.toMatch(/[01ilo]/);
    expect(isShortCode(c)).toBe(true);
    expect(isShortCode('ts1.s.x.y')).toBe(false);
    expect(extractCode('see ?code=abc234')).toBe('abc234');
  });

  it('base64url + utf8 helpers round-trip', () => {
    const s = 'Tuneshift 🎧 — ñ';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    for (const n of [0, 1, 2, 3, 4, 5, 100]) {
      const b = Uint8Array.from({ length: n }, (_, i) => (i * 37) & 255);
      expect([...base64UrlToBytes(bytesToBase64Url(b))]).toEqual([...b]);
    }
  });
});

describe('sync conflict resolution', () => {
  it('last write wins; ties go to remote', () => {
    expect(resolveConflict({ id: 'a', updatedAt: 2 }, { id: 'a', updatedAt: 1 }).winner).toBe(
      'local',
    );
    expect(resolveConflict({ id: 'a', updatedAt: 1 }, { id: 'a', updatedAt: 2 }).winner).toBe(
      'remote',
    );
    expect(resolveConflict({ id: 'a', updatedAt: 5 }, { id: 'a', updatedAt: 5 }).winner).toBe(
      'remote',
    );
    expect(resolveConflict(undefined, undefined).winner).toBe('none');
  });

  it('plans a two-way merge including tombstones', () => {
    const locals: { id: string; updatedAt: number; v: string; deleted?: boolean }[] = [
      { id: 'keep-local', updatedAt: 10, v: 'L' },
      { id: 'take-remote', updatedAt: 1, v: 'L' },
      { id: 'local-only', updatedAt: 3, v: 'L' },
      { id: 'same', updatedAt: 4, v: 'S' },
    ];
    const remotes = [
      { id: 'keep-local', updatedAt: 5, v: 'R' },
      { id: 'take-remote', updatedAt: 9, v: 'R', deleted: true },
      { id: 'remote-only', updatedAt: 2, v: 'R' },
      { id: 'same', updatedAt: 4, v: 'S' },
    ];
    const plan = planMerge(locals, remotes);
    expect(plan.push.map((r) => r.id).sort()).toEqual(['keep-local', 'local-only']);
    expect(plan.applyLocal.map((r) => r.id).sort()).toEqual(['remote-only', 'take-remote']);
    expect(plan.applyLocal.find((r) => r.id === 'take-remote')?.deleted).toBe(true);
  });

  it('coalesces the sync queue to the latest op per record', () => {
    const out = coalesceQueue([
      { table: 'likes', id: '1', op: 'upsert', updatedAt: 1 },
      { table: 'likes', id: '2', op: 'upsert', updatedAt: 2 },
      { table: 'likes', id: '1', op: 'delete', updatedAt: 3 },
      { table: 'sounds', id: '1', op: 'upsert', updatedAt: 4 },
    ]);
    expect(out).toEqual([
      { table: 'likes', id: '1', op: 'delete', updatedAt: 3 },
      { table: 'likes', id: '2', op: 'upsert', updatedAt: 2 },
      { table: 'sounds', id: '1', op: 'upsert', updatedAt: 4 },
    ]);
  });
});

describe('themes', () => {
  it('ships 12 valid built-in themes', () => {
    expect(BUILT_IN_THEMES).toHaveLength(12);
    for (const t of BUILT_IN_THEMES) expect(ThemeSchema.safeParse(t).success, t.name).toBe(true);
    expect(BUILT_IN_THEMES[0]!.tokens).toMatchObject({
      bg: '#0d0b14',
      accent: '#8b5cf6',
      accent2: '#ec4899',
    });
  });

  it('every built-in theme passes WCAG AA (4.5:1) for its text/background pairs', () => {
    for (const t of BUILT_IN_THEMES) {
      for (const pair of contrastPairs(t)) {
        const r = contrastRatio(pair.fg, pair.bg);
        expect(
          r,
          `${t.name} — ${pair.label}: ${pair.fg} on ${pair.bg} = ${r.toFixed(2)}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('ensureContrast fixes a failing pair and exports CSS vars', () => {
    const fixed = ensureContrast('#777777', '#000000', 7);
    expect(contrastRatio(fixed, '#000000')).toBeGreaterThanOrEqual(7);
    const vars = themeToCssVars(BUILT_IN_THEMES[0]!);
    expect(vars['--bg']).toBe('#0d0b14');
    expect(vars['--gradient-hero']).toBe('linear-gradient(135deg, #8b5cf6, #ec4899)');
    expect(
      contrastRatio(vars['--accent-contrast']!, vars['--accent-fill']!),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

describe('backup + time helpers', () => {
  it('backup round-trips and rejects foreign files', () => {
    const b = makeBackup({ likes: [{ id: 'audius:1', likedAt: 1, updatedAt: 1 }] }, 123);
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.data.likes).toHaveLength(1);
    expect(() => parseBackup('{"app":"other"}')).toThrow();
    expect(() => parseBackup('not json')).toThrow();
  });

  it('formats durations and greetings', () => {
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(greeting(new Date(2026, 0, 1, 9), 'Malik')).toBe('Good morning, Malik');
    expect(greeting(new Date(2026, 0, 1, 15))).toBe('Good afternoon');
    expect(greeting(new Date(2026, 0, 1, 22))).toBe('Good evening');
  });
});
