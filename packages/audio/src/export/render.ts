import { cloneSound, tapeSemitones, type SoundSettings } from '@tuneshift/core';
import { EffectChain } from '../chain';
import { ROOMS } from '../ir';

export interface RenderOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/** Seconds of tail to keep after the input ends (reverb decay, lo-fi delay). */
export function tailSeconds(s: SoundSettings): number {
  let tail = 0.25;
  if (s.reverb.amount > 0.001)
    tail = Math.max(tail, ROOMS[s.reverb.room].seconds + s.reverb.preDelayMs / 1000);
  return tail;
}

/**
 * Renders `input` through an OfflineAudioContext copy of the live chain (spec §4.8).
 * Tape speed → AudioBufferSourceNode.playbackRate. Independent mode keeps the tempo change and
 * compensates the source's pitch shift in the worklet so pitch follows `pitchSemitones`.
 */
export async function renderWithEffects(
  input: AudioBuffer,
  settings: SoundSettings,
  opts: RenderOptions = {},
): Promise<AudioBuffer> {
  const sr = input.sampleRate;
  const rate = settings.speed;
  const s = cloneSound(settings);
  if (s.pitchMode === 'independent') {
    s.pitchSemitones = s.pitchSemitones - tapeSemitones(rate);
    if (Math.abs(s.pitchSemitones) < 0.001) s.pitchSemitones = 0;
  }
  const seconds = input.duration / rate + tailSeconds(settings) + 0.05;
  const length = Math.ceil(seconds * sr);
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length, sampleRate: sr });
  const chain = new EffectChain(ctx);
  await chain.prepare(s);
  if (
    s.pitchMode === 'independent' &&
    Math.abs(s.pitchSemitones) > 0.001 &&
    chain.pitchStatus !== 'ready'
  ) {
    throw new Error(
      `Pitch shifting is unavailable: ${chain.pitchUnavailableReason || 'worklet failed to load'}`,
    );
  }
  chain.apply(s, { immediate: true });
  chain.setVolume(1, false, true);
  const src = new AudioBufferSourceNode(ctx, { buffer: input, playbackRate: rate });
  src.connect(chain.input);
  chain.output.connect(ctx.destination);
  src.start(0);

  const quantum = 128 / sr;
  if (opts.onProgress || opts.signal) {
    const steps = Math.min(100, Math.max(4, Math.floor(seconds / 1.5)));
    for (let i = 1; i < steps; i++) {
      const t = Math.floor((seconds * i) / steps / quantum) * quantum;
      if (t <= 0 || t >= seconds) continue;
      ctx
        .suspend(t)
        .then(() => {
          opts.onProgress?.(i / steps);
          if (opts.signal?.aborted) return; // leave suspended: rendering never resolves → caller rejects
          return ctx.resume();
        })
        .catch(() => {
          // duplicate suspend times can reject; ignore
        });
    }
  }
  const rendering = ctx.startRendering();
  const out = opts.signal
    ? await Promise.race([
        rendering,
        new Promise<never>((_, reject) =>
          opts.signal?.addEventListener('abort', () =>
            reject(new DOMException('Export cancelled', 'AbortError')),
          ),
        ),
      ])
    : await rendering;
  opts.onProgress?.(1);
  return trimTail(out, sr);
}

/** Drop trailing near-silence (keeps ≥ 50 ms after the last audible sample). */
function trimTail(buf: AudioBuffer, sr: number): AudioBuffer {
  const threshold = Math.pow(10, -80 / 20);
  let last = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = d.length - 1; i > last; i--) {
      if (Math.abs(d[i] as number) > threshold) {
        last = i;
        break;
      }
    }
  }
  const keep = Math.min(buf.length, last + Math.floor(0.05 * sr));
  if (keep >= buf.length - 1) return buf;
  const out = new AudioBuffer({
    length: Math.max(1, keep),
    numberOfChannels: buf.numberOfChannels,
    sampleRate: sr,
  });
  for (let ch = 0; ch < buf.numberOfChannels; ch++)
    out.copyToChannel(buf.getChannelData(ch).subarray(0, keep), ch);
  return out;
}

/** Decode any browser-supported audio file to an AudioBuffer. */
export async function decodeFile(data: ArrayBuffer, sampleRate = 48000): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 1, sampleRate });
  return ctx.decodeAudioData(data);
}
