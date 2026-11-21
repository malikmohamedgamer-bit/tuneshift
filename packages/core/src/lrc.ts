export interface LyricLine {
  /** Song time in ms (offset tag already applied). */
  timeMs: number;
  text: string;
}

export interface ParsedLyrics {
  synced: boolean;
  lines: LyricLine[];
  /** Plain text (all lines without timestamps). */
  plain: string;
  meta: Record<string, string>;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const META_TAG = /^\[([a-z#]+):(.*)\]$/i;
const WORD_TAG = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function fracToMs(frac: string | undefined): number {
  if (!frac) return 0;
  if (frac.length === 1) return Number(frac) * 100;
  if (frac.length === 2) return Number(frac) * 10;
  return Number(frac.slice(0, 3));
}

/**
 * Parse LRC (multiple timestamps per line, mm:ss / mm:ss.xx / mm:ss.xxx, [offset:±ms],
 * enhanced word tags stripped). Text without timestamps is returned as plain lyrics.
 */
export function parseLrc(text: string): ParsedLyrics {
  const meta: Record<string, string> = {};
  const lines: LyricLine[] = [];
  const plainLines: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) {
      plainLines.push('');
      continue;
    }
    TIME_TAG.lastIndex = 0;
    const stamps: number[] = [];
    let m: RegExpExecArray | null;
    let lastEnd = 0;
    while ((m = TIME_TAG.exec(line)) && m.index === lastEnd) {
      stamps.push((Number(m[1]) * 60 + Number(m[2])) * 1000 + fracToMs(m[3]));
      lastEnd = TIME_TAG.lastIndex;
    }
    if (stamps.length) {
      const body = line.slice(lastEnd).replace(WORD_TAG, '').trim();
      for (const s of stamps) lines.push({ timeMs: s, text: body });
      plainLines.push(body);
      continue;
    }
    const mm = META_TAG.exec(line);
    if (mm) {
      meta[(mm[1] as string).toLowerCase()] = (mm[2] as string).trim();
      continue;
    }
    plainLines.push(line.replace(WORD_TAG, ''));
  }
  const offset = Number(meta.offset ?? 0);
  if (Number.isFinite(offset) && offset !== 0) {
    // LRC: a positive offset makes lyrics appear sooner.
    for (const l of lines) l.timeMs = Math.max(0, l.timeMs - offset);
  }
  lines.sort((a, b) => a.timeMs - b.timeMs);
  const plain = plainLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { synced: lines.length > 0, lines, plain, meta };
}

/** Index of the line active at `songMs` (−1 before the first line). Binary search. */
export function activeLineIndex(lines: readonly LyricLine[], songMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lines[mid] as LyricLine).timeMs <= songMs) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Lyrics follow *song* time (media currentTime), so at playbackRate r a line `d` ms of song
 * time away arrives after d / r ms of wall-clock time. Used to schedule highlight transitions.
 */
export function wallClockMsUntil(lineTimeMs: number, songMs: number, playbackRate: number): number {
  return (lineTimeMs - songMs) / Math.max(playbackRate, 0.01);
}

/** Song time to compare against the lyrics, including the per-track user offset (ms). */
export function lyricsClock(songSec: number, userOffsetMs: number): number {
  return songSec * 1000 + userOffsetMs;
}

/** Real (wall-clock) seconds left in the song at the given playback rate. */
export function realTimeRemaining(
  durationSec: number,
  currentSec: number,
  playbackRate: number,
): number {
  return Math.max(0, durationSec - currentSec) / Math.max(playbackRate, 0.01);
}

export const LYRICS_OFFSET_LIMIT_MS = 5000;
