import { createId, defaultRng, fisherYates, smartShuffle, type Rng } from './random';

export type QueueOrigin = 'context' | 'manual' | 'autoplay';
export type RepeatMode = 'off' | 'all' | 'one';
export type ShuffleMode = 'off' | 'random' | 'smart';
export type QueueSection = 'manual' | 'context' | 'autoplay';

export interface QueueItem {
  uid: string;
  trackKey: string;
  origin: QueueOrigin;
  /** Artist name, used by smart shuffle. */
  artist?: string;
}

export interface QueueContext {
  id?: string;
  name?: string;
  /** e.g. 'playlist' | 'album' | 'search' | 'collection' — for "Playing from …". */
  kind?: string;
}

export interface QueueState {
  /** Play order of the current context (shuffled when shuffle is on). */
  context: QueueItem[];
  /** Original (unshuffled) context order. */
  original: QueueItem[];
  /** Position in `context` of the last context item played (current one if current is context). */
  index: number;
  /** "Next up": manual adds, played before the context continues. */
  manual: QueueItem[];
  /** Radio items appended when the context runs out. */
  autoplay: QueueItem[];
  current: QueueItem | null;
  history: { item: QueueItem; index: number }[];
  repeat: RepeatMode;
  shuffle: ShuffleMode;
  meta: QueueContext;
}

export const HISTORY_LIMIT = 200;

export function emptyQueue(): QueueState {
  return {
    context: [],
    original: [],
    index: -1,
    manual: [],
    autoplay: [],
    current: null,
    history: [],
    repeat: 'off',
    shuffle: 'off',
    meta: {},
  };
}

export interface TrackRef {
  key: string;
  artist?: string;
}

export function makeItems(tracks: readonly TrackRef[], origin: QueueOrigin): QueueItem[] {
  return tracks.map((t) => ({ uid: createId(), trackKey: t.key, origin, artist: t.artist }));
}

function shuffled(items: QueueItem[], mode: ShuffleMode, rng: Rng, prevArtist?: string) {
  if (mode === 'smart') return smartShuffle(items, (i) => i.artist ?? i.trackKey, rng, prevArtist);
  if (mode === 'random') return fisherYates(items, rng);
  return [...items];
}

/** Start playing a list. Keeps manual "Next up" items. */
export function playContext(
  state: QueueState,
  tracks: readonly TrackRef[],
  startIndex: number,
  meta: QueueContext = {},
  rng: Rng = defaultRng,
): QueueState {
  const items = makeItems(tracks, 'context');
  if (!items.length) return { ...state, context: [], original: [], index: -1, meta };
  const start = Math.min(Math.max(startIndex, 0), items.length - 1);
  const first = items[start] as QueueItem;
  let context = items;
  let index = start;
  if (state.shuffle !== 'off') {
    const rest = items.filter((_, i) => i !== start);
    context = [first, ...shuffled(rest, state.shuffle, rng, first.artist)];
    index = 0;
  }
  return {
    ...state,
    context,
    original: items,
    index,
    current: first,
    autoplay: [],
    history: pushHistory(state),
    meta,
  };
}

function pushHistory(state: QueueState): QueueState['history'] {
  if (!state.current) return state.history;
  const h = [...state.history, { item: state.current, index: state.index }];
  return h.length > HISTORY_LIMIT ? h.slice(h.length - HISTORY_LIMIT) : h;
}

/**
 * Advance. `auto` = the track ended by itself (repeat-one replays only then).
 * Returns the new state; `state.current === null` means the queue has ended.
 */
export function next(state: QueueState, auto = false, rng: Rng = defaultRng): QueueState {
  if (auto && state.repeat === 'one' && state.current) return { ...state };
  const history = pushHistory(state);
  if (state.manual.length) {
    const [cur, ...rest] = state.manual as [QueueItem, ...QueueItem[]];
    return { ...state, current: cur, manual: rest, history };
  }
  if (state.index + 1 < state.context.length) {
    const index = state.index + 1;
    return { ...state, index, current: state.context[index] as QueueItem, history };
  }
  if ((state.repeat === 'all' || state.repeat === 'one') && state.context.length) {
    const context =
      state.shuffle !== 'off' ? shuffled(state.original, state.shuffle, rng) : [...state.original];
    return { ...state, context, index: 0, current: context[0] as QueueItem, history };
  }
  if (state.autoplay.length) {
    const [cur, ...rest] = state.autoplay as [QueueItem, ...QueueItem[]];
    return { ...state, current: cur, autoplay: rest, history };
  }
  return { ...state, current: null, history };
}

/** Go back one item. Returns the same state when there is no history (caller restarts track). */
export function prev(state: QueueState): QueueState {
  const h = state.history[state.history.length - 1];
  if (!h) return state;
  const history = state.history.slice(0, -1);
  let { manual, autoplay } = state;
  const cur = state.current;
  if (cur?.origin === 'manual') manual = [cur, ...manual];
  else if (cur?.origin === 'autoplay') autoplay = [cur, ...autoplay];
  return { ...state, history, manual, autoplay, current: h.item, index: h.index };
}

/** What `next(state, auto)` would play, without changing anything (for preloading). */
export function peekNext(state: QueueState, auto = true): QueueItem | null {
  if (auto && state.repeat === 'one') return state.current;
  if (state.manual.length) return state.manual[0] as QueueItem;
  if (state.index + 1 < state.context.length) return state.context[state.index + 1] as QueueItem;
  if (state.repeat !== 'off' && state.context.length && state.shuffle === 'off')
    return state.original[0] as QueueItem;
  if (state.autoplay.length) return state.autoplay[0] as QueueItem;
  return null;
}

export function addToQueue(state: QueueState, tracks: readonly TrackRef[]): QueueState {
  return { ...state, manual: [...state.manual, ...makeItems(tracks, 'manual')] };
}

export function playNext(state: QueueState, tracks: readonly TrackRef[]): QueueState {
  return { ...state, manual: [...makeItems(tracks, 'manual'), ...state.manual] };
}

export function appendAutoplay(state: QueueState, tracks: readonly TrackRef[]): QueueState {
  const known = new Set([
    ...state.autoplay.map((i) => i.trackKey),
    ...state.context.map((i) => i.trackKey),
    ...state.history.map((h) => h.item.trackKey),
  ]);
  const fresh = tracks.filter((t) => !known.has(t.key));
  return { ...state, autoplay: [...state.autoplay, ...makeItems(fresh, 'autoplay')] };
}

/** Items still to come in the context, in play order. */
export function upcomingContext(state: QueueState): QueueItem[] {
  return state.context.slice(state.index + 1);
}

export function remainingCount(state: QueueState): number {
  return state.manual.length + upcomingContext(state).length + state.autoplay.length;
}

/** Remove an upcoming item by uid (the current item can't be removed). */
export function removeItem(state: QueueState, uid: string): QueueState {
  if (state.current?.uid === uid) return state;
  const ci = state.context.findIndex((i) => i.uid === uid);
  let { context, index } = state;
  if (ci >= 0) {
    context = context.filter((i) => i.uid !== uid);
    if (ci <= index) index -= 1;
  }
  return {
    ...state,
    context,
    index,
    original: state.original.filter((i) => i.uid !== uid),
    manual: state.manual.filter((i) => i.uid !== uid),
    autoplay: state.autoplay.filter((i) => i.uid !== uid),
  };
}

function move<T>(arr: readonly T[], from: number, to: number): T[] {
  const a = [...arr];
  if (from < 0 || from >= a.length) return a;
  const [it] = a.splice(from, 1) as [T];
  a.splice(Math.min(Math.max(to, 0), a.length), 0, it);
  return a;
}

/**
 * Reorder within a section. For 'context', indices are relative to the upcoming slice
 * (what the queue panel shows), not the whole context.
 */
export function moveItem(
  state: QueueState,
  section: QueueSection,
  from: number,
  to: number,
): QueueState {
  if (section === 'manual') return { ...state, manual: move(state.manual, from, to) };
  if (section === 'autoplay') return { ...state, autoplay: move(state.autoplay, from, to) };
  const base = state.index + 1;
  const upcoming = move(state.context.slice(base), from, to);
  const context = [...state.context.slice(0, base), ...upcoming];
  // Reordering by hand defines the new "original" order for the upcoming part too.
  const original = state.shuffle === 'off' ? context : state.original;
  return { ...state, context, original };
}

/** Clear everything after the current item (manual, upcoming context and autoplay). */
export function clearUpcoming(state: QueueState, section?: QueueSection): QueueState {
  if (section === 'manual') return { ...state, manual: [] };
  if (section === 'autoplay') return { ...state, autoplay: [] };
  if (section === 'context') {
    const context = state.context.slice(0, state.index + 1);
    return { ...state, context, original: context };
  }
  const context = state.context.slice(0, state.index + 1);
  return { ...state, manual: [], autoplay: [], context, original: context };
}

export function setRepeat(state: QueueState, repeat: RepeatMode): QueueState {
  return { ...state, repeat };
}

export function cycleRepeat(r: RepeatMode): RepeatMode {
  return r === 'off' ? 'all' : r === 'all' ? 'one' : 'off';
}

/** Turn shuffle on/off. The current item stays put; only upcoming items are reordered. */
export function setShuffle(
  state: QueueState,
  mode: ShuffleMode,
  rng: Rng = defaultRng,
): QueueState {
  if (mode === state.shuffle) return state;
  const cur = state.current;
  if (mode === 'off') {
    // Anchor on the last context item played (the current item may be a manual add).
    const anchor = cur?.origin === 'context' ? cur : state.context[state.index];
    const pos = anchor ? state.original.findIndex((i) => i.uid === anchor.uid) : -1;
    return {
      ...state,
      shuffle: mode,
      context: [...state.original],
      index: pos >= 0 ? pos : Math.min(state.index, state.original.length - 1),
    };
  }
  const played = state.context.slice(0, state.index + 1);
  const playedIds = new Set(played.map((i) => i.uid));
  const rest = state.original.filter((i) => !playedIds.has(i.uid));
  const context = [...played, ...shuffled(rest, mode, rng, cur?.artist)];
  return { ...state, shuffle: mode, context };
}

/** Everything the queue references (for loading track metadata). */
export function allTrackKeys(state: QueueState): string[] {
  const keys = new Set<string>();
  if (state.current) keys.add(state.current.trackKey);
  for (const i of [...state.manual, ...state.context, ...state.autoplay]) keys.add(i.trackKey);
  return [...keys];
}
