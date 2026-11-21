import { z } from 'zod';
import { fisherYates, seededRng } from './random';
import type { SyncMeta, Track } from './types';

export const RULE_FIELDS = [
  'title',
  'artist',
  'album',
  'genre',
  'source',
  'liked',
  'playCount',
  'lastPlayed',
  'dateAdded',
  'duration',
  'hasSavedSound',
] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_OPS = [
  'is',
  'isNot',
  'contains',
  'notContains',
  'gt',
  'lt',
  'between',
  'inLast',
  'notInLast',
  'isTrue',
  'isFalse',
] as const;
export type RuleOp = (typeof RULE_OPS)[number];

export type FieldKind = 'text' | 'number' | 'date' | 'bool' | 'enum';

export const FIELD_KIND: Record<RuleField, FieldKind> = {
  title: 'text',
  artist: 'text',
  album: 'text',
  genre: 'text',
  source: 'enum',
  liked: 'bool',
  playCount: 'number',
  lastPlayed: 'date',
  dateAdded: 'date',
  duration: 'number',
  hasSavedSound: 'bool',
};

export const OPS_FOR_KIND: Record<FieldKind, readonly RuleOp[]> = {
  text: ['is', 'isNot', 'contains', 'notContains'],
  enum: ['is', 'isNot'],
  number: ['is', 'gt', 'lt', 'between'],
  date: ['inLast', 'notInLast'],
  bool: ['isTrue', 'isFalse'],
};

export const FIELD_LABEL: Record<RuleField, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  genre: 'Genre',
  source: 'Source',
  liked: 'Liked',
  playCount: 'Play count',
  lastPlayed: 'Last played',
  dateAdded: 'Date added',
  duration: 'Duration (seconds)',
  hasSavedSound: 'Has saved sound',
};

export interface Rule {
  id: string;
  field: RuleField;
  op: RuleOp;
  /** text/enum value, number, or day count for date ops */
  value?: string | number;
  value2?: number;
}

export interface RuleGroup {
  id: string;
  match: 'all' | 'any';
  rules: (Rule | RuleGroup)[];
}

export const SORT_FIELDS = [
  'title',
  'artist',
  'dateAdded',
  'playCount',
  'lastPlayed',
  'duration',
  'random',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export interface SmartPlaylist extends SyncMeta {
  id: string;
  name: string;
  root: RuleGroup;
  sort: { field: SortField; dir: 'asc' | 'desc' };
  limit?: number;
  createdAt: number;
}

export interface TrackStats {
  playCount: number;
  lastPlayed?: number;
  liked: boolean;
  hasSavedSound: boolean;
}

const RuleSchema = z.object({
  id: z.string(),
  field: z.enum(RULE_FIELDS),
  op: z.enum(RULE_OPS),
  value: z.union([z.string(), z.number()]).optional(),
  value2: z.number().optional(),
});

export const RuleGroupSchema: z.ZodType<RuleGroup> = z.lazy(() =>
  z.object({
    id: z.string(),
    match: z.enum(['all', 'any']),
    rules: z.array(z.union([RuleSchema, RuleGroupSchema])),
  }),
);

export function isGroup(r: Rule | RuleGroup): r is RuleGroup {
  return 'rules' in r;
}

const DAY = 86_400_000;

function textOf(t: Track, f: RuleField): string {
  switch (f) {
    case 'title':
      return t.title;
    case 'artist':
      return t.artist;
    case 'album':
      return t.album ?? '';
    case 'genre':
      return t.genre ?? '';
    case 'source':
      return t.source;
    default:
      return '';
  }
}

export function evaluateRule(rule: Rule, t: Track, st: TrackStats, now: number): boolean {
  const kind = FIELD_KIND[rule.field];
  if (kind === 'bool') {
    const v = rule.field === 'liked' ? st.liked : st.hasSavedSound;
    return rule.op === 'isFalse' ? !v : v;
  }
  if (kind === 'date') {
    const ts = rule.field === 'lastPlayed' ? st.lastPlayed : t.addedAt;
    const days = Number(rule.value ?? 0);
    const within = ts !== undefined && now - ts <= days * DAY;
    return rule.op === 'notInLast' ? !within : within;
  }
  if (kind === 'number') {
    const v = rule.field === 'playCount' ? st.playCount : t.durationSec;
    const a = Number(rule.value ?? 0);
    switch (rule.op) {
      case 'gt':
        return v > a;
      case 'lt':
        return v < a;
      case 'between': {
        const bnd = Number(rule.value2 ?? a);
        return v >= Math.min(a, bnd) && v <= Math.max(a, bnd);
      }
      default:
        return v === a;
    }
  }
  const hay = textOf(t, rule.field).toLowerCase();
  const needle = String(rule.value ?? '')
    .toLowerCase()
    .trim();
  switch (rule.op) {
    case 'isNot':
      return hay !== needle;
    case 'contains':
      return hay.includes(needle);
    case 'notContains':
      return !hay.includes(needle);
    default:
      return hay === needle;
  }
}

export function evaluateGroup(g: RuleGroup, t: Track, st: TrackStats, now: number): boolean {
  if (!g.rules.length) return true;
  const test = (r: Rule | RuleGroup) =>
    isGroup(r) ? evaluateGroup(r, t, st, now) : evaluateRule(r, t, st, now);
  return g.match === 'all' ? g.rules.every(test) : g.rules.some(test);
}

/** Evaluate a smart playlist: filter, sort and limit. `seed` keeps "random" stable per day. */
export function evaluateSmartPlaylist(
  def: Pick<SmartPlaylist, 'root' | 'sort' | 'limit'>,
  tracks: readonly Track[],
  statsFor: (key: string) => TrackStats,
  now = Date.now(),
  seed = Math.floor(now / DAY),
): Track[] {
  const matched = tracks.filter((t) => evaluateGroup(def.root, t, statsFor(t.key), now));
  let sorted: Track[];
  if (def.sort.field === 'random') {
    sorted = fisherYates(matched, seededRng(seed));
  } else {
    const dir = def.sort.dir === 'asc' ? 1 : -1;
    const keyFn = (t: Track): string | number => {
      const st = statsFor(t.key);
      switch (def.sort.field) {
        case 'title':
          return t.title.toLowerCase();
        case 'artist':
          return t.artist.toLowerCase();
        case 'dateAdded':
          return t.addedAt ?? 0;
        case 'playCount':
          return st.playCount;
        case 'lastPlayed':
          return st.lastPlayed ?? 0;
        case 'duration':
          return t.durationSec;
        default:
          return 0;
      }
    };
    sorted = [...matched].sort((a, c) => {
      const ka = keyFn(a);
      const kc = keyFn(c);
      return (ka < kc ? -1 : ka > kc ? 1 : 0) * dir;
    });
  }
  return def.limit && def.limit > 0 ? sorted.slice(0, def.limit) : sorted;
}
