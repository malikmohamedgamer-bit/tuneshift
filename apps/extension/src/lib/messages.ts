import type { SoundSettings } from '@tuneshift/core';

export interface SessionInfo {
  tabId: number;
  title: string;
  host: string;
  label: string;
}

export interface LiveStats {
  inputDb: number;
  latencyMs: number;
  pitchStatus: 'idle' | 'loading' | 'ready' | 'unavailable';
  headroom: { autoDb: number; limiterDb: number } | null;
}

export interface SoundUpdate {
  sound: SoundSettings;
  label: string;
  /** True when tape speed must become a pitch shift (page speed control is off). */
  tapeToPitch: boolean;
  volume: number;
}

/** Popup → service worker. Every extension context receives broadcasts, hence `target`. */
export type BackgroundMessage =
  | ({ target: 'background'; type: 'start'; tabId: number } & SoundUpdate)
  | { target: 'background'; type: 'stop'; tabId: number }
  | { target: 'background'; type: 'sessions' }
  | { target: 'background'; type: 'ended'; tabId: number };

/** Service worker / popup → offscreen document. */
export type OffscreenMessage =
  | ({ target: 'offscreen'; type: 'start'; tabId: number; streamId: string } & SoundUpdate)
  | { target: 'offscreen'; type: 'stop'; tabId: number }
  | ({ target: 'offscreen'; type: 'sound'; tabId: number } & SoundUpdate)
  | { target: 'offscreen'; type: 'stats'; tabId: number }
  | { target: 'offscreen'; type: 'active' };

export type Reply<T = null> = { ok: true; data: T } | { ok: false; error: string };

/** Popup → content script (page speed control). */
export interface SpeedMessage {
  type: 'tuneshift:speed';
  /** null turns speed control off and restores 1× with pitch preservation. */
  rate: number | null;
  preservesPitch: boolean;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
