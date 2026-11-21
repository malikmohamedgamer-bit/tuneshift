import type { Track } from '@tuneshift/core';

/**
 * Small pub/sub for player events other subsystems care about (desktop overlay, Discord
 * presence, friends activity, listening parties) without importing the controller.
 */
export interface PlayerEvents {
  track: { track: Track };
  sound: { label: string };
}

type Fn<K extends keyof PlayerEvents> = (p: PlayerEvents[K]) => void;
const subs = new Map<keyof PlayerEvents, Set<Fn<never>>>();

export function onPlayerEvent<K extends keyof PlayerEvents>(name: K, fn: Fn<K>): () => void {
  let s = subs.get(name);
  if (!s) {
    s = new Set();
    subs.set(name, s);
  }
  s.add(fn as Fn<never>);
  return () => s.delete(fn as Fn<never>);
}

export function emitPlayerEvent<K extends keyof PlayerEvents>(
  name: K,
  payload: PlayerEvents[K],
): void {
  subs.get(name)?.forEach((fn) => (fn as Fn<K>)(payload));
}
