import type { Track } from './types';

/** A row to match, from pasted "Artist – Title" text or a CSV (e.g. Exportify). */
export interface ImportRow {
  title: string;
  artist: string;
  durationSec?: number;
  album?: string;
}

const BRACKETED_NOISE =
  /[([](?:[^)\]]*?(?:official|video|audio|lyrics?|lyric video|visuali[sz]er|hq|hd|4k|remaster(?:ed)?|explicit|clean|mv)[^)\]]*?)[)\]]/gi;

/** Lowercase, strip accents, "(Official Video)" noise, "feat." credits and punctuation. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(BRACKETED_NOISE, ' ')
    .replace(/\s(?:feat\.?|ft\.?|featuring)\s.*$/i, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(
        (prev[j] as number) + 1,
        (cur[j - 1] as number) + 1,
        (prev[j - 1] as number) + cost,
      );
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length] as number;
}

export function ratio(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len === 0 ? 1 : 1 - levenshtein(a, b) / len;
}

/** Token-sort ratio: order-insensitive similarity, 0..1. */
export function tokenSortRatio(a: string, b: string): number {
  const sa = normalizeForMatch(a).split(' ').sort().join(' ');
  const sb = normalizeForMatch(b).split(' ').sort().join(' ');
  return ratio(sa, sb);
}

/** Similarity 0..1 tolerant of extra words on one side ("Song" vs "Song (Sped Up)"). */
export function similarity(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const containment = inter / Math.min(ta.size, tb.size);
  const jaccard = inter / new Set([...ta, ...tb]).size;
  return Math.max(tokenSortRatio(na, nb), ratio(na, nb), 0.5 * containment + 0.5 * jaccard);
}

export interface MatchResult {
  track: Track;
  score: number;
}

export const MATCH_THRESHOLD = 0.72;

/** Score a candidate: title 60 %, artist 30 %, duration 10 % (±3 s full, ±10 s half). */
export function matchScore(row: ImportRow, t: Track): number {
  const titleSim = similarity(row.title, t.title);
  const artistSim = row.artist ? similarity(row.artist, t.artist) : 0.5;
  let durScore = 0.5;
  if (row.durationSec && t.durationSec) {
    const d = Math.abs(row.durationSec - t.durationSec);
    durScore = d <= 3 ? 1 : d <= 10 ? 0.5 : d <= 30 ? 0.2 : 0;
  }
  let score = 0.6 * titleSim + 0.3 * artistSim + 0.1 * durScore;
  if (titleSim < 0.6) score = Math.min(score, titleSim);
  if (row.durationSec && t.durationSec && Math.abs(row.durationSec - t.durationSec) > 45)
    score -= 0.15;
  return Math.max(0, Math.min(1, score));
}

export function bestMatch(
  row: ImportRow,
  candidates: readonly Track[],
  threshold = MATCH_THRESHOLD,
): MatchResult | null {
  let best: MatchResult | null = null;
  for (const t of candidates) {
    const score = matchScore(row, t);
    if (!best || score > best.score) best = { track: t, score };
  }
  return best && best.score >= threshold ? best : null;
}

const SEPARATORS = [' – ', ' — ', ' - ', ' −', ' | '];

/** Parse pasted lines: "Artist – Title", "Artist - Title", or "Title by Artist". */
export function parseTrackLines(text: string): ImportRow[] {
  const rows: ImportRow[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, '').trim();
    if (!line) continue;
    let row: ImportRow | null = null;
    for (const sep of SEPARATORS) {
      const i = line.indexOf(sep);
      if (i > 0) {
        row = { artist: line.slice(0, i).trim(), title: line.slice(i + sep.length).trim() };
        break;
      }
    }
    if (!row) {
      const by = /^(.*)\s+by\s+(.*)$/i.exec(line);
      row = by
        ? { title: (by[1] ?? '').trim(), artist: (by[2] ?? '').trim() }
        : { title: line, artist: '' };
    }
    if (row.title) rows.push(row);
  }
  return rows;
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.length)) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.length)) rows.push(row);
  return rows;
}

const H_TITLE = ['track name', 'track', 'title', 'name', 'song'];
const H_ARTIST = ['artist name(s)', 'artist names', 'artist name', 'artists', 'artist'];
const H_DUR_MS = ['duration (ms)', 'duration_ms', 'track duration (ms)'];
const H_DUR = ['duration', 'length', 'time'];
const H_ALBUM = ['album name', 'album'];

function findCol(header: string[], names: string[]): number {
  for (const n of names) {
    const i = header.indexOf(n);
    if (i >= 0) return i;
  }
  return -1;
}

function parseDuration(v: string): number | undefined {
  const s = v.trim();
  if (!s) return undefined;
  if (/^\d+:\d{1,2}(?::\d{1,2})?$/.test(s)) {
    return s.split(':').reduce((acc, p) => acc * 60 + Number(p), 0);
  }
  const num = Number(s);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

/** CSV → rows. Understands Exportify headers ("Track Name", "Artist Name(s)", "Duration (ms)"). */
export function parseImportCsv(text: string): ImportRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = (table[0] as string[]).map((h) => h.trim().toLowerCase());
  const ti = findCol(header, H_TITLE);
  const ai = findCol(header, H_ARTIST);
  const dmi = findCol(header, H_DUR_MS);
  const di = dmi >= 0 ? -1 : findCol(header, H_DUR);
  const ali = findCol(header, H_ALBUM);
  if (ti < 0) return [];
  const rows: ImportRow[] = [];
  for (const r of table.slice(1)) {
    const title = (r[ti] ?? '').trim();
    if (!title) continue;
    // Exportify joins multiple artists with ", " (older) or ";" (newer); keep the first.
    const artist = (ai >= 0 ? (r[ai] ?? '') : '').split(/;|,\s/)[0]?.trim() ?? '';
    const row: ImportRow = { title, artist };
    if (dmi >= 0) {
      const ms = Number(r[dmi]);
      if (Number.isFinite(ms) && ms > 0) row.durationSec = Math.round(ms / 1000);
    } else if (di >= 0) {
      const d = parseDuration(r[di] ?? '');
      if (d) row.durationSec = d;
    }
    if (ali >= 0 && r[ali]) row.album = r[ali];
    rows.push(row);
  }
  return rows;
}

/** Detects CSV vs pasted lines. */
export function parseImportText(text: string): ImportRow[] {
  const first = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? '';
  if (first.includes(',') && /track|title|name/.test(first)) {
    const rows = parseImportCsv(text);
    if (rows.length) return rows;
  }
  return parseTrackLines(text);
}

/** Grouping key for duplicate detection in local libraries (normalised title + artist). */
export function duplicateKey(t: Pick<Track, 'title' | 'artist'>): string {
  return `${normalizeForMatch(t.title)}|${normalizeForMatch(t.artist)}`;
}

/** Two library tracks are duplicates when title + artist match and durations are within ±2 s. */
export function isDuplicate(
  a: Pick<Track, 'title' | 'artist' | 'durationSec'>,
  b: Pick<Track, 'title' | 'artist' | 'durationSec'>,
): boolean {
  return duplicateKey(a) === duplicateKey(b) && Math.abs(a.durationSec - b.durationSec) <= 2;
}

/** Groups of duplicate tracks (each group has ≥ 2 members). */
export function findDuplicates<T extends Pick<Track, 'title' | 'artist' | 'durationSec'>>(
  tracks: readonly T[],
): T[][] {
  const byKey = new Map<string, T[]>();
  for (const t of tracks) {
    const k = duplicateKey(t);
    byKey.set(k, [...(byKey.get(k) ?? []), t]);
  }
  const groups: T[][] = [];
  for (const list of byKey.values()) {
    const used = new Set<number>();
    list.forEach((t, i) => {
      if (used.has(i)) return;
      const g = [t];
      for (let j = i + 1; j < list.length; j++)
        if (!used.has(j) && isDuplicate(t, list[j] as T)) {
          g.push(list[j] as T);
          used.add(j);
        }
      if (g.length > 1) groups.push(g);
    });
  }
  return groups;
}
