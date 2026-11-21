import { seededRng, type RoomType } from '@tuneshift/core';

export interface RoomSpec {
  /** RT60 decay time in seconds. */
  seconds: number;
  /** Low-pass cutoff (Hz) at the start of the tail; it darkens toward `darkHz` at the end. */
  brightHz: number;
  darkHz: number;
  /** Number of discrete early reflections in the first ~80 ms. */
  early: number;
}

/** Room types (spec §4.3). Plate is brighter; Dreamy is low-passed. */
export const ROOMS: Record<RoomType, RoomSpec> = {
  room: { seconds: 0.8, brightHz: 9000, darkHz: 4000, early: 6 },
  hall: { seconds: 2.5, brightHz: 7500, darkHz: 2500, early: 8 },
  plate: { seconds: 1.6, brightHz: 15000, darkHz: 8000, early: 0 },
  church: { seconds: 4.5, brightHz: 6000, darkHz: 1800, early: 10 },
  stadium: { seconds: 6, brightHz: 5000, darkHz: 1500, early: 12 },
  dreamy: { seconds: 3.5, brightHz: 2800, darkHz: 1200, early: 4 },
};

export const ROOM_LABEL: Record<RoomType, string> = {
  room: 'Room',
  hall: 'Hall',
  plate: 'Plate',
  church: 'Church',
  stadium: 'Stadium',
  dreamy: 'Dreamy',
};

/**
 * Synthesises a stereo impulse response from exponentially decaying, progressively
 * low-passed noise (decorrelated per channel) plus a few early reflections. Deterministic per
 * (room, sampleRate) so renders are reproducible. No IR files → nothing to license.
 */
export function synthesizeImpulse(
  room: RoomType,
  sampleRate: number,
): [Float32Array, Float32Array] {
  const spec = ROOMS[room];
  const length = Math.max(1, Math.floor(spec.seconds * sampleRate));
  const out: [Float32Array, Float32Array] = [new Float32Array(length), new Float32Array(length)];
  const seedBase = [...room].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
  const fadeIn = Math.floor(0.002 * sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const rng = seededRng(seedBase + ch * 977);
    const data = out[ch] as Float32Array;
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // −60 dB at the end of the buffer (RT60).
      const env = Math.exp((-6.907755 * i) / length);
      const cutoff = spec.brightHz * Math.pow(spec.darkHz / spec.brightHz, t);
      const a = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
      const noise = rng() * 2 - 1;
      lp = (1 - a) * noise + a * lp;
      let v = lp * env;
      if (i < fadeIn) v *= i / fadeIn;
      data[i] = v;
    }
    // Early reflections: sparse taps in the first 80 ms, slightly different per channel.
    for (let k = 0; k < spec.early; k++) {
      const pos = Math.floor((0.008 + rng() * 0.072) * sampleRate);
      if (pos < length)
        data[pos] = (data[pos] as number) + (rng() > 0.5 ? 1 : -1) * (0.5 - k * 0.03);
    }
  }
  return out;
}

const cache = new Map<string, AudioBuffer>();

/** Cached AudioBuffer IR for a room at the context's sample rate. */
export function impulseBuffer(room: RoomType, sampleRate: number): AudioBuffer {
  const key = `${room}@${sampleRate}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [l, r] = synthesizeImpulse(room, sampleRate);
  const buf = new AudioBuffer({ length: l.length, numberOfChannels: 2, sampleRate });
  buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0);
  buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1);
  cache.set(key, buf);
  return buf;
}
