import {
  autoHeadroomDb,
  bassBoostSpec,
  cloneSound,
  eqFilterSpecs,
  neutralSound,
  seededRng,
  type RoomType,
  type SoundSettings,
} from '@tuneshift/core';
import { impulseBuffer } from './ir';
import { createPitchNode, type StretchNode } from './pitch';

/** Time constant for parameter changes (spec: ~0.02–0.05 s). */
export const PARAM_TC = 0.025;
/** Stage bypass crossfade length (spec: ~30 ms). setTargetAtTime reaches 95 % in 3τ. */
export const BYPASS_SECONDS = 0.03;
const BYPASS_TC = BYPASS_SECONDS / 3;
/** Heavy stages (convolver, HRTF, worklet) are disconnected this long after going silent. */
const GATE_DELAY_MS = 250;

export const LIMITER = { threshold: -1, knee: 0, ratio: 20, attack: 0.001, release: 0.1 } as const;
/** Static safety clipper after the limiter: linear to 0.9, soft-saturates to ≤ 0.935 (−0.58 dBFS). */
export const CLIP_KNEE = 0.9;
export const CLIP_CEILING = 0.935;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g <= 0 ? -Infinity : 20 * Math.log10(g));

export interface ApplyOptions {
  /** Jump to values without ramps (first apply, offline renders). */
  immediate?: boolean;
}

export type PitchStatus = 'idle' | 'loading' | 'ready' | 'unavailable';

/** Connects/disconnects a heavy branch so idle stages cost no CPU (realtime contexts only). */
class Gate {
  private connected = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly from: AudioNode,
    private readonly to: AudioNode,
    private readonly realtime: boolean,
  ) {
    if (!realtime) this.open();
  }
  open(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.connected) {
      this.from.connect(this.to);
      this.connected = true;
    }
  }
  closeLater(): void {
    if (!this.realtime || !this.connected || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.from.disconnect(this.to);
      } catch {
        // already disconnected
      }
      this.connected = false;
    }, GATE_DELAY_MS);
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}

/** Dry/wet crossfade around a processing branch: input → dry → out, input → [proc] → wet → out. */
class Mix {
  readonly dry: GainNode;
  readonly wet: GainNode;
  readonly out: GainNode;
  constructor(ctx: BaseAudioContext, input: AudioNode, procOut: AudioNode) {
    this.dry = new GainNode(ctx, { gain: 1 });
    this.wet = new GainNode(ctx, { gain: 0 });
    this.out = stereoGain(ctx);
    input.connect(this.dry).connect(this.out);
    procOut.connect(this.wet).connect(this.out);
  }
}

function stereoGain(ctx: BaseAudioContext, gain = 1): GainNode {
  return new GainNode(ctx, {
    gain,
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
}

/** 2×2 channel matrix (L' = ll·L + rl·R, R' = rr·R + lr·L) via splitter/merger. */
class Matrix {
  readonly ll: GainNode;
  readonly rl: GainNode;
  readonly rr: GainNode;
  readonly lr: GainNode;
  readonly merger: ChannelMergerNode;
  constructor(ctx: BaseAudioContext, input: AudioNode) {
    const split = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });
    this.merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
    this.ll = new GainNode(ctx, { gain: 1 });
    this.rl = new GainNode(ctx, { gain: 0 });
    this.rr = new GainNode(ctx, { gain: 1 });
    this.lr = new GainNode(ctx, { gain: 0 });
    input.connect(split);
    split.connect(this.ll, 0).connect(this.merger, 0, 0);
    split.connect(this.rl, 1).connect(this.merger, 0, 0);
    split.connect(this.rr, 1).connect(this.merger, 0, 1);
    split.connect(this.lr, 0).connect(this.merger, 0, 1);
  }
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 8192;
  const curve = new Float32Array(n);
  const span = CLIP_CEILING - CLIP_KNEE;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= CLIP_KNEE ? a : CLIP_KNEE + span * Math.tanh((a - CLIP_KNEE) / span);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

function saturationCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/** Vinyl crackle + faint hiss loop (deterministic). */
function crackleBuffer(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 4);
  const buf = new AudioBuffer({ length: len, numberOfChannels: 2, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) {
    const rng = seededRng(1234 + ch);
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (rng() * 2 - 1) * 0.02;
    const pops = 120;
    for (let p = 0; p < pops; p++) {
      const at = Math.floor(rng() * (len - 400));
      const amp = (0.15 + rng() * 0.6) * (rng() > 0.5 ? 1 : -1);
      const decay = 20 + rng() * 120;
      for (let k = 0; k < 400; k++) d[at + k] = (d[at + k] as number) + amp * Math.exp(-k / decay);
    }
  }
  return buf;
}

/**
 * The Sound Lab signal chain (spec §4.1). Works on AudioContext and OfflineAudioContext, so the
 * same code drives live playback, export, the offline tests, desktop Boost and the extension.
 *
 * input → [pitch worklet] → preamp → EQ×10 → bass shelf → compressor → reverb send → widener
 *       → 8D (HRTF) → lo-fi → vocal reduce → A/B compare → normalisation → master → limiter
 *       → safety clipper → output (+ analyser tap)
 */
export class EffectChain {
  readonly ctx: BaseAudioContext;
  /** Connect sources here. Forced to 2-channel "speakers" up-mix so mono files stay centred. */
  readonly input: GainNode;
  /** Connect this to the destination. */
  readonly output: GainNode;
  readonly analyser: AnalyserNode;
  /** Pre-effects tap (loudness estimate for normalisation of remote streams). */
  readonly inputAnalyser: AnalyserNode;

  private readonly realtime: boolean;
  private settings: SoundSettings = neutralSound();
  private applied = false;

  // pitch
  private readonly pitchMix: Mix;
  private readonly pitchSend: GainNode;
  private readonly pitchReturn: GainNode;
  private readonly pitchGate: Gate;
  private pitchNode: StretchNode | null = null;
  private pitchPromise: Promise<void> | null = null;
  private _pitchStatus: PitchStatus = 'idle';
  private pitchError = '';
  private readonly pitchListeners = new Set<(s: PitchStatus) => void>();

  private readonly preamp: GainNode;
  private readonly eq: BiquadFilterNode[];
  private readonly bass: BiquadFilterNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly compMakeup: GainNode;
  private readonly compMix: Mix;

  // reverb
  private readonly revDry: GainNode;
  private readonly revWet: GainNode;
  private readonly preDelay: DelayNode;
  private readonly revGate: Gate;
  private readonly convs: [ConvolverNode, ConvolverNode];
  private readonly convGains: [GainNode, GainNode];
  private activeConv = 0;
  private room: RoomType | null = null;
  private readonly revTone: BiquadFilterNode;
  private readonly revOut: GainNode;

  private readonly widener: Matrix;

  // 8D
  private readonly e8Mix: Mix;
  private readonly e8Gate: Gate;
  private readonly e8Send: GainNode;
  private readonly oscs: OscillatorNode[];
  private readonly orbitX: GainNode;
  private readonly orbitZ: GainNode;
  private readonly wobbleY: GainNode;

  // lo-fi
  private readonly lofiMix: Mix;
  private readonly lofiGate: Gate;
  private readonly lofiSend: GainNode;
  private readonly lofiLP: BiquadFilterNode;
  private readonly lofiHP: BiquadFilterNode;
  private readonly wowDepth: GainNode;
  private readonly flutterDepth: GainNode;
  private readonly crackleGain: GainNode;

  // vocal reduce
  private readonly vocMix: Mix;
  private readonly vocMatrix: Matrix;

  // A/B compare + output
  private readonly compareGraph: GainNode;
  private readonly compareDry: GainNode;
  private comparing = false;
  private readonly norm: GainNode;
  private readonly master: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private readonly clipper: WaveShaperNode;
  private autoDb = 0;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.realtime = typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
    this.input = stereoGain(ctx);
    this.inputAnalyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0 });
    this.input.connect(this.inputAnalyser);

    // Pitch (bypassed unless independent mode with a non-zero shift).
    this.pitchSend = stereoGain(ctx);
    this.pitchReturn = stereoGain(ctx);
    this.pitchMix = new Mix(ctx, this.input, this.pitchReturn);
    this.pitchGate = new Gate(this.input, this.pitchSend, this.realtime);
    if (this.realtime) this.pitchGate.closeLater();

    this.preamp = stereoGain(ctx);
    this.pitchMix.out.connect(this.preamp);

    this.eq = Array.from(
      { length: 10 },
      () => new BiquadFilterNode(ctx, { type: 'peaking', Q: 1 }),
    );
    this.bass = new BiquadFilterNode(ctx, { type: 'lowshelf', frequency: 90, gain: 0 });
    let node: AudioNode = this.preamp;
    for (const f of this.eq) node = node.connect(f);
    node.connect(this.bass);

    // Compressor.
    this.comp = new DynamicsCompressorNode(ctx);
    this.compMakeup = new GainNode(ctx, { gain: 1 });
    this.comp.connect(this.compMakeup);
    this.bass.connect(this.comp);
    this.compMix = new Mix(ctx, this.bass, this.compMakeup);

    // Reverb send: dry + (pre-delay → A/B convolvers → tone → wet).
    this.revDry = new GainNode(ctx, { gain: 1 });
    this.revWet = new GainNode(ctx, { gain: 0 });
    this.revOut = stereoGain(ctx);
    this.preDelay = new DelayNode(ctx, { maxDelayTime: 0.2, delayTime: 0 });
    this.convs = [new ConvolverNode(ctx), new ConvolverNode(ctx)];
    this.convGains = [new GainNode(ctx, { gain: 1 }), new GainNode(ctx, { gain: 0 })];
    this.revTone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 18000, Q: 0 });
    this.compMix.out.connect(this.revDry).connect(this.revOut);
    this.convs.forEach((c, i) => {
      this.preDelay
        .connect(c)
        .connect(this.convGains[i] as GainNode)
        .connect(this.revTone);
    });
    this.revTone.connect(this.revWet).connect(this.revOut);
    this.revGate = new Gate(this.compMix.out, this.preDelay, this.realtime);

    // Stereo widener (mid/side matrix).
    this.widener = new Matrix(ctx, this.revOut);

    // 8D: HRTF panner orbiting the listener, positions driven by oscillators (not rAF).
    this.e8Send = stereoGain(ctx);
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'linear',
      refDistance: 1,
      maxDistance: 10000,
      rolloffFactor: 0,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
    });
    const e8Makeup = new GainNode(ctx, { gain: dbToGain(3) });
    this.e8Send.connect(panner).connect(e8Makeup);
    this.e8Mix = new Mix(ctx, this.widener.merger, e8Makeup);
    this.e8Gate = new Gate(this.widener.merger, this.e8Send, this.realtime);
    const sine = new OscillatorNode(ctx, { type: 'sine', frequency: 0.12 });
    const cosine = new OscillatorNode(ctx, {
      frequency: 0.12,
      periodicWave: new PeriodicWave(ctx, { real: [0, 1], imag: [0, 0] }),
    });
    const wobble = new OscillatorNode(ctx, { type: 'sine', frequency: 0.12 * 0.37 });
    this.orbitX = new GainNode(ctx, { gain: 1 });
    this.orbitZ = new GainNode(ctx, { gain: 1 });
    this.wobbleY = new GainNode(ctx, { gain: 0 });
    sine.connect(this.orbitX).connect(panner.positionX);
    cosine.connect(this.orbitZ).connect(panner.positionZ);
    wobble.connect(this.wobbleY).connect(panner.positionY);
    this.oscs = [sine, cosine, wobble];

    // Lo-fi: band-limit, wow/flutter (modulated delay), gentle saturation, crackle.
    this.lofiSend = stereoGain(ctx);
    this.lofiHP = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 30, Q: 0.7 });
    this.lofiLP = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 12000, Q: 0.5 });
    const wow = new DelayNode(ctx, { maxDelayTime: 0.05, delayTime: 0.012 });
    const wowLfo = new OscillatorNode(ctx, { type: 'sine', frequency: 0.55 });
    const flutterLfo = new OscillatorNode(ctx, { type: 'sine', frequency: 6.3 });
    this.wowDepth = new GainNode(ctx, { gain: 0 });
    this.flutterDepth = new GainNode(ctx, { gain: 0 });
    wowLfo.connect(this.wowDepth).connect(wow.delayTime);
    flutterLfo.connect(this.flutterDepth).connect(wow.delayTime);
    const sat = new WaveShaperNode(ctx, { curve: saturationCurve(1.6), oversample: '2x' });
    const lofiOut = stereoGain(ctx);
    this.lofiSend
      .connect(this.lofiHP)
      .connect(this.lofiLP)
      .connect(wow)
      .connect(sat)
      .connect(lofiOut);
    const crackle = new AudioBufferSourceNode(ctx, { buffer: crackleBuffer(ctx), loop: true });
    this.crackleGain = new GainNode(ctx, { gain: 0 });
    crackle.connect(this.crackleGain).connect(lofiOut);
    this.lofiMix = new Mix(ctx, this.e8Mix.out, lofiOut);
    this.lofiGate = new Gate(this.e8Mix.out, this.lofiSend, this.realtime);
    this.oscs.push(wowLfo, flutterLfo);
    this.sources.push(crackle);

    // Vocal reduce: keep < 150 Hz intact (LR4 crossover), cancel the centre above it.
    const vocLow = [
      new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 150, Q: Math.SQRT1_2 }),
      new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 150, Q: Math.SQRT1_2 }),
    ] as const;
    const vocHigh = [
      new BiquadFilterNode(ctx, { type: 'highpass', frequency: 150, Q: Math.SQRT1_2 }),
      new BiquadFilterNode(ctx, { type: 'highpass', frequency: 150, Q: Math.SQRT1_2 }),
    ] as const;
    const vocOut = stereoGain(ctx);
    this.lofiMix.out.connect(vocLow[0]).connect(vocLow[1]).connect(vocOut);
    this.lofiMix.out.connect(vocHigh[0]).connect(vocHigh[1]);
    this.vocMatrix = new Matrix(ctx, vocHigh[1]);
    this.vocMatrix.merger.connect(vocOut);
    this.vocMix = new Mix(ctx, this.lofiMix.out, vocOut);

    // A/B compare: graph vs the untouched input.
    this.compareGraph = new GainNode(ctx, { gain: 1 });
    this.compareDry = new GainNode(ctx, { gain: 0 });
    this.norm = stereoGain(ctx);
    this.vocMix.out.connect(this.compareGraph).connect(this.norm);
    this.input.connect(this.compareDry).connect(this.norm);

    this.master = new GainNode(ctx, { gain: 1 });
    this.limiter = new DynamicsCompressorNode(ctx, { ...LIMITER });
    this.clipper = new WaveShaperNode(ctx, { curve: softClipCurve(), oversample: 'none' });
    this.output = stereoGain(ctx);
    this.analyser = new AnalyserNode(ctx, { fftSize: 2048, smoothingTimeConstant: 0.8 });
    this.norm.connect(this.master).connect(this.limiter).connect(this.clipper).connect(this.output);
    this.clipper.connect(this.analyser);

    const t0 = ctx.currentTime;
    for (const o of [...this.oscs, ...this.sources]) o.start(t0);
    this.apply(this.settings, { immediate: true });
    this.applied = false;
  }

  get current(): SoundSettings {
    return cloneSound(this.settings);
  }

  get pitchStatus(): PitchStatus {
    return this._pitchStatus;
  }

  get pitchUnavailableReason(): string {
    return this.pitchError;
  }

  onPitchStatus(fn: (s: PitchStatus) => void): () => void {
    this.pitchListeners.add(fn);
    return () => this.pitchListeners.delete(fn);
  }

  /** Loads the pitch worklet if `s` needs it. Awaited by offline renders before rendering. */
  async prepare(s: SoundSettings): Promise<void> {
    if (needsPitch(s)) await this.ensurePitch();
  }

  private setPitchStatus(s: PitchStatus) {
    this._pitchStatus = s;
    this.pitchListeners.forEach((l) => l(s));
  }

  private ensurePitch(): Promise<void> {
    if (this.pitchPromise) return this.pitchPromise;
    this.setPitchStatus('loading');
    this.pitchPromise = createPitchNode(this.ctx)
      .then((node) => {
        this.pitchNode = node;
        this.pitchSend.connect(node).connect(this.pitchReturn);
        this.setPitchStatus('ready');
        this.apply(this.settings, { immediate: !this.realtime });
      })
      .catch((e: unknown) => {
        this.pitchError = e instanceof Error ? e.message : String(e);
        this.setPitchStatus('unavailable');
      });
    return this.pitchPromise;
  }

  private ramp(p: AudioParam, v: number, immediate: boolean, tc = PARAM_TC): void {
    const now = this.ctx.currentTime;
    if (!Number.isFinite(v)) return;
    if (immediate) {
      p.cancelScheduledValues(0);
      p.setValueAtTime(v, now);
      return;
    }
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now);
    else p.cancelScheduledValues(now);
    p.setTargetAtTime(v, now, tc);
  }

  private crossfade(m: Mix, on: boolean, immediate: boolean): void {
    this.ramp(m.dry.gain, on ? 0 : 1, immediate, BYPASS_TC);
    this.ramp(m.wet.gain, on ? 1 : 0, immediate, BYPASS_TC);
  }

  /** Apply a full sound. Every change is ramped; stage toggles crossfade over ~30 ms. */
  apply(s: SoundSettings, opts: ApplyOptions = {}): void {
    const im = opts.immediate === true || !this.applied;
    this.applied = true;
    this.settings = cloneSound(s);
    const ctx = this.ctx;

    // Pitch worklet.
    const wantPitch = needsPitch(s);
    if (wantPitch && this._pitchStatus === 'idle') void this.ensurePitch();
    const pitchOn = wantPitch && this.pitchNode !== null;
    if (pitchOn) {
      this.pitchGate.open();
      void this.pitchNode?.schedule({
        active: true,
        semitones: s.pitchSemitones,
        output: ctx.currentTime,
      });
    }
    this.crossfade(this.pitchMix, pitchOn, im);
    if (!pitchOn) this.pitchGate.closeLater();

    // Preamp + automatic headroom.
    this.autoDb = autoHeadroomDb(s);
    this.ramp(this.preamp.gain, dbToGain(s.preampDb + this.autoDb), im);

    // EQ.
    eqFilterSpecs(s).forEach((spec, i) => {
      const f = this.eq[i] as BiquadFilterNode;
      if (f.type !== spec.type) f.type = spec.type;
      this.ramp(f.frequency, spec.freq, im);
      this.ramp(f.Q, spec.q, im);
      this.ramp(f.gain, spec.gainDb, im);
    });
    const bass = bassBoostSpec(s);
    this.ramp(this.bass.gain, bass.gainDb, im);

    // Compressor.
    const c = s.compressor;
    this.ramp(this.comp.threshold, c.threshold, im);
    this.ramp(this.comp.knee, c.knee, im);
    this.ramp(this.comp.ratio, c.ratio, im);
    this.ramp(this.comp.attack, c.attack, im);
    this.ramp(this.comp.release, c.release, im);
    this.ramp(this.compMakeup.gain, dbToGain(-c.threshold * (1 - 1 / c.ratio) * 0.3), im);
    this.crossfade(this.compMix, c.enabled, im);

    // Reverb.
    const r = s.reverb;
    const revOn = r.amount > 0.001;
    if (revOn) {
      this.revGate.open();
      this.setRoom(r.room, im);
    }
    this.ramp(this.revWet.gain, revOn ? r.amount * 1.4 : 0, im);
    this.ramp(this.revDry.gain, 1 - r.amount * 0.45, im);
    this.ramp(this.preDelay.delayTime, r.preDelayMs / 1000, im);
    this.ramp(this.revTone.frequency, 1500 * Math.pow(18000 / 1500, r.tone), im);
    if (!revOn) this.revGate.closeLater();

    // Widener: L' = L(1+w)/2 + R(1−w)/2.
    const w = s.widener;
    this.ramp(this.widener.ll.gain, (1 + w) / 2, im);
    this.ramp(this.widener.rr.gain, (1 + w) / 2, im);
    this.ramp(this.widener.rl.gain, (1 - w) / 2, im);
    this.ramp(this.widener.lr.gain, (1 - w) / 2, im);

    // 8D.
    const e = s.eightD;
    if (e.enabled) this.e8Gate.open();
    for (const o of this.oscs.slice(0, 2)) this.ramp(o.frequency, e.speedHz, im);
    this.ramp((this.oscs[2] as OscillatorNode).frequency, e.speedHz * 0.37, im);
    this.ramp(this.orbitX.gain, e.radius, im);
    this.ramp(this.orbitZ.gain, e.radius, im);
    this.ramp(this.wobbleY.gain, e.heightWobble ? e.radius * 0.45 : 0, im);
    this.crossfade(this.e8Mix, e.enabled, im);
    if (!e.enabled) this.e8Gate.closeLater();

    // Lo-fi.
    const lf = s.lofi;
    const amt = lf.enabled ? lf.amount : 0;
    if (lf.enabled) this.lofiGate.open();
    this.ramp(this.lofiLP.frequency, 12000 * Math.pow(3000 / 12000, amt), im);
    this.ramp(this.lofiHP.frequency, 30 + 120 * amt, im);
    this.ramp(this.wowDepth.gain, 0.0022 * amt, im);
    this.ramp(this.flutterDepth.gain, 0.0003 * amt, im);
    this.ramp(this.crackleGain.gain, 0.18 * amt, im);
    this.crossfade(this.lofiMix, lf.enabled, im);
    if (!lf.enabled) this.lofiGate.closeLater();

    // Vocal reduce: L' = L(1 − a/2) − R(a/2) on the band above 150 Hz.
    const a = s.vocalReduce.enabled ? s.vocalReduce.amount : 0;
    this.ramp(this.vocMatrix.ll.gain, 1 - a / 2, im);
    this.ramp(this.vocMatrix.rr.gain, 1 - a / 2, im);
    this.ramp(this.vocMatrix.rl.gain, -a / 2, im);
    this.ramp(this.vocMatrix.lr.gain, -a / 2, im);
    this.crossfade(this.vocMix, s.vocalReduce.enabled, im);
  }

  private setRoom(room: RoomType, immediate: boolean): void {
    if (this.room === room) return;
    const buf = impulseBuffer(room, this.ctx.sampleRate);
    if (this.room === null || immediate) {
      const conv = this.convs[this.activeConv] as ConvolverNode;
      conv.buffer = buf;
      this.room = room;
      return;
    }
    // Load the idle convolver and crossfade to it (no click on room change).
    const next = 1 - this.activeConv;
    (this.convs[next] as ConvolverNode).buffer = buf;
    this.ramp((this.convGains[next] as GainNode).gain, 1, false, 0.05);
    this.ramp((this.convGains[this.activeConv] as GainNode).gain, 0, false, 0.05);
    this.activeConv = next;
    this.room = room;
  }

  /** A/B compare: while on, the untouched input is heard (crossfaded). */
  setCompare(on: boolean): void {
    if (on === this.comparing) return;
    this.comparing = on;
    this.ramp(this.compareGraph.gain, on ? 0 : 1, false, BYPASS_TC);
    this.ramp(this.compareDry.gain, on ? 1 : 0, false, BYPASS_TC);
  }

  get isComparing(): boolean {
    return this.comparing;
  }

  /** Master volume 0..1 (perceptual square curve) and mute. */
  setVolume(volume: number, muted = false, immediate = false): void {
    const v = Math.max(0, Math.min(1, volume));
    this.ramp(this.master.gain, muted ? 0 : v * v, immediate);
  }

  /** Loudness-normalisation offset (dB). */
  setNormalization(db: number, immediate = false): void {
    this.ramp(this.norm.gain, dbToGain(db), immediate, 0.3);
  }

  /** Auto-headroom reduction (≤ 0 dB) and live limiter gain reduction (≤ 0 dB) for the meter. */
  headroom(): { autoDb: number; limiterDb: number } {
    return { autoDb: this.autoDb, limiterDb: this.limiter.reduction };
  }

  dispose(): void {
    for (const s of [...this.oscs, ...this.sources]) {
      try {
        s.stop();
      } catch {
        // not started
      }
    }
    [this.pitchGate, this.revGate, this.e8Gate, this.lofiGate].forEach((g) => g.dispose());
    try {
      this.output.disconnect();
      this.input.disconnect();
    } catch {
      // ignore
    }
  }
}

export function needsPitch(s: SoundSettings): boolean {
  return s.pitchMode === 'independent' && Math.abs(s.pitchSemitones) > 0.001;
}
