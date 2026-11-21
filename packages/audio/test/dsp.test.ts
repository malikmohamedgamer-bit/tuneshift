import { describe, expect, it } from 'vitest';
import { ROOMS, synthesizeImpulse } from '../src/ir';
import { decodeWav, encodeWav } from '../src/wav';
import {
  estimateLoudnessFromRms,
  integratedLoudness,
  normalizationGainDb,
  replayGainToNormalizationDb,
  rms,
} from '../src/loudness';
import { encode } from '../src/export/encode';

function sine(freq: number, seconds: number, amp: number, sr = 48000): Float32Array {
  const n = Math.floor(seconds * sr);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr);
  return x;
}

describe('WAV encoder', () => {
  it('round-trips 16-bit and 24-bit within quantisation error', () => {
    const x = sine(440, 0.1, 0.5);
    for (const bits of [16, 24] as const) {
      const wav = encodeWav([x, x], 48000, bits);
      expect(wav.byteLength).toBe(44 + x.length * 2 * (bits / 8));
      const back = decodeWav(wav);
      expect(back.sampleRate).toBe(48000);
      expect(back.channels).toHaveLength(2);
      const tol = bits === 16 ? 2 / 32768 : 2 / 8388608;
      let worst = 0;
      for (let i = 0; i < x.length; i++)
        worst = Math.max(worst, Math.abs(back.channels[0]![i]! - x[i]!));
      expect(worst).toBeLessThan(tol);
    }
  });
});

describe('MP3 encoder (lamejs)', () => {
  it('produces an MPEG audio stream with frame sync', () => {
    const x = sine(440, 0.5, 0.3);
    let progress = 0;
    const out = encode(
      { channels: [x, x], sampleRate: 48000, format: 'mp3', kbps: 128 },
      (v) => (progress = v),
    );
    const b = new Uint8Array(out.data);
    expect(out.mime).toBe('audio/mpeg');
    expect(b.length).toBeGreaterThan(1000);
    expect(b[0]).toBe(0xff);
    expect(b[1]! & 0xe0).toBe(0xe0);
    expect(progress).toBe(1);
  });
});

describe('BS.1770 loudness', () => {
  it('measures a stereo 1 kHz sine at −20 dBFS as ≈ −20 LUFS', () => {
    const x = sine(997, 3, 0.1);
    expect(integratedLoudness([x, x], 48000)).toBeCloseTo(-20, 0);
  });

  it('is 3 LU lower for one channel only and −∞ for silence', () => {
    const x = sine(997, 3, 0.1);
    const silent = new Float32Array(x.length);
    expect(integratedLoudness([x, silent], 48000)).toBeCloseTo(-23, 0);
    expect(integratedLoudness([silent, silent], 48000)).toBe(Number.NEGATIVE_INFINITY);
  });

  it('works at 44.1 kHz and gives a sane RMS estimate', () => {
    const x = sine(997, 3, 0.1, 44100);
    expect(integratedLoudness([x, x], 44100)).toBeCloseTo(-20, 0);
    expect(estimateLoudnessFromRms(rms(x))).toBeCloseTo(-20, 0);
  });

  it('normalisation gains clamp and ReplayGain maps to the −14 LUFS target', () => {
    expect(normalizationGainDb(-20)).toBe(6);
    expect(normalizationGainDb(-9)).toBe(-5);
    expect(normalizationGainDb(-40)).toBe(6);
    expect(normalizationGainDb(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(replayGainToNormalizationDb(-6)).toBe(-2);
  });
});

describe('impulse responses', () => {
  it('are deterministic, stereo-decorrelated and decay to −60 dB', () => {
    const [l, r] = synthesizeImpulse('hall', 48000);
    const [l2] = synthesizeImpulse('hall', 48000);
    expect(l.length).toBe(Math.floor(ROOMS.hall.seconds * 48000));
    expect([...l.slice(1000, 1010)]).toEqual([...l2.slice(1000, 1010)]);
    expect([...l.slice(1000, 1010)]).not.toEqual([...r.slice(1000, 1010)]);
    const head = rms(l.subarray(0, 4800));
    const tail = rms(l.subarray(l.length - 4800));
    expect(20 * Math.log10(tail / head)).toBeLessThan(-45);
  });

  it('dreamy is darker than plate', () => {
    const zeroCrossings = (x: Float32Array) => {
      let n = 0;
      for (let i = 1; i < 24000; i++) if (Math.sign(x[i]!) !== Math.sign(x[i - 1]!)) n++;
      return n;
    };
    expect(zeroCrossings(synthesizeImpulse('dreamy', 48000)[0])).toBeLessThan(
      zeroCrossings(synthesizeImpulse('plate', 48000)[0]),
    );
  });
});
