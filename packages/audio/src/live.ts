import { liveInputSound, type SoundSettings } from '@tuneshift/core';
import { EffectChain } from './chain';

export interface LiveStats {
  /** Input level (dBFS, peak over the last frame). */
  inputDb: number;
  /** Output latency estimate in ms (context base + output latency). */
  latencyMs: number;
}

/**
 * Applies the Sound Lab to a live MediaStream (desktop Boost mode via a virtual cable, or the
 * extension's captured tab). Low-latency context; speed is impossible on live audio, so tape
 * speed becomes a pitch shift through the worklet. Nothing here records or exports audio.
 */
export class LiveInputEngine {
  readonly ctx: AudioContext;
  readonly chain: EffectChain;
  private source: MediaStreamAudioSourceNode | null = null;
  private readonly meter: AnalyserNode;
  private readonly meterBuf: Float32Array<ArrayBuffer>;

  constructor(opts: { sampleRate?: number } = {}) {
    this.ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: opts.sampleRate });
    this.chain = new EffectChain(this.ctx);
    this.chain.output.connect(this.ctx.destination);
    this.meter = new AnalyserNode(this.ctx, { fftSize: 1024 });
    this.meterBuf = new Float32Array(this.meter.fftSize);
  }

  attach(stream: MediaStream): void {
    this.detach();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.chain.input);
    this.source.connect(this.meter);
  }

  detach(): void {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
  }

  get attached(): boolean {
    return this.source !== null;
  }

  setSound(s: SoundSettings, tapeToPitch = true): void {
    this.chain.apply(liveInputSound(s, { tapeToPitch }));
  }

  setVolume(v: number, muted = false): void {
    this.chain.setVolume(v, muted);
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  async setSinkId(id: string): Promise<void> {
    const c = this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
    if (c.setSinkId) await c.setSinkId(id);
  }

  stats(): LiveStats {
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let peak = 0;
    for (let i = 0; i < this.meterBuf.length; i++)
      peak = Math.max(peak, Math.abs(this.meterBuf[i] as number));
    const c = this.ctx as AudioContext & { outputLatency?: number };
    return {
      inputDb: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      latencyMs: Math.round(((this.ctx.baseLatency || 0) + (c.outputLatency || 0)) * 1000),
    };
  }

  async close(): Promise<void> {
    this.detach();
    this.chain.dispose();
    await this.ctx.close();
  }
}
