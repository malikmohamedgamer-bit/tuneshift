/**
 * Spec §13 audio tests, run in real Chromium (Vitest browser mode): every built-in preset is
 * rendered through an OfflineAudioContext copy of the live chain.
 */
import { describe, expect, it } from 'vitest';
import {
  SOUND_PRESETS,
  neutralSound,
  presetSettings,
  seededRng,
  type SoundSettings,
} from '@tuneshift/core';
import { renderWithEffects } from '../src/export/render';
import { EffectChain } from '../src/chain';

const SR = 48000;
const MAX_PEAK = Math.pow(10, -0.5 / 20); // −0.5 dBFS

function makeBuffer(seconds: number, fill: (i: number, ch: number) => number): AudioBuffer {
  const buf = new AudioBuffer({
    length: Math.floor(seconds * SR),
    numberOfChannels: 2,
    sampleRate: SR,
  });
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = fill(i, ch);
  }
  return buf;
}

/** Pink-ish noise (Paul Kellet filter) + 440 Hz tone at a hot level, like mastered music. */
function testSignal(seconds = 2): AudioBuffer {
  const rng = seededRng(42);
  let b0 = 0,
    b1 = 0,
    b2 = 0;
  const pink = new Float32Array(Math.floor(seconds * SR));
  for (let i = 0; i < pink.length; i++) {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    pink[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  return makeBuffer(
    seconds,
    (i) => (pink[i] as number) + 0.3 * Math.sin((2 * Math.PI * 440 * i) / SR),
  );
}

function tone(freq: number, seconds: number, amp = 0.4): AudioBuffer {
  return makeBuffer(seconds, (i) => amp * Math.sin((2 * Math.PI * freq * i) / SR));
}

function peak(buf: AudioBuffer): number {
  let p = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i] as number));
  }
  return p;
}

function rms(d: Float32Array, from = 0, to = d.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += (d[i] as number) ** 2;
  return Math.sqrt(s / Math.max(1, to - from));
}

/** Magnitude spectrum of `n` samples (power of two) starting at `from` (radix-2 FFT, Hann). */
function spectrum(d: Float32Array, from: number, n: number): Float64Array {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++)
    re[i] = (d[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] as number, re[i] as number];
      [im[i], im[j]] = [im[j] as number, im[i] as number];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] as number) * wr - (im[b] as number) * wi;
        const xi = (re[b] as number) * wi + (im[b] as number) * wr;
        re[b] = (re[a] as number) - xr;
        im[b] = (im[a] as number) - xi;
        re[a] = (re[a] as number) + xr;
        im[a] = (im[a] as number) + xi;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i] as number, im[i] as number);
  return mag;
}

function bandEnergy(buf: AudioBuffer, loHz: number, hiHz: number): number {
  const n = 32768;
  const d = buf.getChannelData(0);
  const mag = spectrum(d, Math.floor(0.4 * SR), n);
  let e = 0;
  for (let i = 0; i < mag.length; i++) {
    const f = (i * SR) / n;
    if (f >= loHz && f < hiHz) e += (mag[i] as number) ** 2;
  }
  return e;
}

function peakFrequency(buf: AudioBuffer, from = 0.2): number {
  const n = 16384;
  const mag = spectrum(buf.getChannelData(0), Math.floor(from * SR), n);
  let best = 1;
  for (let i = 2; i < mag.length; i++) if ((mag[i] as number) > (mag[best] as number)) best = i;
  return (best * SR) / n;
}

/** Last sample index above `threshold` in channel 0. */
function lastAudible(buf: AudioBuffer, threshold: number): number {
  const d = buf.getChannelData(0);
  for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i] as number) > threshold) return i;
  return -1;
}

describe('every built-in preset (OfflineAudioContext)', () => {
  const input = testSignal(2);

  for (const preset of SOUND_PRESETS) {
    it(`${preset.name}: not silent, peak ≤ −0.5 dBFS`, async () => {
      const out = await renderWithEffects(input, preset.settings);
      const level = rms(out.getChannelData(0)) + rms(out.getChannelData(1));
      expect(level, '(a) output must not be silent').toBeGreaterThan(1e-3);
      expect(peak(out), '(b) limiter + clipper keep peaks ≤ −0.5 dBFS').toBeLessThanOrEqual(
        MAX_PEAK,
      );
    });
  }

  it('(c) Bass Boosted raises energy below 150 Hz vs Normal', async () => {
    const normal = await renderWithEffects(input, presetSettings('normal'));
    const boosted = await renderWithEffects(input, presetSettings('bass-boosted'));
    const ratio = bandEnergy(boosted, 20, 150) / bandEnergy(normal, 20, 150);
    expect(10 * Math.log10(ratio)).toBeGreaterThan(3);
  });

  it('(d) Nightcore: duration ≈ input / 1.4 and the pitch goes up 1.4×', async () => {
    const t = tone(440, 2);
    const out = await renderWithEffects(t, presetSettings('nightcore'));
    const end = lastAudible(out, 0.01) / SR;
    expect(end).toBeGreaterThan(2 / 1.4 - 0.05);
    expect(end).toBeLessThan(2 / 1.4 + 0.08);
    const f = peakFrequency(out);
    expect(f).toBeGreaterThan(440 * 1.4 - 8);
    expect(f).toBeLessThan(440 * 1.4 + 8);
  });

  it('(e) 8D produces a time-varying left/right balance', async () => {
    const out = await renderWithEffects(testSignal(3), presetSettings('8d'));
    const L = out.getChannelData(0);
    const R = out.getChannelData(1);
    const balance = (from: number) => {
      const a = Math.floor(from * SR);
      const b = a + Math.floor(0.25 * SR);
      return 20 * Math.log10(rms(L, a, b) / rms(R, a, b));
    };
    const samples = [0.1, 0.8, 1.5, 2.2, 2.7].map(balance);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(3);
  });

  it('(f) reverb tail extends past the end of the input', async () => {
    const t = testSignal(1);
    const dry = await renderWithEffects(t, presetSettings('normal'));
    const wet = await renderWithEffects(t, presetSettings('slowed-reverb'));
    const inputEnd = 1 / 0.8;
    const tailFrom = Math.floor((inputEnd + 0.2) * SR);
    expect(wet.length).toBeGreaterThan(tailFrom + SR);
    expect(rms(wet.getChannelData(0), tailFrom, tailFrom + SR / 2)).toBeGreaterThan(1e-3);
    expect(lastAudible(dry, 1e-3) / SR).toBeLessThan(1.1);
  });

  it('independent pitch: +12 semitones at 1× speed doubles the frequency (signalsmith worklet)', async () => {
    const s: SoundSettings = { ...neutralSound(), pitchMode: 'independent', pitchSemitones: 12 };
    const out = await renderWithEffects(tone(440, 2), s);
    const f = peakFrequency(out, 0.6);
    expect(f).toBeGreaterThan(860);
    expect(f).toBeLessThan(900);
  });

  it('mono input stays centred through the M/S stages', async () => {
    const mono = new AudioBuffer({ length: SR, numberOfChannels: 1, sampleRate: SR });
    const d = mono.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * 330 * i) / SR);
    // Widener + bass + compressor exercise the splitter/merger stages; reverb is left out on
    // purpose because its stereo IR is decorrelated by design.
    const s: SoundSettings = {
      ...presetSettings('club'),
      reverb: { ...neutralSound().reverb },
      widener: 1.6,
    };
    const out = await renderWithEffects(mono, s);
    const l = rms(out.getChannelData(0), SR / 4, SR / 2);
    const r = rms(out.getChannelData(1), SR / 4, SR / 2);
    expect(Math.abs(20 * Math.log10(l / r))).toBeLessThan(0.5);
  });
});

describe('click-free parameter changes', () => {
  it('moving sliders and toggling stages mid-render produces no discontinuities', async () => {
    const freq = 220;
    const amp = 0.25;
    const seconds = 2;
    const ctx = new OfflineAudioContext({
      numberOfChannels: 2,
      length: seconds * SR,
      sampleRate: SR,
    });
    const chain = new EffectChain(ctx);
    chain.apply(neutralSound(), { immediate: true });
    chain.setVolume(1, false, true);
    const src = new AudioBufferSourceNode(ctx, { buffer: tone(freq, seconds, amp) });
    src.connect(chain.input);
    chain.output.connect(ctx.destination);
    src.start(0);
    const changes: [number, SoundSettings][] = [
      [0.5, { ...neutralSound(), bassBoostDb: 12, preampDb: 6 }],
      [0.9, { ...neutralSound(), compressor: { ...neutralSound().compressor, enabled: true } }],
      [1.3, { ...neutralSound(), widener: 0, vocalReduce: { enabled: true, amount: 1 } }],
      [1.6, neutralSound()],
    ];
    for (const [t, s] of changes) {
      void ctx.suspend(t).then(() => {
        chain.apply(s);
        return ctx.resume();
      });
    }
    const out = await ctx.startRendering();
    const d = out.getChannelData(0);
    // A clean sine's largest sample-to-sample step is 2π·f/sr·A (×gain). Allow generous gain
    // headroom (+12 dB bass) — an abrupt jump would be ~10× larger.
    const natural = ((2 * Math.PI * freq) / SR) * amp;
    let worstStep = 0;
    for (let i = 1; i < d.length; i++)
      worstStep = Math.max(worstStep, Math.abs((d[i] as number) - (d[i - 1] as number)));
    expect(worstStep).toBeLessThan(natural * 6);
  });
});
