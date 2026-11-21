/** Random helpers. `Rng` returns a float in [0, 1). Seedable for deterministic tests. */
export type Rng = () => number;

export const defaultRng: Rng = () => Math.random();

/** mulberry32 — small, fast, good-enough seeded PRNG. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle (returns a new array). */
export function fisherYates<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return a;
}

/**
 * Smart shuffle: random order that avoids the same artist back-to-back whenever possible.
 * `prevKey` is the artist of whatever plays right before the first item.
 */
export function smartShuffle<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  rng: Rng = defaultRng,
  prevKey?: string,
): T[] {
  const pool = fisherYates(items, rng);
  const out: T[] = [];
  let last = prevKey;
  while (pool.length) {
    const counts = new Map<string, number>();
    for (const it of pool) counts.set(keyOf(it), (counts.get(keyOf(it)) ?? 0) + 1);
    let maxKey = '';
    let maxCount = 0;
    for (const [k, c] of counts) if (c > maxCount) [maxKey, maxCount] = [k, c];
    let candidates: number[] = [];
    // If one artist fills more than half of what's left it must go now, or it can't be separated.
    if (maxCount * 2 > pool.length && maxKey !== last) {
      pool.forEach((it, i) => keyOf(it) === maxKey && candidates.push(i));
    } else {
      pool.forEach((it, i) => keyOf(it) !== last && candidates.push(i));
    }
    if (!candidates.length) candidates = pool.map((_, i) => i); // only same-artist items remain
    const pick = candidates[Math.floor(rng() * candidates.length)] as number;
    const [picked] = pool.splice(pick, 1) as [T];
    out.push(picked);
    last = keyOf(picked);
  }
  return out;
}

export function createId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
