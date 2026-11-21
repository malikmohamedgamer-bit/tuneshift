import type { HistoryEntry } from './types';

export type StatsPeriod = 'week' | 'month' | 'year' | 'all';

const DAY = 86_400_000;
const PERIOD_MS: Record<StatsPeriod, number> = {
  week: 7 * DAY,
  month: 30 * DAY,
  year: 365 * DAY,
  all: Number.POSITIVE_INFINITY,
};

export interface RankedItem {
  key: string;
  label: string;
  sublabel?: string;
  plays: number;
  ms: number;
}

export interface ListeningStats {
  period: StatsPeriod;
  plays: number;
  minutes: number;
  topTracks: RankedItem[];
  topArtists: RankedItem[];
  topGenres: RankedItem[];
  topPresets: RankedItem[];
  mostUsedPreset?: RankedItem;
  /** 7 × 24 grid (Sunday-first day of week × hour) of minutes listened. */
  clock: number[][];
  peakHour?: number;
}

/** A play counts once it has been listened to for ≥ 30 s (or the whole track if shorter). */
export const MIN_PLAY_MS = 30_000;

function rank(map: Map<string, RankedItem>, limit: number): RankedItem[] {
  return [...map.values()].sort((a, b) => b.plays - a.plays || b.ms - a.ms).slice(0, limit);
}

function bump(map: Map<string, RankedItem>, key: string, label: string, ms: number, sub?: string) {
  const cur = map.get(key);
  if (cur) {
    cur.plays += 1;
    cur.ms += ms;
  } else map.set(key, { key, label, sublabel: sub, plays: 1, ms });
}

export function computeStats(
  history: readonly HistoryEntry[],
  period: StatsPeriod,
  now = Date.now(),
  limit = 10,
): ListeningStats {
  const since = now - PERIOD_MS[period];
  const tracks = new Map<string, RankedItem>();
  const artists = new Map<string, RankedItem>();
  const genres = new Map<string, RankedItem>();
  const presets = new Map<string, RankedItem>();
  const clock = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  let ms = 0;
  let plays = 0;
  for (const h of history) {
    if (h.deleted || h.playedAt < since || h.playedAt > now) continue;
    ms += h.msListened;
    const d = new Date(h.playedAt);
    (clock[d.getDay()] as number[])[d.getHours()] =
      ((clock[d.getDay()] as number[])[d.getHours()] as number) + h.msListened / 60000;
    if (h.msListened < MIN_PLAY_MS) continue;
    plays += 1;
    bump(tracks, h.trackKey, h.title, h.msListened, h.artist);
    bump(artists, h.artist.toLowerCase(), h.artist, h.msListened);
    if (h.genre) bump(genres, h.genre.toLowerCase(), h.genre, h.msListened);
    bump(presets, h.presetName ?? 'Normal', h.presetName ?? 'Normal', h.msListened);
  }
  const hourTotals = new Array<number>(24).fill(0);
  for (const row of clock) row.forEach((v, i) => (hourTotals[i] = (hourTotals[i] as number) + v));
  const maxHour = Math.max(...hourTotals);
  const topPresets = rank(presets, limit);
  return {
    period,
    plays,
    minutes: Math.round(ms / 60000),
    topTracks: rank(tracks, limit),
    topArtists: rank(artists, limit),
    topGenres: rank(genres, limit),
    topPresets,
    mostUsedPreset: topPresets[0],
    clock,
    peakHour: maxHour > 0 ? hourTotals.indexOf(maxHour) : undefined,
  };
}

/** Top genres for "Made for you" daily mixes. */
export function topGenresForMixes(
  history: readonly HistoryEntry[],
  count = 3,
  now = Date.now(),
): string[] {
  return computeStats(history, 'month', now, count).topGenres.map((g) => g.label);
}
