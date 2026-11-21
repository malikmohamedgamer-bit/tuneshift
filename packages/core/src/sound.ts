import { z } from 'zod';

/** The 10 graphic-EQ band centre frequencies (Hz), 32 Hz → 16 kHz. */
export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_BAND_LABELS = [
  '32',
  '64',
  '125',
  '250',
  '500',
  '1k',
  '2k',
  '4k',
  '8k',
  '16k',
] as const;

export const ROOM_TYPES = ['room', 'hall', 'plate', 'church', 'stadium', 'dreamy'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const FILTER_TYPES = [
  'lowpass',
  'highpass',
  'bandpass',
  'lowshelf',
  'highshelf',
  'peaking',
  'notch',
  'allpass',
] as const;
export type FilterType = (typeof FILTER_TYPES)[number];

export interface ParametricBand {
  freq: number;
  q: number;
  gainDb: number;
  type: FilterType;
}

export interface CompressorSettings {
  enabled: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  knee: number;
}

export interface ReverbSettings {
  amount: number;
  room: RoomType;
  preDelayMs: number;
  tone: number;
}

export interface EightDSettings {
  enabled: boolean;
  speedHz: number;
  radius: number;
  heightWobble: boolean;
}

export interface SoundSettings {
  version: 1;
  /** 0.5–2.0 */
  speed: number;
  pitchMode: 'tape' | 'independent';
  /** −12..+12, independent mode only */
  pitchSemitones: number;
  /** −12..+12 dB */
  preampDb: number;
  eqEnabled: boolean;
  eqMode: 'graphic' | 'parametric';
  /** 10 values, dB, −12..+12 */
  eqGains: number[];
  parametric?: ParametricBand[];
  /** 0..+15 dB */
  bassBoostDb: number;
  compressor: CompressorSettings;
  reverb: ReverbSettings;
  eightD: EightDSettings;
  /** 0 = mono, 1 = normal, up to 2 */
  widener: number;
  lofi: { enabled: boolean; amount: number };
  vocalReduce: { enabled: boolean; amount: number };
}

export const LIMITS = {
  speed: [0.5, 2] as const,
  pitchSemitones: [-12, 12] as const,
  preampDb: [-12, 12] as const,
  eqGain: [-12, 12] as const,
  bassBoostDb: [0, 15] as const,
  threshold: [-60, 0] as const,
  ratio: [1, 20] as const,
  attack: [0, 1] as const,
  release: [0.01, 1] as const,
  knee: [0, 40] as const,
  reverbAmount: [0, 1] as const,
  preDelayMs: [0, 100] as const,
  tone: [0, 1] as const,
  eightDSpeed: [0.02, 0.5] as const,
  eightDRadius: [0.3, 3] as const,
  widener: [0, 2] as const,
  amount01: [0, 1] as const,
  paramFreq: [20, 20000] as const,
  paramQ: [0.1, 18] as const,
};

export const NEUTRAL_SOUND: Readonly<SoundSettings> = Object.freeze({
  version: 1,
  speed: 1,
  pitchMode: 'tape',
  pitchSemitones: 0,
  preampDb: 0,
  eqEnabled: true,
  eqMode: 'graphic',
  eqGains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bassBoostDb: 0,
  compressor: { enabled: false, threshold: -24, ratio: 3, attack: 0.01, release: 0.25, knee: 10 },
  reverb: { amount: 0, room: 'room', preDelayMs: 0, tone: 1 },
  eightD: { enabled: false, speedHz: 0.12, radius: 1, heightWobble: false },
  widener: 1,
  lofi: { enabled: false, amount: 0 },
  vocalReduce: { enabled: false, amount: 0 },
} satisfies SoundSettings);

/** Deep clone of the neutral sound (safe to mutate). */
export function neutralSound(): SoundSettings {
  return cloneSound(NEUTRAL_SOUND);
}

export function cloneSound(s: Readonly<SoundSettings>): SoundSettings {
  return {
    ...s,
    eqGains: [...s.eqGains],
    parametric: s.parametric?.map((b) => ({ ...b })),
    compressor: { ...s.compressor },
    reverb: { ...s.reverb },
    eightD: { ...s.eightD },
    lofi: { ...s.lofi },
    vocalReduce: { ...s.vocalReduce },
  };
}

const num = (lo: number, hi: number) => z.number().min(lo).max(hi);

export const ParametricBandSchema = z.object({
  freq: num(...LIMITS.paramFreq),
  q: num(...LIMITS.paramQ),
  gainDb: num(-24, 24),
  type: z.enum(FILTER_TYPES),
});

/** Strict schema: a fully-specified, in-range v1 sound. */
export const SoundSettingsSchema = z.object({
  version: z.literal(1),
  speed: num(...LIMITS.speed),
  pitchMode: z.enum(['tape', 'independent']),
  pitchSemitones: num(...LIMITS.pitchSemitones),
  preampDb: num(...LIMITS.preampDb),
  eqEnabled: z.boolean(),
  eqMode: z.enum(['graphic', 'parametric']),
  eqGains: z.array(num(...LIMITS.eqGain)).length(10),
  parametric: z.array(ParametricBandSchema).max(10).optional(),
  bassBoostDb: num(...LIMITS.bassBoostDb),
  compressor: z.object({
    enabled: z.boolean(),
    threshold: num(...LIMITS.threshold),
    ratio: num(...LIMITS.ratio),
    attack: num(...LIMITS.attack),
    release: num(...LIMITS.release),
    knee: num(...LIMITS.knee),
  }),
  reverb: z.object({
    amount: num(...LIMITS.reverbAmount),
    room: z.enum(ROOM_TYPES),
    preDelayMs: num(...LIMITS.preDelayMs),
    tone: num(...LIMITS.tone),
  }),
  eightD: z.object({
    enabled: z.boolean(),
    speedHz: num(...LIMITS.eightDSpeed),
    radius: num(...LIMITS.eightDRadius),
    heightWobble: z.boolean(),
  }),
  widener: num(...LIMITS.widener),
  lofi: z.object({ enabled: z.boolean(), amount: num(...LIMITS.amount01) }),
  vocalReduce: z.object({ enabled: z.boolean(), amount: num(...LIMITS.amount01) }),
});

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const n = (v: unknown, fallback: number, lo: number, hi: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
const b = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/**
 * Tolerant migration + normalisation. Accepts:
 *  - v1 objects with missing/out-of-range fields (filled from neutral, clamped),
 *  - the pre-release v0 shape `{ rate, bass, eq, reverb: number, eightD: boolean }`.
 * Throws only if the input isn't an object at all.
 */
export function migrateSound(input: unknown): SoundSettings {
  if (!isObj(input)) throw new Error('Sound settings must be an object');
  const N = NEUTRAL_SOUND;
  let src: Obj = input;
  if (input.version === undefined || input.version === 0) {
    // v0 → v1 key mapping (legacy pre-release format).
    src = { ...input };
    if (src.speed === undefined && typeof src.rate === 'number') src.speed = src.rate;
    if (src.bassBoostDb === undefined && typeof src.bass === 'number') src.bassBoostDb = src.bass;
    if (src.eqGains === undefined && Array.isArray(src.eq)) src.eqGains = src.eq;
    if (typeof src.reverb === 'number') src.reverb = { amount: src.reverb };
    if (typeof src.eightD === 'boolean') src.eightD = { enabled: src.eightD };
  } else if (input.version !== 1) {
    throw new Error(`Unsupported sound version: ${String(input.version)}`);
  }

  const gainsIn = Array.isArray(src.eqGains) ? src.eqGains : [];
  const eqGains = N.eqGains.map((d, i) => n(gainsIn[i], d, ...LIMITS.eqGain));
  const comp = isObj(src.compressor) ? src.compressor : {};
  const rev = isObj(src.reverb) ? src.reverb : {};
  const e8 = isObj(src.eightD) ? src.eightD : {};
  const lofi = isObj(src.lofi) ? src.lofi : {};
  const voc = isObj(src.vocalReduce) ? src.vocalReduce : {};
  const room = ROOM_TYPES.includes(rev.room as RoomType) ? (rev.room as RoomType) : N.reverb.room;

  let parametric: ParametricBand[] | undefined;
  if (Array.isArray(src.parametric)) {
    parametric = src.parametric
      .filter(isObj)
      .slice(0, 10)
      .map((p) => ({
        freq: n(p.freq, 1000, ...LIMITS.paramFreq),
        q: n(p.q, 1, ...LIMITS.paramQ),
        gainDb: n(p.gainDb, 0, -24, 24),
        type: FILTER_TYPES.includes(p.type as FilterType) ? (p.type as FilterType) : 'peaking',
      }));
  }

  const out: SoundSettings = {
    version: 1,
    speed: n(src.speed, N.speed, ...LIMITS.speed),
    pitchMode: src.pitchMode === 'independent' ? 'independent' : 'tape',
    pitchSemitones: n(src.pitchSemitones, 0, ...LIMITS.pitchSemitones),
    preampDb: n(src.preampDb, 0, ...LIMITS.preampDb),
    eqEnabled: b(src.eqEnabled, true),
    eqMode: src.eqMode === 'parametric' ? 'parametric' : 'graphic',
    eqGains,
    bassBoostDb: n(src.bassBoostDb, 0, ...LIMITS.bassBoostDb),
    compressor: {
      enabled: b(comp.enabled, N.compressor.enabled),
      threshold: n(comp.threshold, N.compressor.threshold, ...LIMITS.threshold),
      ratio: n(comp.ratio, N.compressor.ratio, ...LIMITS.ratio),
      attack: n(comp.attack, N.compressor.attack, ...LIMITS.attack),
      release: n(comp.release, N.compressor.release, ...LIMITS.release),
      knee: n(comp.knee, N.compressor.knee, ...LIMITS.knee),
    },
    reverb: {
      amount: n(rev.amount, 0, ...LIMITS.reverbAmount),
      room,
      preDelayMs: n(rev.preDelayMs, 0, ...LIMITS.preDelayMs),
      tone: n(rev.tone, 1, ...LIMITS.tone),
    },
    eightD: {
      enabled: b(e8.enabled, false),
      speedHz: n(e8.speedHz, N.eightD.speedHz, ...LIMITS.eightDSpeed),
      radius: n(e8.radius, N.eightD.radius, ...LIMITS.eightDRadius),
      heightWobble: b(e8.heightWobble, false),
    },
    widener: n(src.widener, 1, ...LIMITS.widener),
    lofi: { enabled: b(lofi.enabled, false), amount: n(lofi.amount, 0, ...LIMITS.amount01) },
    vocalReduce: { enabled: b(voc.enabled, false), amount: n(voc.amount, 0, ...LIMITS.amount01) },
  };
  if (parametric) out.parametric = parametric;
  return out;
}

/** Validates against the strict schema after migration; returns null when unusable. */
export function parseSound(input: unknown): SoundSettings | null {
  try {
    const migrated = migrateSound(input);
    const r = SoundSettingsSchema.safeParse(migrated);
    return r.success ? (r.data as SoundSettings) : null;
  } catch {
    return null;
  }
}

const EPS = 1e-6;
const near = (a: number, b2: number) => Math.abs(a - b2) < 1e-3;

export function soundsEqual(a: SoundSettings, c: SoundSettings): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(c));
}

/** Canonical form for comparisons: values that have no audible effect are zeroed out. */
function canonical(s: SoundSettings): unknown {
  return {
    speed: round(s.speed),
    pitch: s.pitchMode === 'independent' ? round(s.pitchSemitones) : 0,
    pitchMode: s.pitchMode,
    preamp: round(s.preampDb),
    eq: s.eqEnabled
      ? s.eqMode === 'graphic'
        ? s.eqGains.map(round)
        : (s.parametric ?? []).map((p) => [p.type, round(p.freq), round(p.q), round(p.gainDb)])
      : 'off',
    bass: round(s.bassBoostDb),
    comp: s.compressor.enabled ? s.compressor : 'off',
    rev: s.reverb.amount > EPS ? s.reverb : 'off',
    e8: s.eightD.enabled ? s.eightD : 'off',
    wide: round(s.widener),
    lofi: s.lofi.enabled ? round(s.lofi.amount) : 'off',
    voc: s.vocalReduce.enabled ? round(s.vocalReduce.amount) : 'off',
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

export function isNeutral(s: SoundSettings): boolean {
  return soundsEqual(s, NEUTRAL_SOUND);
}

/** True when the sound needs the Web Audio graph (anything beyond tape speed). */
export function needsGraph(s: SoundSettings): boolean {
  const flat = cloneSound(s);
  flat.speed = 1;
  flat.pitchMode = 'tape';
  return !isNeutral(flat) || (s.pitchMode === 'independent' && !near(s.pitchSemitones, 0));
}

/** Copy of `s` with only what works without Web Audio (Limited mode / Background-safe). */
export function tapeOnly(s: SoundSettings): SoundSettings {
  const out = neutralSound();
  out.speed = s.speed;
  out.pitchMode = s.pitchMode;
  return out;
}

/**
 * Adapt a sound for live inputs (desktop Boost mode, extension) where playbackRate can't apply.
 * Tempo is dropped; with `tapeToPitch`, a tape-style speed is kept as its pitch shift through the
 * worklet (so "Nightcore" still sounds higher on live audio, just not faster).
 */
export function liveInputSound(s: SoundSettings, opts: { tapeToPitch: boolean }): SoundSettings {
  const out = cloneSound(s);
  if (out.pitchMode === 'tape') {
    out.pitchSemitones =
      opts.tapeToPitch && !near(out.speed, 1)
        ? clamp(Math.round(tapeSemitones(out.speed) * 10) / 10, ...LIMITS.pitchSemitones)
        : 0;
    out.pitchMode = out.pitchSemitones !== 0 ? 'independent' : 'tape';
  }
  out.speed = 1;
  return out;
}

/** Semitones of pitch change produced by tape-style speed. */
export function tapeSemitones(speed: number): number {
  return 12 * Math.log2(speed);
}
