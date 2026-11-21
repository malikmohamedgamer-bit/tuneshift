import { create } from 'zustand';
import { emptyQueue, type QueueState, type Track } from '@tuneshift/core';
import type { DeckMode } from '@tuneshift/audio';

export type PlayStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering';
export type SleepMode = 'off' | 'time' | 'track' | 'queue';

export interface PlayerState {
  queue: QueueState;
  /** Metadata for everything the queue references. */
  tracks: Record<string, Track>;
  current: Track | null;
  status: PlayStatus;
  position: number;
  duration: number;
  /** Native capability of the current track: 'fx' = Full Sound Lab, 'direct' = Speed only. */
  mode: DeckMode | null;
  /** Background-safe hand-off currently active. */
  backgroundHandoff: boolean;
  contextState: AudioContextState | 'none';
  /** The browser refused to start audio — show "Tap to start audio". */
  needsGesture: boolean;
  loop: { a: number | null; b: number | null };
  sleep: { mode: SleepMode; endsAt?: number };
  comparing: boolean;
  /** Screen-reader announcement (track changes). */
  announcement: string;
}

export const usePlayer = create<PlayerState>(() => ({
  queue: emptyQueue(),
  tracks: {},
  current: null,
  status: 'idle',
  position: 0,
  duration: 0,
  mode: null,
  backgroundHandoff: false,
  contextState: 'none',
  needsGesture: false,
  loop: { a: null, b: null },
  sleep: { mode: 'off' },
  comparing: false,
  announcement: '',
}));

export const getPlayer = () => usePlayer.getState();
export const setPlayer = (patch: Partial<PlayerState>) => usePlayer.setState(patch);
