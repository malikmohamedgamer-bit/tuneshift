/**
 * Tiny offline synth used to make the original demo loops and test fixtures. Everything here is
 * written from scratch (oscillators, envelopes, filters), so the output is fully original.
 */
import { seededRng } from '../packages/core/src/random';

export const SR = 44100;
const phaseRng = seededRng(2026);

export class Track {
  readonly L: Float32Array;
  readonly R: Float32Array;
  constructor(readonly seconds: number) {
    const n = Math.ceil(seconds * SR);
    this.L = new Float32Array(n);
    this.R = new Float32Array(n);
  }
  get length(): number {
    return this.L.length;
  }
  /** Add a mono buffer at time `t` (s) with gain and pan (−1..1, equal power). */
  add(buf: Float32Array, t: number, gain = 1, pan = 0): void {
    const start = Math.floor(t * SR);
    const a = ((pan + 1) * Math.PI) / 4;
    const gl = Math.cos(a) * gain * Math.SQRT2;
    const gr = Math.sin(a) * gain * Math.SQRT2;
    for (let i = 0; i < buf.length; i++) {
      const j = start + i;
      if (j >= this.L.length) break;
      if (j < 0) continue;
      this.L[j] = (this.L[j] as number) + (buf[i] as number) * gl;
      this.R[j] = (this.R[j] as number) + (buf[i] as number) * gr;
    }
  }
  addStereo(l: Float32Array, r: Float32Array, t: number, gain = 1): void {
    this.add(l, t, gain / Math.SQRT2, -1);
    this.add(r, t, gain / Math.SQRT2, 1);
  }
  /** Normalise to a peak level (dBFS) with a gentle soft clip on top. */
  master(peakDb = -1): void {
    for (const ch of [this.L, this.R])
      for (let i = 0; i < ch.length; i++) ch[i] = Math.tanh((ch[i] as number) * 1.1);
    let p = 0;
    for (const ch of [this.L, this.R])
      for (let i = 0; i < ch.length; i++) p = Math.max(p, Math.abs(ch[i] as number));
    const g = Math.pow(10, peakDb / 20) / (p || 1);
    for (const ch of [this.L, this.R])
      for (let i = 0; i < ch.length; i++) ch[i] = (ch[i] as number) * g;
    // 10 ms fades so the loop starts/ends without clicks.
    const f = Math.floor(0.01 * SR);
    for (const ch of [this.L, this.R]) {
      for (let i = 0; i < f; i++) {
        ch[i] = (ch[i] as number) * (i / f);
        ch[ch.length - 1 - i] = (ch[ch.length - 1 - i] as number) * (i / f);
      }
    }
  }
}

export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type Wave = 'sine' | 'saw' | 'square' | 'triangle';

function osc(wave: Wave, phase: number): number {
  const p = phase - Math.floor(phase);
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * p);
    case 'saw':
      return 2 * p - 1;
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'triangle':
      return 1 - 4 * Math.abs(p - 0.5);
  }
}

export interface Adsr {
  a: number;
  d: number;
  s: number;
  r: number;
}

export function envelope(i: number, holdSamples: number, e: Adsr): number {
  const t = i / SR;
  const hold = holdSamples / SR;
  let v: number;
  if (t < e.a) v = t / e.a;
  else if (t < e.a + e.d) v = 1 - (1 - e.s) * ((t - e.a) / e.d);
  else v = e.s;
  if (t > hold) v *= Math.max(0, 1 - (t - hold) / e.r);
  return v;
}

/** One-pole low-pass in place. */
export function lowpass(x: Float32Array, hz: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * hz) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) {
    y = (1 - a) * (x[i] as number) + a * y;
    x[i] = y;
  }
  return x;
}

export function highpass(x: Float32Array, hz: number): Float32Array {
  const a = Math.exp((-2 * Math.PI * hz) / SR);
  let lp = 0;
  for (let i = 0; i < x.length; i++) {
    lp = (1 - a) * (x[i] as number) + a * lp;
    x[i] = (x[i] as number) - lp;
  }
  return x;
}

/** Note with oscillator mix, ADSR and optional filter envelope (state-variable low-pass). */
export function note(opts: {
  freq: number;
  dur: number;
  waves: [Wave, number, number?][]; // wave, gain, detune cents
  env: Adsr;
  cutoff?: [number, number, number]; // start Hz, end Hz, seconds
  res?: number;
  vibrato?: [number, number];
}): Float32Array {
  const len = Math.ceil((opts.dur + opts.env.r) * SR);
  const out = new Float32Array(len);
  const phases = opts.waves.map(() => phaseRng());
  let low = 0;
  let band = 0;
  const q = opts.res ?? 0.7;
  for (let i = 0; i < len; i++) {
    let s = 0;
    const vib = opts.vibrato
      ? 1 + opts.vibrato[1] * Math.sin((2 * Math.PI * opts.vibrato[0] * i) / SR)
      : 1;
    opts.waves.forEach(([w, g, cents], k) => {
      const f = opts.freq * vib * Math.pow(2, (cents ?? 0) / 1200);
      phases[k] = (phases[k] as number) + f / SR;
      s += osc(w, phases[k] as number) * g;
    });
    if (opts.cutoff) {
      const [c0, c1, ct] = opts.cutoff;
      const t = Math.min(1, i / SR / ct);
      const fc = c0 * Math.pow(c1 / c0, t);
      const f = 2 * Math.sin((Math.PI * Math.min(fc, SR / 6)) / SR);
      low += f * band;
      const high = s - low - (1 / q) * band * 0.5;
      band += f * high;
      s = low;
    }
    out[i] = s * envelope(i, opts.dur * SR, opts.env);
  }
  return out;
}

export function kick(opts: { punch?: number; decay?: number; drive?: number } = {}): Float32Array {
  const len = Math.floor(0.6 * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 48 + (opts.punch ?? 140) * Math.exp(-t * 28);
    ph += f / SR;
    const v = Math.sin(2 * Math.PI * ph) * Math.exp(-t * (opts.decay ?? 7));
    out[i] = Math.tanh(v * (opts.drive ?? 1.4));
  }
  return out;
}

/** 808 bass: sine with a pitch drop, long decay and saturation. */
export function bass808(freq: number, dur: number, drive = 2.2): Float32Array {
  const len = Math.floor((dur + 0.15) * SR);
  const out = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = freq * (1 + 1.2 * Math.exp(-t * 40));
    ph += f / SR;
    const env =
      t < dur ? Math.exp(-t * 0.9) : Math.exp(-dur * 0.9) * Math.max(0, 1 - (t - dur) / 0.15);
    out[i] = Math.tanh(Math.sin(2 * Math.PI * ph) * drive) * env * Math.min(1, t / 0.003);
  }
  return out;
}

export function noiseHit(
  seed: number,
  opts: { decay: number; hp?: number; lp?: number; len?: number; tone?: [number, number] },
): Float32Array {
  const rng = seededRng(seed);
  const len = Math.floor((opts.len ?? 0.3) * SR);
  let out: Float32Array = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = (rng() * 2 - 1) * Math.exp((-i / SR) * opts.decay);
  if (opts.hp) out = highpass(out, opts.hp);
  if (opts.lp) out = lowpass(out, opts.lp);
  if (opts.tone) {
    const [f, g] = opts.tone;
    for (let i = 0; i < len; i++)
      out[i] =
        (out[i] as number) +
        g * Math.sin((2 * Math.PI * f * i) / SR) * Math.exp((-i / SR) * opts.decay * 1.5);
  }
  return out;
}

/** Simple stereo feedback-delay "room" for space (not the app's reverb). */
export function space(track: Track, mix = 0.18, seconds = 0.12, feedback = 0.45): void {
  const dl = Math.floor(seconds * SR);
  const dr = Math.floor(seconds * 1.31 * SR);
  const L = Float32Array.from(track.L);
  const R = Float32Array.from(track.R);
  const bl = new Float32Array(track.length);
  const br = new Float32Array(track.length);
  for (let i = 0; i < track.length; i++) {
    const fl = i >= dl ? (bl[i - dl] as number) : 0;
    const fr = i >= dr ? (br[i - dr] as number) : 0;
    bl[i] = (R[i] as number) * 0.5 + fr * feedback;
    br[i] = (L[i] as number) * 0.5 + fl * feedback;
  }
  lowpass(bl, 5000);
  lowpass(br, 5000);
  for (let i = 0; i < track.length; i++) {
    track.L[i] = (track.L[i] as number) + (bl[i] as number) * mix;
    track.R[i] = (track.R[i] as number) + (br[i] as number) * mix;
  }
}

/** Sidechain-style ducking at the given beat times. */
export function duck(track: Track, beats: number[], depth = 0.6, release = 0.22): void {
  const env = new Float32Array(track.length).fill(1);
  for (const b of beats) {
    const s = Math.floor(b * SR);
    const n = Math.floor(release * SR);
    for (let i = 0; i < n && s + i < env.length; i++) {
      const v = 1 - depth * Math.pow(1 - i / n, 2);
      env[s + i] = Math.min(env[s + i] as number, v);
    }
  }
  for (let i = 0; i < track.length; i++) {
    track.L[i] = (track.L[i] as number) * (env[i] as number);
    track.R[i] = (track.R[i] as number) * (env[i] as number);
  }
}
