import { create } from 'zustand';
import { neutralSound, soundLabel, type SoundRef, type SoundSettings } from '@tuneshift/core';

/** Where the active sound came from (spec §4.6 priority: song > playlist > global). */
export type SoundOrigin = 'song' | 'playlist' | 'global' | 'manual';

export interface SoundState {
  settings: SoundSettings;
  /** Preset/saved sound this matches, if any. */
  ref: SoundRef | null;
  label: string;
  origin: SoundOrigin;
  /** True once the user picked something this session (persists across songs). */
  manual: boolean;
}

export const useSound = create<SoundState>(() => ({
  settings: neutralSound(),
  ref: { kind: 'preset', id: 'normal' },
  label: 'Normal',
  origin: 'global',
  manual: false,
}));

export function setSound(
  settings: SoundSettings,
  opts: { ref?: SoundRef | null; label?: string; origin?: SoundOrigin } = {},
): void {
  const origin = opts.origin ?? 'manual';
  useSound.setState({
    settings,
    ref: opts.ref ?? null,
    label: opts.label ?? soundLabel(settings),
    origin,
    manual: origin === 'manual' ? true : useSound.getState().manual,
  });
}

export const getSound = () => useSound.getState();
