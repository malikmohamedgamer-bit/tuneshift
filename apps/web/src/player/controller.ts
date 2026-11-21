import {
  addToQueue as qAdd,
  appendAutoplay,
  clearUpcoming,
  cycleRepeat,
  emptyQueue,
  formatDuration,
  moveItem,
  next as qNext,
  peekNext,
  playContext,
  playNext as qPlayNext,
  prev as qPrev,
  remainingCount,
  removeItem,
  setRepeat,
  setSectionOrder,
  setShuffle,
  smartShuffle,
  soundLabel,
  type QueueContext,
  type QueueItem,
  type QueueSection,
  type QueueState,
  type RepeatMode,
  type SoundRef,
  type SoundSettings,
  type Track,
} from '@tuneshift/core';
import {
  AudioEngine,
  estimateLoudnessFromRms,
  isLocalUrl,
  normalizationGainDb,
  probeCors,
  rememberCors,
  smoothTowards,
  type DeckMode,
} from '@tuneshift/audio';
import { radioFor } from '@tuneshift/sources';
import { toast } from 'sonner';
import { kvGet, kvSet } from '../db/db';
import {
  addHistory,
  getAssignment,
  playlistAssignmentId,
  resolveSoundRef,
  songAssignmentId,
} from '../db/library';
import { audius, loadTracks, registry, rememberTracks } from '../lib/sources';
import { resolveArtworkUrl } from '../lib/localFiles';
import { getPlayer, setPlayer, type SleepMode } from '../state/player';
import { getSettings, useSettings } from '../state/settings';
import { getSound, setSound, useSound } from '../state/sound';
import { isIOS } from '../platform/detect';
import { localNormalizationDb } from './normalization';
import { emitPlayerEvent } from './events';

const PRELOAD_SECONDS = 15;
const PERSIST_KEY = 'player:queue';

interface Resolved {
  url: string;
  mode: DeckMode;
}

/**
 * The app's single player. Owns the AudioEngine; queue state lives in the zustand store so the
 * UI (and other windows on desktop) can render it. All public methods are safe to call from
 * event handlers; failures surface as toasts.
 */
class PlayerController {
  readonly engine = new AudioEngine();
  private initialized = false;
  private retried = new Set<string>();
  private preloading: { key: string; resolved: Resolved } | null = null;
  private crossfadeStarted = false;
  private gaplessTimer: ReturnType<typeof setInterval> | null = null;
  private loopTimer: ReturnType<typeof setInterval> | null = null;
  private sleepTimer: ReturnType<typeof setInterval> | null = null;
  private sleepVolume: number | null = null;
  private radioFetchedFor: string | null = null;
  private listenMs = 0;
  private lastTick = 0;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private rmsSamples: number[] = [];
  private normDb = 0;
  private loadToken = 0;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const e = this.engine;
    e.on('timeupdate', ({ time, duration }) => this.onTime(time, duration));
    e.on('durationchange', ({ duration }) => Number.isFinite(duration) && setPlayer({ duration }));
    e.on('play', () => {
      setPlayer({ status: 'playing', needsGesture: false });
      this.lastTick = performance.now();
      this.updateMediaSessionState();
    });
    e.on('playing', () => setPlayer({ status: 'playing' }));
    e.on('pause', () => {
      this.tickListen();
      if (getPlayer().status !== 'loading') setPlayer({ status: 'paused' });
      this.updateMediaSessionState();
      this.persistSoon();
    });
    e.on('waiting', () => setPlayer({ status: 'buffering' }));
    e.on('ended', () => void this.onEnded());
    e.on('error', (info) => void this.onError(info));
    e.on('blocked', () => setPlayer({ needsGesture: true, status: 'paused' }));
    e.on('contextstate', ({ state }) => setPlayer({ contextState: state }));

    useSound.subscribe((s, prev) => {
      if (s.settings !== prev.settings) {
        e.setSound(s.settings);
        emitPlayerEvent('sound', { label: s.label });
      }
    });
    const applySettings = () => {
      const st = getSettings();
      e.setVolume(st.volume, st.muted);
      const bg = st.backgroundSafe === 'on' || (st.backgroundSafe === 'auto' && isIOS());
      e.setBackgroundSafe(bg);
    };
    applySettings();
    useSettings.subscribe((s, p) => {
      if (s.volume !== p.volume || s.muted !== p.muted || s.backgroundSafe !== p.backgroundSafe)
        applySettings();
      if (s.outputDeviceId !== p.outputDeviceId) void e.setSinkId(s.outputDeviceId);
      if (s.normalization !== p.normalization) void this.applyNormalization();
    });
    if (getSettings().outputDeviceId) void e.setSinkId(getSettings().outputDeviceId);
    document.addEventListener('visibilitychange', () => {
      setPlayer({ backgroundHandoff: e.isBackgroundHandoff });
      if (document.visibilityState === 'hidden') void this.persist();
    });
    window.addEventListener('pagehide', () => void this.persist());
    this.setupMediaSession();
    e.setSound(getSound().settings);
  }

  /** Resume the last queue & position, paused (spec §5). */
  private restored = false;

  async restore(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    const saved = await kvGet<{ queue: QueueState; position: number }>(PERSIST_KEY);
    if (!saved?.queue?.current) return;
    const keys = [
      saved.queue.current.trackKey,
      ...saved.queue.manual.map((i) => i.trackKey),
      ...saved.queue.context.map((i) => i.trackKey),
    ];
    const tracks = await loadTracks([...new Set(keys)].slice(0, 500));
    setPlayer({ queue: { ...emptyQueue(), ...saved.queue }, tracks: Object.fromEntries(tracks) });
    if (getSettings().resume) await this.loadCurrent(false, saved.position);
  }

  // ------------------------------------------------------------------ queue actions
  async playTracks(tracks: Track[], startIndex = 0, meta: QueueContext = {}): Promise<void> {
    if (!tracks.length) return;
    void rememberTracks(tracks);
    void this.unlockFromGesture();
    const st = getPlayer();
    const map = { ...st.tracks };
    for (const t of tracks) map[t.key] = t;
    let queue = playContext(
      st.queue,
      tracks.map((t) => ({ key: t.key, artist: t.artist })),
      startIndex,
      meta,
    );
    if (queue.shuffle === 'smart') {
      const [first, ...rest] = queue.context;
      if (first)
        queue = {
          ...queue,
          context: [
            first,
            ...smartShuffle(rest, (i) => i.artist ?? i.trackKey, Math.random, first.artist),
          ],
        };
    }
    this.retried.clear();
    setPlayer({ queue, tracks: map });
    await this.loadCurrent(true);
  }

  async playTrack(
    track: Track,
    context: Track[] = [track],
    meta: QueueContext = {},
  ): Promise<void> {
    const i = Math.max(
      0,
      context.findIndex((t) => t.key === track.key),
    );
    await this.playTracks(context, i, meta);
  }

  addToQueue(tracks: Track[]): void {
    this.mergeTracks(tracks);
    setPlayer({
      queue: qAdd(
        getPlayer().queue,
        tracks.map((t) => ({ key: t.key, artist: t.artist })),
      ),
    });
    toast.success(
      tracks.length === 1
        ? `Added “${tracks[0]?.title}” to the queue`
        : `Added ${tracks.length} songs to the queue`,
    );
    this.afterQueueChange();
  }

  playNext(tracks: Track[]): void {
    this.mergeTracks(tracks);
    setPlayer({
      queue: qPlayNext(
        getPlayer().queue,
        tracks.map((t) => ({ key: t.key, artist: t.artist })),
      ),
    });
    toast.success(
      tracks.length === 1 ? `“${tracks[0]?.title}” plays next` : `${tracks.length} songs play next`,
    );
    this.afterQueueChange();
  }

  removeFromQueue(uid: string): void {
    setPlayer({ queue: removeItem(getPlayer().queue, uid) });
    this.afterQueueChange();
  }

  moveInQueue(section: QueueSection, from: number, to: number): void {
    setPlayer({ queue: moveItem(getPlayer().queue, section, from, to) });
    this.afterQueueChange();
  }

  reorderSection(section: QueueSection, uids: string[]): void {
    setPlayer({ queue: setSectionOrder(getPlayer().queue, section, uids) });
    this.afterQueueChange();
  }

  clearQueue(section?: QueueSection): void {
    setPlayer({ queue: clearUpcoming(getPlayer().queue, section) });
    this.afterQueueChange();
  }

  toggleShuffle(): void {
    const q = getPlayer().queue;
    const mode = q.shuffle === 'off' ? (getSettings().smartShuffle ? 'smart' : 'random') : 'off';
    setPlayer({ queue: setShuffle(q, mode) });
    this.afterQueueChange();
  }

  setRepeatMode(r?: RepeatMode): void {
    const q = getPlayer().queue;
    setPlayer({ queue: setRepeat(q, r ?? cycleRepeat(q.repeat)) });
    this.afterQueueChange();
  }

  private mergeTracks(tracks: Track[]) {
    void rememberTracks(tracks);
    const map = { ...getPlayer().tracks };
    for (const t of tracks) map[t.key] = t;
    setPlayer({ tracks: map });
  }

  private afterQueueChange(): void {
    this.invalidatePreload();
    this.persistSoon();
  }

  // ------------------------------------------------------------------ transport
  async unlockFromGesture(): Promise<void> {
    await this.engine.unlock();
    setPlayer({ contextState: this.engine.contextState, needsGesture: false });
  }

  async play(): Promise<void> {
    const st = getPlayer();
    if (!st.current) {
      if (st.queue.current) await this.loadCurrent(true);
      return;
    }
    await this.engine.play();
  }

  pause(): void {
    this.engine.pause();
  }

  async togglePlay(): Promise<void> {
    if (getPlayer().status === 'playing' || getPlayer().status === 'buffering') this.pause();
    else await this.play();
  }

  async next(): Promise<void> {
    await this.advance(false);
  }

  /** Previous: restart if more than 3 s in (spec §5). */
  async prev(): Promise<void> {
    if (this.engine.currentTime > 3 || !getPlayer().queue.history.length) {
      this.seek(0);
      return;
    }
    this.flushHistory();
    setPlayer({ queue: qPrev(getPlayer().queue) });
    await this.loadCurrent(true);
  }

  seek(sec: number): void {
    this.engine.seek(sec);
    setPlayer({ position: this.engine.currentTime });
    this.crossfadeStarted = false;
    this.updateMediaSessionState();
  }

  seekBy(delta: number): void {
    this.seek(Math.max(0, this.engine.currentTime + delta));
  }

  // ------------------------------------------------------------------ loading
  private async ensureTrack(key: string): Promise<Track | null> {
    const st = getPlayer();
    if (st.tracks[key]) return st.tracks[key] as Track;
    const map = await loadTracks([key]);
    const t = map.get(key) ?? null;
    if (t) setPlayer({ tracks: { ...getPlayer().tracks, [key]: t } });
    return t;
  }

  private async resolve(track: Track, bust = false): Promise<Resolved> {
    if (!registry.isUsable(track.source)) {
      throw new Error(
        registry.statusOf(track.source).reason ?? `${track.source} is turned off in Settings`,
      );
    }
    const url =
      track.source === 'audius'
        ? await audius.resolveStreamUrl(track, { bust })
        : await registry.get(track.source).resolveStreamUrl(track);
    if (isLocalUrl(url)) return { url, mode: 'fx' };
    const ok = await probeCors(url);
    registry.setFullEffects(track.source, ok);
    return { url, mode: ok ? 'fx' : 'direct' };
  }

  private async loadCurrent(autoplay: boolean, startAt = 0, bust = false): Promise<void> {
    const token = ++this.loadToken;
    const item = getPlayer().queue.current;
    this.stopGapless();
    this.crossfadeStarted = false;
    if (!item) {
      this.engine.stop();
      setPlayer({ current: null, status: 'idle', position: 0, duration: 0, mode: null });
      return;
    }
    const track = await this.ensureTrack(item.trackKey);
    if (token !== this.loadToken) return;
    if (!track) {
      toast.error('That song is no longer available — skipped');
      await this.advance(true);
      return;
    }
    this.flushHistory();
    setPlayer({
      current: track,
      status: 'loading',
      position: startAt,
      duration: track.durationSec,
      loop: { a: null, b: null },
    });
    await this.applyAssignedSound(track);
    try {
      const preloaded = this.preloading?.key === track.key ? this.preloading.resolved : null;
      const resolved = preloaded ?? (await this.resolve(track, bust));
      if (token !== this.loadToken) return;
      this.preloading = null;
      await this.engine.load(
        { url: resolved.url, mode: resolved.mode, key: track.key, startAt },
        autoplay,
      );
      if (token !== this.loadToken) return;
      if (!autoplay) setPlayer({ status: 'paused' });
      this.onTrackStarted(track, resolved.mode);
    } catch (e) {
      if (token !== this.loadToken) return;
      await this.failAndSkip(track, e);
    }
  }

  private onTrackStarted(track: Track, mode: DeckMode): void {
    setPlayer({
      mode,
      backgroundHandoff: this.engine.isBackgroundHandoff,
      announcement: `Now playing ${track.title} by ${track.artist}`,
    });
    this.listenMs = 0;
    this.lastTick = performance.now();
    this.rmsSamples = [];
    this.radioFetchedFor = null;
    void this.applyNormalization();
    void this.updateMediaSessionMetadata(track);
    emitPlayerEvent('track', { track });
    void this.persist();
  }

  private async failAndSkip(track: Track, e: unknown): Promise<void> {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[player] failed to play', track.key, msg);
    toast.error(`Couldn't play “${track.title}” — skipped`, { description: msg.slice(0, 140) });
    await this.advance(true);
  }

  private async onError(info: {
    key: string;
    url: string;
    mode: DeckMode;
    corsSuspect: boolean;
  }): Promise<void> {
    const track = getPlayer().current;
    if (!track || info.key !== track.key) return;
    const at = this.engine.currentTime;
    if (info.corsSuspect) {
      // The host refused CORS after all → Limited mode (speed only) for this source.
      rememberCors(info.url, false);
      registry.setFullEffects(track.source, false);
      toast.message(
        'This source doesn’t allow audio processing — playing with speed effects only.',
      );
      await this.engine.load({ url: info.url, mode: 'direct', key: track.key, startAt: at }, true);
      setPlayer({ mode: 'direct' });
      return;
    }
    if (!this.retried.has(track.key)) {
      this.retried.add(track.key);
      await this.loadCurrent(true, at, true);
      return;
    }
    await this.failAndSkip(track, new Error('The stream failed twice'));
  }

  // ------------------------------------------------------------------ sound assignment
  /** Song > playlist > (session pick) > global default (spec §4.6). */
  private async applyAssignedSound(track: Track): Promise<void> {
    const song = await getAssignment(songAssignmentId(track.key));
    if (song) return this.applyRef(song, 'song');
    const meta = getPlayer().queue.meta;
    if (meta.kind === 'playlist' && meta.id) {
      const pl = await getAssignment(playlistAssignmentId(meta.id));
      if (pl) return this.applyRef(pl, 'playlist');
    }
    const cur = getSound();
    if (cur.manual) {
      if (cur.origin !== 'manual')
        setSound(cur.settings, { ref: cur.ref, label: cur.label, origin: 'manual' });
      return;
    }
    await this.applyRef(getSettings().defaultSound, 'global');
  }

  private async applyRef(ref: SoundRef, origin: 'song' | 'playlist' | 'global'): Promise<void> {
    const r = await resolveSoundRef(ref);
    const cur = getSound();
    if (cur.origin === origin && JSON.stringify(cur.ref) === JSON.stringify(r.ref)) return;
    useSound.setState({ settings: r.settings, ref: r.ref, label: r.label, origin });
  }

  /** "Reset to default": drop the session pick and use the global default sound. */
  async resetSoundToDefault(): Promise<void> {
    useSound.setState({ manual: false });
    const t = getPlayer().current;
    if (t) await this.applyAssignedSound(t);
    else await this.applyRef(getSettings().defaultSound, 'global');
  }

  applySound(settings: SoundSettings, ref: SoundRef | null = null, label?: string): void {
    setSound(settings, { ref, label: label ?? soundLabel(settings), origin: 'manual' });
  }

  setCompare(on: boolean): void {
    if (getPlayer().comparing === on) return;
    this.engine.setCompare(on);
    setPlayer({ comparing: on });
  }

  // ------------------------------------------------------------------ time / transitions
  private onTime(time: number, duration: number): void {
    const st = getPlayer();
    const d = Number.isFinite(duration) && duration > 0 ? duration : (st.current?.durationSec ?? 0);
    setPlayer({ position: time, duration: d });
    this.tickListen();
    if (!st.current || st.status !== 'playing') return;
    const rate = this.engine.playbackRate || 1;
    const remainingReal = (d - time) / rate;
    // Preload ~15 s before the end.
    if (remainingReal < PRELOAD_SECONDS) void this.preloadNext();
    // Autoplay radio when the queue is about to run out.
    if (remainingReal < 30) void this.maybeFetchRadio();
    const xf = getSettings().crossfadeSec;
    if (
      xf > 0 &&
      !this.crossfadeStarted &&
      remainingReal <= xf &&
      st.queue.repeat !== 'one' &&
      st.sleep.mode !== 'track'
    ) {
      void this.transitionToNext(xf);
    } else if (xf === 0 && remainingReal < 1.2 && !this.gaplessTimer) {
      this.startGaplessWatch();
    }
    if (remainingReal > 2 && time > 2 && time < 8) this.sampleRms();
    this.updateMediaSessionStateThrottled();
  }

  private tickListen(): void {
    const now = performance.now();
    if (getPlayer().status === 'playing' && this.lastTick)
      this.listenMs += Math.min(1500, Math.max(0, now - this.lastTick));
    this.lastTick = now;
  }

  private flushHistory(): void {
    const t = getPlayer().current;
    this.tickListen();
    if (!t || this.listenMs < 1000 || getSettings().privateSession) {
      this.listenMs = 0;
      return;
    }
    const ms = Math.round(this.listenMs);
    this.listenMs = 0;
    void addHistory({
      trackKey: t.key,
      source: t.source,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      playedAt: Date.now() - ms,
      msListened: ms,
      presetName: getSound().label,
    });
  }

  private startGaplessWatch(): void {
    this.gaplessTimer = setInterval(() => {
      const e = this.engine;
      const rate = e.playbackRate || 1;
      const remaining = (e.duration - e.currentTime) / rate;
      if (remaining <= 0.035 && remaining >= 0 && !e.paused) {
        this.stopGapless();
        void this.transitionToNext(0);
      }
    }, 15);
  }

  private stopGapless(): void {
    if (this.gaplessTimer) clearInterval(this.gaplessTimer);
    this.gaplessTimer = null;
  }

  private invalidatePreload(): void {
    this.preloading = null;
    this.engine.clearPreload();
  }

  private async preloadNext(): Promise<void> {
    const st = getPlayer();
    const nxt = peekNext(st.queue, true);
    if (!nxt || nxt.trackKey === st.current?.key) return;
    if (this.preloading?.key === nxt.trackKey) return;
    const track = await this.ensureTrack(nxt.trackKey);
    if (!track) return;
    this.preloading = { key: track.key, resolved: { url: '', mode: 'fx' } };
    try {
      const resolved = await this.resolve(track);
      if (this.preloading?.key !== track.key) return;
      this.preloading = { key: track.key, resolved };
      this.engine.preload({ url: resolved.url, mode: resolved.mode, key: track.key });
    } catch {
      this.preloading = null;
    }
  }

  /** Move to the next queue item using the preloaded deck (crossfade or gapless). */
  private async transitionToNext(seconds: number): Promise<void> {
    const st = getPlayer();
    const nxt = peekNext(st.queue, true);
    if (
      !nxt ||
      !this.preloading ||
      this.preloading.key !== nxt.trackKey ||
      this.engine.preloadedKey !== nxt.trackKey
    )
      return;
    this.crossfadeStarted = true;
    const resolved = this.preloading.resolved;
    this.flushHistory();
    const queue = qNext(st.queue, true);
    const track = await this.ensureTrack(nxt.trackKey);
    if (!track) return;
    setPlayer({
      queue,
      current: track,
      duration: track.durationSec,
      position: 0,
      loop: { a: null, b: null },
    });
    await this.applyAssignedSound(track);
    this.preloading = null;
    const ok = await this.engine.startPreloaded(seconds);
    if (!ok) {
      await this.loadCurrent(true);
      return;
    }
    this.crossfadeStarted = false;
    this.onTrackStarted(track, resolved.mode);
  }

  private async onEnded(): Promise<void> {
    const st = getPlayer();
    if (st.sleep.mode === 'track') {
      this.cancelSleep();
      this.pause();
      toast.message('Sleep timer: stopped at the end of the track');
      return;
    }
    if (st.queue.repeat === 'one') {
      this.seek(0);
      await this.engine.play();
      return;
    }
    // Gapless fallback: the preloaded deck is ready → switch instantly.
    const nxt = peekNext(st.queue, true);
    if (nxt && this.preloading?.key === nxt.trackKey && this.engine.preloadedKey === nxt.trackKey) {
      await this.transitionToNext(0);
      return;
    }
    await this.advance(true);
  }

  private async advance(auto: boolean): Promise<void> {
    this.flushHistory();
    let queue = qNext(getPlayer().queue, auto);
    if (!queue.current) {
      await this.maybeFetchRadio(true);
      queue = qNext(getPlayer().queue, auto);
    }
    if (!queue.current) {
      // End of queue: stay on the last track, paused at the start.
      if (getPlayer().sleep.mode === 'queue') this.cancelSleep();
      this.engine.pause();
      this.seek(0);
      setPlayer({ status: 'paused' });
      return;
    }
    setPlayer({ queue });
    await this.loadCurrent(true);
  }

  private async maybeFetchRadio(force = false): Promise<void> {
    const st = getPlayer();
    const seed = st.current;
    if (!seed || !getSettings().autoplay || st.queue.repeat !== 'off') return;
    if (this.radioFetchedFor === seed.key) return;
    if (!force && remainingCount(st.queue) >= 2) return;
    if (!registry.isUsable('audius')) return;
    this.radioFetchedFor = seed.key;
    try {
      const tracks = await radioFor(seed, audius);
      if (!tracks.length) return;
      this.mergeTracks(tracks);
      setPlayer({
        queue: appendAutoplay(
          getPlayer().queue,
          tracks.map((t) => ({ key: t.key, artist: t.artist })),
        ),
      });
    } catch {
      // radio is best effort; the queue simply ends
    }
  }

  // ------------------------------------------------------------------ normalisation
  private async applyNormalization(): Promise<void> {
    const mode = getSettings().normalization;
    const t = getPlayer().current;
    if (mode === 'off' || !t) {
      this.normDb = 0;
      this.engine.setNormalization(0);
      return;
    }
    const db = await localNormalizationDb(t, mode);
    if (db !== null && getPlayer().current?.key === t.key) {
      this.normDb = db;
      this.engine.setNormalization(db);
    }
  }

  /** Remote streams: RMS of the pre-effects signal during seconds 2–8, smoothed. */
  private sampleRms(): void {
    const t = getPlayer().current;
    if (!t || t.source === 'local' || getSettings().normalization === 'off') return;
    const an = this.engine.chain?.inputAnalyser;
    if (!an || this.engine.outputMode !== 'fx') return;
    const buf = new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += (buf[i] as number) ** 2;
    this.rmsSamples.push(Math.sqrt(s / buf.length));
    if (this.rmsSamples.length >= 4) {
      const avg = this.rmsSamples.reduce((a, b) => a + b, 0) / this.rmsSamples.length;
      const target = normalizationGainDb(estimateLoudnessFromRms(avg));
      this.normDb = smoothTowards(this.normDb, target, 0.35);
      this.engine.setNormalization(this.normDb);
      this.rmsSamples = this.rmsSamples.slice(-8);
    }
  }

  // ------------------------------------------------------------------ A–B loop
  setLoopPoint(which: 'a' | 'b', at?: number): void {
    const t = at ?? this.engine.currentTime;
    const loop = { ...getPlayer().loop, [which]: t };
    if (loop.a !== null && loop.b !== null && loop.b <= loop.a) {
      toast.error('Loop end must be after the loop start');
      return;
    }
    setPlayer({ loop });
    this.syncLoopTimer();
  }

  clearLoop(): void {
    setPlayer({ loop: { a: null, b: null } });
    this.syncLoopTimer();
  }

  private syncLoopTimer(): void {
    const { a, b } = getPlayer().loop;
    if (this.loopTimer) clearInterval(this.loopTimer);
    this.loopTimer = null;
    if (a === null || b === null) return;
    this.loopTimer = setInterval(() => {
      if (this.engine.currentTime >= b) this.engine.seek(a);
    }, 30);
  }

  // ------------------------------------------------------------------ sleep timer
  setSleep(mode: SleepMode, minutes = 0): void {
    this.cancelSleep(false);
    if (mode === 'off') {
      toast.message('Sleep timer off');
      return;
    }
    const endsAt = mode === 'time' ? Date.now() + minutes * 60_000 : undefined;
    setPlayer({ sleep: { mode, endsAt } });
    if (mode === 'time') {
      this.sleepTimer = setInterval(() => this.sleepTick(), 250);
      toast.success(`Sleep timer: ${minutes} min`);
    } else
      toast.success(
        mode === 'track' ? 'Sleep timer: end of this track' : 'Sleep timer: end of the queue',
      );
  }

  private sleepTick(): void {
    const { sleep } = getPlayer();
    if (sleep.mode !== 'time' || !sleep.endsAt) return;
    const left = sleep.endsAt - Date.now();
    const vol = getSettings().volume;
    if (left <= 10_000 && left > 0) {
      // Fade out over the last 10 s.
      this.sleepVolume ??= vol;
      this.engine.setVolume(this.sleepVolume * (left / 10_000), getSettings().muted);
    }
    if (left <= 0) {
      this.pause();
      this.cancelSleep();
      toast.message('Sleep timer: playback stopped. Good night!');
    }
  }

  cancelSleep(announce = false): void {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    if (this.sleepVolume !== null) {
      this.engine.setVolume(getSettings().volume, getSettings().muted);
      this.sleepVolume = null;
    }
    setPlayer({ sleep: { mode: 'off' } });
    if (announce) toast.message('Sleep timer off');
  }

  // ------------------------------------------------------------------ persistence
  private persistSoon(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => void this.persist(), 600);
  }

  private async persist(): Promise<void> {
    const st = getPlayer();
    await kvSet(PERSIST_KEY, {
      queue: { ...st.queue, history: st.queue.history.slice(-50) },
      position: this.engine.currentTime || st.position,
    });
  }

  // ------------------------------------------------------------------ Media Session
  private setupMediaSession(): void {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => void this.play()],
      ['pause', () => this.pause()],
      ['previoustrack', () => void this.prev()],
      ['nexttrack', () => void this.next()],
      ['stop', () => this.pause()],
      ['seekto', (d) => d.seekTime !== undefined && this.seek(d.seekTime)],
      ['seekforward', (d) => this.seekBy(d.seekOffset ?? 10)],
      ['seekbackward', (d) => this.seekBy(-(d.seekOffset ?? 10))],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // action not supported on this platform
      }
    }
  }

  private async updateMediaSessionMetadata(t: Track): Promise<void> {
    if (!('mediaSession' in navigator)) return;
    const art = await Promise.all(
      (
        [
          [t.artwork?.small, '150x150'],
          [t.artwork?.medium, '480x480'],
          [t.artwork?.large, '1000x1000'],
        ] as const
      ).map(async ([u, sizes]) => ({ src: (await resolveArtworkUrl(u)) ?? '', sizes })),
    );
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      album: t.album ?? `${getSound().label} · Tuneshift`,
      artwork: art.filter((a) => a.src),
    });
  }

  private lastPositionUpdate = 0;
  private updateMediaSessionStateThrottled(): void {
    const now = performance.now();
    if (now - this.lastPositionUpdate > 1000) {
      this.lastPositionUpdate = now;
      this.updateMediaSessionState();
    }
  }

  private updateMediaSessionState(): void {
    if (!('mediaSession' in navigator)) return;
    const e = this.engine;
    navigator.mediaSession.playbackState = e.paused ? 'paused' : 'playing';
    const d = e.duration;
    if (d > 0 && Number.isFinite(d)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: d,
          position: Math.min(d, e.currentTime),
          playbackRate: e.playbackRate || 1,
        });
      } catch {
        // invalid state during loads
      }
    }
  }

  /** Human text for the progress tooltip: song time and real time left at this speed. */
  realTimeLeft(): string {
    const e = this.engine;
    const left = Math.max(0, e.duration - e.currentTime) / (e.playbackRate || 1);
    return formatDuration(left);
  }
}

export const player = new PlayerController();

export type { QueueItem };
