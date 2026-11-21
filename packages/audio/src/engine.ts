import { cloneSound, neutralSound, tapeOnly, type SoundSettings } from '@tuneshift/core';
import { EffectChain } from './chain';

/**
 * 'fx'     — element routed through Web Audio (needs CORS or a local blob): full Sound Lab.
 * 'direct' — plain element to the speakers (CORS-less hosts, or Background-safe mode while
 *            hidden): only tape speed/pitch via playbackRate works.
 */
export type DeckMode = 'fx' | 'direct';

export interface LoadRequest {
  url: string;
  mode: DeckMode;
  /** Opaque id of what is loaded (track key). */
  key: string;
  startAt?: number;
}

export interface EngineErrorInfo {
  key: string;
  url: string;
  mode: DeckMode;
  code: number;
  message: string;
  /** Remote URL failing in fx mode — probably no CORS headers. */
  corsSuspect: boolean;
}

export interface EngineEvents {
  timeupdate: { time: number; duration: number };
  durationchange: { duration: number };
  play: undefined;
  pause: undefined;
  waiting: undefined;
  playing: undefined;
  ended: { key: string };
  error: EngineErrorInfo;
  /** play() was refused (autoplay policy / suspended context) — show "Tap to start audio". */
  blocked: undefined;
  contextstate: { state: AudioContextState | 'none' };
  /** The active deck changed (crossfade/gapless start). */
  deckswitch: { key: string };
}

type Listener<K extends keyof EngineEvents> = (payload: EngineEvents[K]) => void;

interface Deck {
  fx: HTMLAudioElement;
  direct: HTMLAudioElement;
  /** Fade gain for the fx path (crossfades). */
  gain: GainNode | null;
  source: MediaElementAudioSourceNode | null;
  /** Fade value for the direct path (multiplied into element.volume). */
  fade: number;
  mode: DeckMode;
  /** The mode the track really supports (Background-safe may temporarily use 'direct'). */
  nativeMode: DeckMode;
  key: string | null;
  url: string | null;
}

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQIAAAAAAA==';

function makeElement(crossOrigin: boolean): HTMLAudioElement {
  const el = new Audio();
  el.preload = 'auto';
  // Must be set BEFORE src (spec §3): the element then makes CORS requests.
  if (crossOrigin) el.crossOrigin = 'anonymous';
  return el;
}

function setPitchFlags(el: HTMLAudioElement, preserve: boolean): void {
  el.preservesPitch = preserve;
  const v = el as HTMLAudioElement & {
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
  };
  v.webkitPreservesPitch = preserve;
  v.mozPreservesPitch = preserve;
}

const equalPower = (n: number, fadeIn: boolean): Float32Array<ArrayBuffer> => {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    c[i] = fadeIn ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
  }
  return c;
};

/**
 * Two-deck player on one AudioContext + one EffectChain. Queue logic lives in the app's player
 * controller; this class only plays, preloads, crossfades and applies the sound.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private _chain: EffectChain | null = null;
  private readonly decks: [Deck, Deck];
  private active = 0;
  private sound: SoundSettings = neutralSound();
  private volume = 0.8;
  private muted = false;
  private normDb = 0;
  private comparing = false;
  private backgroundSafe = false;
  private hiddenHandoff = false;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private crossfadeEnd: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Map<keyof EngineEvents, Set<Listener<never>>>();
  private sinkId = '';

  constructor() {
    this.decks = [this.makeDeck(), this.makeDeck()];
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
  }

  private makeDeck(): Deck {
    const deck: Deck = {
      fx: makeElement(true),
      direct: makeElement(false),
      gain: null,
      source: null,
      fade: 1,
      mode: 'fx',
      nativeMode: 'fx',
      key: null,
      url: null,
    };
    for (const el of [deck.fx, deck.direct]) this.wire(deck, el);
    return deck;
  }

  private isActiveEl(deck: Deck, el: HTMLAudioElement): boolean {
    return this.decks[this.active] === deck && deck[deck.mode] === el;
  }

  private wire(deck: Deck, el: HTMLAudioElement): void {
    const fwd = <K extends keyof EngineEvents>(
      type: string,
      name: K,
      payload: () => EngineEvents[K],
    ) =>
      el.addEventListener(type, () => {
        if (this.isActiveEl(deck, el)) this.emit(name, payload());
      });
    fwd('timeupdate', 'timeupdate', () => ({ time: el.currentTime, duration: el.duration }));
    fwd('durationchange', 'durationchange', () => ({ duration: el.duration }));
    fwd('play', 'play', () => undefined);
    fwd('pause', 'pause', () => undefined);
    fwd('waiting', 'waiting', () => undefined);
    fwd('playing', 'playing', () => undefined);
    el.addEventListener('ended', () => {
      if (this.isActiveEl(deck, el)) this.emit('ended', { key: deck.key ?? '' });
    });
    el.addEventListener('error', () => {
      if (!this.isActiveEl(deck, el) || !deck.url || el.getAttribute('src') === null) return;
      const err = el.error;
      const remote = /^https?:/i.test(deck.url) && !deck.url.startsWith(location.origin);
      this.emit('error', {
        key: deck.key ?? '',
        url: deck.url,
        mode: deck.mode,
        code: err?.code ?? 0,
        message: err?.message || 'Playback error',
        corsSuspect: deck.mode === 'fx' && remote,
      });
    });
  }

  on<K extends keyof EngineEvents>(name: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(fn as Listener<never>);
    return () => set.delete(fn as Listener<never>);
  }

  private emit<K extends keyof EngineEvents>(name: K, payload: EngineEvents[K]): void {
    this.listeners.get(name)?.forEach((fn) => (fn as Listener<K>)(payload));
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get chain(): EffectChain | null {
    return this._chain;
  }

  get contextState(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  /** Create/resume the AudioContext. Call from a user gesture (play button, "Tap to start"). */
  async unlock(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext({ latencyHint: 'playback' });
      this.ctx = ctx;
      const chain = new EffectChain(ctx);
      this._chain = chain;
      chain.output.connect(ctx.destination);
      chain.apply(this.effectiveSound(), { immediate: true });
      chain.setVolume(this.volume, this.muted, true);
      chain.setNormalization(this.normDb, true);
      for (const deck of this.decks) {
        deck.source = ctx.createMediaElementSource(deck.fx);
        deck.gain = new GainNode(ctx, { gain: deck === this.decks[this.active] ? 1 : 0 });
        deck.source.connect(deck.gain).connect(chain.input);
      }
      ctx.addEventListener('statechange', () => this.emit('contextstate', { state: ctx.state }));
      if (this.sinkId) await this.applySink(this.sinkId);
      // Prime the direct elements inside this gesture so Background-safe hand-offs may play later.
      await Promise.all(
        this.decks.map(async (d) => {
          if (d.direct.getAttribute('src')) return;
          d.direct.src = SILENT_WAV;
          d.direct.muted = true;
          try {
            await d.direct.play();
          } catch {
            // ignore: priming is best effort
          }
          d.direct.pause();
          d.direct.removeAttribute('src');
          d.direct.load();
          d.direct.muted = false;
        }),
      );
    }
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        // resume() outside a gesture can reject; state stays suspended → UI shows the prompt
      }
    }
    this.emit('contextstate', { state: this.ctx.state });
  }

  private get deck(): Deck {
    return this.decks[this.active] as Deck;
  }

  private get other(): Deck {
    return this.decks[1 - this.active] as Deck;
  }

  get activeElement(): HTMLAudioElement {
    return this.deck[this.deck.mode];
  }

  get loadedKey(): string | null {
    return this.deck.key;
  }

  get preloadedKey(): string | null {
    return this.other.key;
  }

  get mode(): DeckMode {
    return this.deck.nativeMode;
  }

  /** Mode actually producing sound right now (Background-safe may differ from `mode`). */
  get outputMode(): DeckMode {
    return this.deck.mode;
  }

  get currentTime(): number {
    return this.activeElement.currentTime || 0;
  }

  get duration(): number {
    const d = this.activeElement.duration;
    return Number.isFinite(d) ? d : 0;
  }

  get paused(): boolean {
    return this.activeElement.paused;
  }

  get playbackRate(): number {
    return this.activeElement.playbackRate;
  }

  private effectiveSound(): SoundSettings {
    return this.sound;
  }

  /** Load a track into the active deck (stops any crossfade and clears the preload). */
  async load(req: LoadRequest, autoplay: boolean): Promise<void> {
    this.cancelCrossfade();
    const deck = this.deck;
    this.resetDeck(this.other);
    for (const el of [deck.fx, deck.direct]) {
      el.pause();
    }
    deck.key = req.key;
    deck.url = req.url;
    deck.nativeMode = req.mode;
    deck.mode = this.hiddenHandoff ? 'direct' : req.mode;
    deck.fade = 1;
    if (deck.gain && this.ctx) {
      deck.gain.gain.cancelScheduledValues(0);
      deck.gain.gain.setValueAtTime(1, this.ctx.currentTime);
    }
    const idle = deck.mode === 'fx' ? deck.direct : deck.fx;
    idle.removeAttribute('src');
    idle.load();
    const el = deck[deck.mode];
    el.src = req.url;
    this.applyRate(el);
    this.applyDirectVolume(deck);
    if (req.startAt && req.startAt > 0) {
      const at = req.startAt;
      el.addEventListener(
        'loadedmetadata',
        () => {
          el.currentTime = Math.min(at, Math.max(0, (el.duration || at) - 0.5));
        },
        { once: true },
      );
    }
    el.load();
    if (autoplay) await this.play();
  }

  async play(): Promise<void> {
    if (this.deck.mode === 'fx') await this.unlock();
    try {
      await this.activeElement.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError')
        this.emit('blocked', undefined);
      else if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    }
  }

  pause(): void {
    this.activeElement.pause();
    if (this.crossfadeEnd) this.other[this.other.mode].pause();
  }

  seek(sec: number): void {
    const el = this.activeElement;
    const d = Number.isFinite(el.duration) ? el.duration : sec + 1;
    el.currentTime = Math.max(0, Math.min(sec, Math.max(0, d - 0.05)));
  }

  /** Stop and unload everything. */
  stop(): void {
    this.cancelCrossfade();
    for (const d of this.decks) this.resetDeck(d);
  }

  private resetDeck(d: Deck): void {
    for (const el of [d.fx, d.direct]) {
      el.pause();
      if (el.getAttribute('src')) {
        el.removeAttribute('src');
        el.load();
      }
    }
    d.key = null;
    d.url = null;
  }

  /** Preload the next track into the idle deck (spec: ~15 s before the end). */
  preload(req: LoadRequest): void {
    if (this.crossfadeEnd) return;
    const d = this.other;
    if (d.key === req.key && d.url === req.url) return;
    this.resetDeck(d);
    d.key = req.key;
    d.url = req.url;
    d.nativeMode = req.mode;
    d.mode = this.hiddenHandoff ? 'direct' : req.mode;
    d.fade = 0;
    if (d.gain && this.ctx) {
      d.gain.gain.cancelScheduledValues(0);
      d.gain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
    const el = d[d.mode];
    el.src = req.url;
    this.applyRate(el);
    this.applyDirectVolume(d);
    el.load();
  }

  clearPreload(): void {
    if (!this.crossfadeEnd) this.resetDeck(this.other);
  }

  /**
   * Start the preloaded deck. `seconds` = 0 → gapless switch; otherwise an equal-power
   * crossfade. Returns false if nothing is preloaded.
   */
  async startPreloaded(seconds: number): Promise<boolean> {
    const from = this.deck;
    const to = this.other;
    if (!to.key || !to.url) return false;
    this.cancelCrossfade();
    const fromEl = from[from.mode];
    const toEl = to[to.mode];
    this.active = 1 - this.active;
    this.applyRate(toEl);
    if (seconds <= 0.05) {
      this.setDeckFade(to, 1, 0);
      this.setDeckFade(from, 0, 0);
      fromEl.pause();
      await this.playEl(toEl);
      this.resetDeck(from);
      this.emit('deckswitch', { key: to.key });
      return true;
    }
    this.setDeckFade(to, 0, 0);
    await this.playEl(toEl);
    this.setDeckFade(to, 1, seconds);
    this.setDeckFade(from, 0, seconds);
    this.emit('deckswitch', { key: to.key });
    this.crossfadeEnd = setTimeout(
      () => {
        this.crossfadeEnd = null;
        this.resetDeck(from);
      },
      seconds * 1000 + 50,
    );
    return true;
  }

  private async playEl(el: HTMLAudioElement): Promise<void> {
    if (el === this.deck.fx) await this.unlock();
    try {
      await el.play();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError')
        this.emit('blocked', undefined);
    }
  }

  get isCrossfading(): boolean {
    return this.crossfadeEnd !== null;
  }

  private cancelCrossfade(): void {
    if (this.crossfadeEnd) {
      clearTimeout(this.crossfadeEnd);
      this.crossfadeEnd = null;
      this.resetDeck(this.other);
    }
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    const d = this.deck;
    this.setDeckFade(d, 1, 0);
  }

  /** Fade a deck (both paths) to `target` over `seconds` with an equal-power curve. */
  private setDeckFade(d: Deck, target: number, seconds: number): void {
    const ctx = this.ctx;
    if (d.gain && ctx) {
      const g = d.gain.gain;
      g.cancelScheduledValues(0);
      if (seconds <= 0) g.setValueAtTime(target, ctx.currentTime);
      else {
        const from = g.value;
        const n = Math.max(2, Math.round(seconds * 50));
        const curve = equalPower(n, target > from);
        // Scale the canonical curve between the current and target values.
        for (let i = 0; i < n; i++) {
          const c = curve[i] as number;
          curve[i] = target > from ? from + (target - from) * c : target + (from - target) * c;
        }
        g.setValueCurveAtTime(curve, ctx.currentTime, seconds);
      }
    }
    if (seconds <= 0) {
      d.fade = target;
      this.applyDirectVolume(d);
      return;
    }
    const start = performance.now();
    const from = d.fade;
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
      const c = target > from ? Math.sin((t * Math.PI) / 2) : 1 - Math.cos((t * Math.PI) / 2);
      d.fade = from + (target - from) * c;
      this.applyDirectVolume(d);
      return t >= 1;
    };
    const timer = setInterval(() => {
      if (step()) clearInterval(timer);
    }, 40);
  }

  private applyDirectVolume(d: Deck): void {
    const v = this.muted ? 0 : this.volume * this.volume;
    // Positive normalisation can't be applied to element volume (max 1); negative can.
    const norm = Math.min(1, Math.pow(10, Math.min(0, this.normDb) / 20));
    d.direct.volume = Math.max(0, Math.min(1, v * d.fade * norm));
    d.direct.muted = this.muted;
  }

  private applyRate(el: HTMLAudioElement): void {
    const rate = this.comparing ? 1 : this.sound.speed;
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
    setPitchFlags(el, this.sound.pitchMode === 'independent');
  }

  /** Apply a sound: tape speed/pitch flags on the elements, everything else in the graph. */
  setSound(s: SoundSettings): void {
    this.sound = cloneSound(s);
    for (const d of this.decks) for (const el of [d.fx, d.direct]) this.applyRate(el);
    this._chain?.apply(this.effectiveSound());
  }

  get currentSound(): SoundSettings {
    return cloneSound(this.sound);
  }

  /** What the listener actually hears right now (Limited mode drops everything but tape speed). */
  get audibleSound(): SoundSettings {
    return this.deck.mode === 'direct' ? tapeOnly(this.sound) : cloneSound(this.sound);
  }

  /** A/B compare (hold): original speed and an untouched signal while on. */
  setCompare(on: boolean): void {
    if (this.comparing === on) return;
    this.comparing = on;
    for (const d of this.decks) for (const el of [d.fx, d.direct]) this.applyRate(el);
    this._chain?.setCompare(on);
  }

  setVolume(volume: number, muted: boolean): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.muted = muted;
    this._chain?.setVolume(this.volume, this.muted);
    for (const d of this.decks) this.applyDirectVolume(d);
  }

  setNormalization(db: number): void {
    this.normDb = db;
    this._chain?.setNormalization(db);
    for (const d of this.decks) this.applyDirectVolume(d);
  }

  /** Output device (setSinkId) where supported. */
  async setSinkId(id: string): Promise<boolean> {
    this.sinkId = id;
    return this.applySink(id);
  }

  private async applySink(id: string): Promise<boolean> {
    let ok = true;
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    try {
      if (ctx?.setSinkId) await ctx.setSinkId(id);
      for (const d of this.decks) {
        const el = d.direct as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
        if (el.setSinkId) await el.setSinkId(id);
        else ok = false;
      }
    } catch {
      ok = false;
    }
    return ok;
  }

  static supportsSinkSelection(): boolean {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  /**
   * Background-safe mode (spec §11.1): while the page is hidden, hand playback to the plain
   * element (tape speed keeps working) because iOS suspends Web Audio in the background.
   */
  setBackgroundSafe(enabled: boolean): void {
    this.backgroundSafe = enabled;
    if (!enabled && this.hiddenHandoff) void this.handoff(false);
  }

  private onVisibility = (): void => {
    if (!this.backgroundSafe) return;
    void this.handoff(document.visibilityState === 'hidden');
  };

  private async handoff(hidden: boolean): Promise<void> {
    const d = this.deck;
    if (hidden === this.hiddenHandoff) return;
    this.hiddenHandoff = hidden;
    if (!d.url || d.nativeMode === 'direct') return;
    const target: DeckMode = hidden ? 'direct' : 'fx';
    if (d.mode === target) return;
    const fromEl = d[d.mode];
    const toEl = d[target];
    const wasPlaying = !fromEl.paused;
    const t = fromEl.currentTime;
    if (toEl.getAttribute('src') !== d.url) toEl.src = d.url;
    this.applyRate(toEl);
    try {
      toEl.currentTime = t;
    } catch {
      // not seekable yet; continues from 0 — rare
    }
    d.mode = target;
    this.applyDirectVolume(d);
    if (wasPlaying) {
      if (target === 'fx') await this.unlock();
      try {
        await toEl.play();
      } catch {
        // keep the old element going if the new one can't start
        d.mode = target === 'fx' ? 'direct' : 'fx';
        return;
      }
    }
    fromEl.pause();
  }

  get isBackgroundHandoff(): boolean {
    return this.hiddenHandoff;
  }

  /** Suspend the context while nothing plays (saves battery). */
  async suspendIfIdle(): Promise<void> {
    if (this.ctx && this.ctx.state === 'running' && this.paused) await this.ctx.suspend();
  }

  dispose(): void {
    this.stop();
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', this.onVisibility);
    this._chain?.dispose();
    void this.ctx?.close();
  }
}
