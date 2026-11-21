import { EQ_BANDS, type FilterType, type SoundSettings } from './sound';

/** Filter spec as the audio graph builds it (mirrors BiquadFilterNode semantics). */
export interface BiquadSpec {
  type: FilterType;
  freq: number;
  q: number;
  gainDb: number;
}

export const BASS_BOOST_FREQ = 90;
export const GRAPHIC_Q = 1.0;

/** The 10 EQ filters for a sound (graphic or parametric), exactly as the graph configures them. */
export function eqFilterSpecs(s: SoundSettings): BiquadSpec[] {
  if (s.eqMode === 'parametric' && s.parametric && s.parametric.length) {
    const bands: BiquadSpec[] = s.parametric.slice(0, 10).map((p) => ({
      type: p.type,
      freq: p.freq,
      q: p.q,
      gainDb: s.eqEnabled ? p.gainDb : 0,
    }));
    while (bands.length < 10) bands.push({ type: 'peaking', freq: 1000, q: 1, gainDb: 0 });
    // Disabled parametric bands that aren't gain-based must become transparent.
    return s.eqEnabled
      ? bands
      : bands.map(() => ({ type: 'peaking', freq: 1000, q: 1, gainDb: 0 }));
  }
  return EQ_BANDS.map((freq, i) => ({
    type: i === 0 ? 'lowshelf' : i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking',
    freq,
    q: GRAPHIC_Q,
    gainDb: s.eqEnabled ? (s.eqGains[i] ?? 0) : 0,
  }));
}

export function bassBoostSpec(s: SoundSettings): BiquadSpec {
  return { type: 'lowshelf', freq: BASS_BOOST_FREQ, q: 1, gainDb: s.bassBoostDb };
}

/**
 * Magnitude response (dB) of one biquad at `f` Hz, using the Web Audio API's definitions
 * (Audio EQ Cookbook; shelves use S = 1, lowpass/highpass Q is in dB).
 */
export function biquadMagnitudeDb(spec: BiquadSpec, f: number, sampleRate = 48000): number {
  const nyquist = sampleRate / 2;
  const f0 = Math.min(Math.max(spec.freq, 1), nyquist - 1);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const A = Math.pow(10, spec.gainDb / 40);
  const Q = Math.max(spec.q, 1e-4);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  switch (spec.type) {
    case 'lowpass': {
      const alpha = sin / (2 * Math.pow(10, spec.q / 20));
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'highpass': {
      const alpha = sin / (2 * Math.pow(10, spec.q / 20));
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'bandpass': {
      const alpha = sin / (2 * Q);
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'notch': {
      const alpha = sin / (2 * Q);
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    }
    case 'allpass':
      return 0;
    case 'peaking': {
      const alpha = sin / (2 * Q);
      b0 = 1 + alpha * A;
      b1 = -2 * cos;
      b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      a1 = -2 * cos;
      a2 = 1 - alpha / A;
      break;
    }
    case 'lowshelf': {
      const alphaS = (sin / 2) * Math.SQRT2;
      const k = 2 * Math.sqrt(A) * alphaS;
      b0 = A * (A + 1 - (A - 1) * cos + k);
      b1 = 2 * A * (A - 1 - (A + 1) * cos);
      b2 = A * (A + 1 - (A - 1) * cos - k);
      a0 = A + 1 + (A - 1) * cos + k;
      a1 = -2 * (A - 1 + (A + 1) * cos);
      a2 = A + 1 + (A - 1) * cos - k;
      break;
    }
    case 'highshelf': {
      const alphaS = (sin / 2) * Math.SQRT2;
      const k = 2 * Math.sqrt(A) * alphaS;
      b0 = A * (A + 1 + (A - 1) * cos + k);
      b1 = -2 * A * (A - 1 + (A + 1) * cos);
      b2 = A * (A + 1 + (A - 1) * cos - k);
      a0 = A + 1 - (A - 1) * cos + k;
      a1 = 2 * (A - 1 - (A + 1) * cos);
      a2 = A + 1 - (A - 1) * cos - k;
      break;
    }
  }
  const w = (2 * Math.PI * Math.min(f, nyquist)) / sampleRate;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  const mag = Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
  return 20 * Math.log10(Math.max(mag, 1e-12));
}

/** Log-spaced frequencies from 20 Hz to 20 kHz. */
export function logFrequencies(count: number, lo = 20, hi = 20000): number[] {
  const out: number[] = [];
  const l0 = Math.log10(lo);
  const l1 = Math.log10(hi);
  for (let i = 0; i < count; i++) out.push(Math.pow(10, l0 + ((l1 - l0) * i) / (count - 1)));
  return out;
}

/** Combined EQ + bass-boost response (dB) at each frequency. Used for the EQ curve + headroom. */
export function toneResponseDb(s: SoundSettings, freqs: number[], sampleRate = 48000): number[] {
  const specs = [...eqFilterSpecs(s), bassBoostSpec(s)];
  return freqs.map((f) => specs.reduce((sum, sp) => sum + biquadMagnitudeDb(sp, f, sampleRate), 0));
}

const HEADROOM_FREQS = logFrequencies(96);

/** Peak boost (dB, ≥ 0) of EQ + bass boost across the audible band. */
export function peakBoostDb(s: SoundSettings): number {
  return Math.max(0, ...toneResponseDb(s, HEADROOM_FREQS));
}

/** Threshold above which the preamp is lowered automatically (spec §4.1). */
export const AUTO_HEADROOM_THRESHOLD_DB = 6;

/** Automatic preamp reduction (dB, ≤ 0) so the limiter rarely works hard. */
export function autoHeadroomDb(s: SoundSettings): number {
  const peak = peakBoostDb(s);
  return peak > AUTO_HEADROOM_THRESHOLD_DB ? -(peak - AUTO_HEADROOM_THRESHOLD_DB) : 0;
}
