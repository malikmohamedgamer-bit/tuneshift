import { describe, expect, it } from 'vitest';
import {
  addToQueue,
  appendAutoplay,
  clearUpcoming,
  emptyQueue,
  moveItem,
  next,
  peekNext,
  playContext,
  playNext,
  prev,
  removeItem,
  seededRng,
  setRepeat,
  setShuffle,
  smartShuffle,
  fisherYates,
  upcomingContext,
  type QueueState,
} from '../src';

const tracks = (n: number, artist = (i: number) => `artist${i % 3}`) =>
  Array.from({ length: n }, (_, i) => ({ key: `audius:t${i}`, artist: artist(i) }));

const keys = (s: QueueState) => s.context.map((i) => i.trackKey);
const cur = (s: QueueState) => s.current?.trackKey ?? null;

describe('queue engine', () => {
  it('plays a context in order and ends', () => {
    let s = playContext(emptyQueue(), tracks(3), 0);
    expect(cur(s)).toBe('audius:t0');
    s = next(s);
    expect(cur(s)).toBe('audius:t1');
    s = next(s);
    s = next(s);
    expect(s.current).toBeNull();
  });

  it('starts at the requested index', () => {
    const s = playContext(emptyQueue(), tracks(5), 3);
    expect(cur(s)).toBe('audius:t3');
    expect(upcomingContext(s).map((i) => i.trackKey)).toEqual(['audius:t4']);
  });

  it('plays manual "play next" items before continuing the context', () => {
    let s = playContext(emptyQueue(), tracks(3), 0);
    s = addToQueue(s, [{ key: 'local:a' }]);
    s = playNext(s, [{ key: 'local:b' }]);
    expect(s.manual.map((i) => i.trackKey)).toEqual(['local:b', 'local:a']);
    s = next(s);
    expect(cur(s)).toBe('local:b');
    s = next(s);
    expect(cur(s)).toBe('local:a');
    s = next(s);
    expect(cur(s)).toBe('audius:t1');
  });

  it('prev walks back through history and restores manual items', () => {
    let s = playContext(emptyQueue(), tracks(3), 0);
    s = playNext(s, [{ key: 'local:x' }]);
    s = next(s); // local:x
    s = next(s); // t1
    s = prev(s);
    expect(cur(s)).toBe('local:x');
    s = prev(s);
    expect(cur(s)).toBe('audius:t0');
    expect(s.manual.map((i) => i.trackKey)).toEqual(['local:x']);
    expect(prev(emptyQueue())).toEqual(emptyQueue());
  });

  it('repeat one replays only on auto-advance', () => {
    let s = setRepeat(playContext(emptyQueue(), tracks(3), 0), 'one');
    expect(cur(next(s, true))).toBe('audius:t0');
    s = next(s, false);
    expect(cur(s)).toBe('audius:t1');
    expect(peekNext(s, true)?.trackKey).toBe('audius:t1');
  });

  it('repeat all wraps around', () => {
    let s = setRepeat(playContext(emptyQueue(), tracks(2), 0), 'all');
    s = next(next(s));
    expect(cur(s)).toBe('audius:t0');
  });

  it('falls through to autoplay when the context ends, skipping known tracks', () => {
    let s = playContext(emptyQueue(), tracks(1), 0);
    s = appendAutoplay(s, [{ key: 'audius:t0' }, { key: 'audius:radio1' }]);
    expect(s.autoplay.map((i) => i.trackKey)).toEqual(['audius:radio1']);
    s = next(s);
    expect(cur(s)).toBe('audius:radio1');
    expect(s.current?.origin).toBe('autoplay');
  });

  it('reorders upcoming context items and manual items', () => {
    let s = playContext(emptyQueue(), tracks(5), 0);
    s = moveItem(s, 'context', 0, 3); // t1 moves after t4
    expect(keys(s)).toEqual(['audius:t0', 'audius:t2', 'audius:t3', 'audius:t4', 'audius:t1']);
    s = addToQueue(s, [{ key: 'local:a' }, { key: 'local:b' }]);
    s = moveItem(s, 'manual', 1, 0);
    expect(s.manual.map((i) => i.trackKey)).toEqual(['local:b', 'local:a']);
  });

  it('removes items but never the current one', () => {
    let s = playContext(emptyQueue(), tracks(4), 1);
    const currentUid = s.current!.uid;
    expect(removeItem(s, currentUid)).toBe(s);
    const first = s.context[0]!.uid;
    s = removeItem(s, first);
    expect(cur(s)).toBe('audius:t1');
    expect(s.index).toBe(0);
    expect(cur(next(s))).toBe('audius:t2');
  });

  it('clears upcoming items', () => {
    let s = addToQueue(playContext(emptyQueue(), tracks(4), 0), [{ key: 'local:a' }]);
    s = clearUpcoming(s);
    expect(s.manual).toEqual([]);
    expect(upcomingContext(s)).toEqual([]);
    expect(cur(s)).toBe('audius:t0');
  });

  it('shuffle keeps the current track and every item exactly once; un-shuffle restores order', () => {
    let s = playContext(emptyQueue(), tracks(20), 4);
    s = setShuffle(s, 'random', seededRng(7));
    expect(cur(s)).toBe('audius:t4');
    expect(new Set(keys(s)).size).toBe(20);
    expect(keys(s)).not.toEqual(tracks(20).map((t) => t.key));
    s = setShuffle(s, 'off');
    expect(keys(s)).toEqual(tracks(20).map((t) => t.key));
    expect(s.context[s.index]!.trackKey).toBe('audius:t4');
  });

  it('starting a context with shuffle on puts the chosen track first', () => {
    const base = setShuffle(emptyQueue(), 'random');
    const s = playContext(base, tracks(10), 6, {}, seededRng(3));
    expect(cur(s)).toBe('audius:t6');
    expect(s.index).toBe(0);
    expect(new Set(keys(s)).size).toBe(10);
  });
});

describe('shuffle', () => {
  it('fisherYates is a permutation and deterministic with a seed', () => {
    const a = fisherYates([1, 2, 3, 4, 5, 6], seededRng(1));
    const b = fisherYates([1, 2, 3, 4, 5, 6], seededRng(1));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('smart shuffle never puts the same artist back-to-back when avoidable', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const items = [
        ...Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, artist: 'A' })),
        ...Array.from({ length: 4 }, (_, i) => ({ id: `b${i}`, artist: 'B' })),
        ...Array.from({ length: 3 }, (_, i) => ({ id: `c${i}`, artist: 'C' })),
      ];
      const out = smartShuffle(items, (x) => x.artist, seededRng(seed));
      expect(out).toHaveLength(items.length);
      for (let i = 1; i < out.length; i++) expect(out[i]!.artist).not.toBe(out[i - 1]!.artist);
    }
  });

  it('smart shuffle respects the previous artist', () => {
    const items = [
      { id: 1, artist: 'X' },
      { id: 2, artist: 'Y' },
    ];
    const out = smartShuffle(items, (x) => x.artist, seededRng(9), 'X');
    expect(out[0]!.artist).toBe('Y');
  });
});
