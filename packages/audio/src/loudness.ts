/**
 * Loudness maths (pure; runs in a Web Worker). Integrated loudness per ITU-R BS.1770-4 / EBU R128:
 * K-weighting (shelf + RLB high-pass, coefficients derived for any sample rate as in libebur128),
 * 400 ms blocks with 75 % overlap, absolute gate −70 LUFS, relative gate −10 LU.
 */

interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

export function kWeightingFilters(fs: number): [Biquad, Biquad] {
  // Stage 1: high shelf (head effects).
  let f0 = 1681.974450955533;
  const G = 3.999843853973347;
  let Q = 0.7071752369554196;
  let K = Math.tan((Math.PI * f0) / fs);
  const Vh = Math.pow(10, G / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  // Stage 2: RLB high-pass.
  f0 = 38.13547087602444;
  Q = 0.5003270373238773;
  K = Math.tan((Math.PI * f0) / fs);
  a0 = 1 + K / Q + K * K;
  const hp: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / Q + K * K) / a0,
  };
  return [shelf, hp];
}

function filterInPlace(x: Float32Array, f: Biquad): void {
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] as number;
    const yi = f.b0 * xi + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
    x[i] = yi;
  }
}

/** Integrated loudness in LUFS (−Infinity for silence). Channels are treated as L/R (weight 1). */
export function integratedLoudness(channels: readonly Float32Array[], sampleRate: number): number {
  if (!channels.length || !(channels[0] as Float32Array).length) return Number.NEGATIVE_INFINITY;
  const [shelf, hp] = kWeightingFilters(sampleRate);
  const weighted = channels.map((c) => {
    const y = Float32Array.from(c);
    filterInPlace(y, shelf);
    filterInPlace(y, hp);
    return y;
  });
  const block = Math.round(0.4 * sampleRate);
  const step = Math.round(0.1 * sampleRate);
  const len = (weighted[0] as Float32Array).length;
  const blocks: number[] = [];
  if (len < block) {
    // Short input: a single block over everything.
    let z = 0;
    for (const w of weighted) {
      let s = 0;
      for (let i = 0; i < len; i++) s += (w[i] as number) ** 2;
      z += s / len;
    }
    blocks.push(z);
  } else {
    for (let start = 0; start + block <= len; start += step) {
      let z = 0;
      for (const w of weighted) {
        let s = 0;
        for (let i = start; i < start + block; i++) s += (w[i] as number) ** 2;
        z += s / block;
      }
      blocks.push(z);
    }
  }
  const lufs = (z: number) => -0.691 + 10 * Math.log10(z);
  const abs = blocks.filter((z) => z > 0 && lufs(z) > -70);
  if (!abs.length) return Number.NEGATIVE_INFINITY;
  const relThreshold = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10;
  const rel = abs.filter((z) => lufs(z) > relThreshold);
  if (!rel.length) return Number.NEGATIVE_INFINITY;
  return lufs(rel.reduce((a, b) => a + b, 0) / rel.length);
}

/** Fast estimate for remote streams from a short time-domain snapshot (no K-weighting). */
export function estimateLoudnessFromRms(rms: number, channels = 2): number {
  if (rms <= 0) return Number.NEGATIVE_INFINITY;
  return 20 * Math.log10(rms) + 10 * Math.log10(channels) - 0.691 + 0.7;
}

export function rms(x: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += (x[i] as number) ** 2;
  return Math.sqrt(s / Math.max(1, x.length));
}

export const NORMALIZATION_TARGET_LUFS = -14;
export const NORMALIZATION_RANGE_DB: readonly [number, number] = [-12, 6];

/** Gain (dB) that brings `loudness` to the target, clamped to avoid big boosts. */
export function normalizationGainDb(loudness: number, target = NORMALIZATION_TARGET_LUFS): number {
  if (!Number.isFinite(loudness)) return 0;
  return Math.max(
    NORMALIZATION_RANGE_DB[0],
    Math.min(NORMALIZATION_RANGE_DB[1], target - loudness),
  );
}

/** ReplayGain 2 tags are relative to −18 LUFS; convert to our −14 LUFS target. */
export function replayGainToNormalizationDb(
  rgDb: number,
  target = NORMALIZATION_TARGET_LUFS,
): number {
  return Math.max(
    NORMALIZATION_RANGE_DB[0],
    Math.min(NORMALIZATION_RANGE_DB[1], rgDb + (target + 18)),
  );
}

/** Exponential smoothing for the running remote-stream adjustment. */
export function smoothTowards(current: number, target: number, alpha = 0.3): number {
  return current + (target - current) * alpha;
}
