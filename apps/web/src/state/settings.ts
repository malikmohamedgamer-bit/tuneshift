import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { DEFAULT_THEME_ID, type LayoutId, type SoundRef, type SourceId } from '@tuneshift/core';
import type { VisualizerMode } from '@tuneshift/audio';

export type NormalizationMode = 'off' | 'track' | 'album';
export type OverlayMode = 'always' | 'change' | 'off';
export type OverlayPosition = 'top-center' | 'top-left' | 'top-right' | 'bottom-center';
export type BackgroundSafe = 'auto' | 'on' | 'off';

export interface Settings {
  displayName: string;
  onboarded: boolean;
  // Appearance
  themeId: string;
  layout: LayoutId;
  textScale: number;
  /** 'system' follows prefers-reduced-motion. */
  motion: 'system' | 'reduced' | 'full';
  visualizer: VisualizerMode;
  showVisualizer: boolean;
  // Playback
  crossfadeSec: number;
  normalization: NormalizationMode;
  autoplay: boolean;
  resume: boolean;
  smartShuffle: boolean;
  // Audio
  volume: number;
  muted: boolean;
  defaultSound: SoundRef;
  outputDeviceId: string;
  backgroundSafe: BackgroundSafe;
  // Sources
  sourcesEnabled: Record<SourceId, boolean>;
  // Lyrics
  lyricsAutoOpen: boolean;
  // Privacy
  shareActivity: boolean;
  privateSession: boolean;
  // Shortcuts (action id → key combo)
  shortcuts: Record<string, string>;
  // Desktop
  closeToTray: boolean;
  launchOnStartup: boolean;
  startMinimized: boolean;
  miniOpacity: number;
  overlayMode: OverlayMode;
  overlayPosition: OverlayPosition;
  overlaySeconds: number;
  overlayClickThrough: boolean;
  discordEnabled: boolean;
  discordClientId: string;
  globalShortcuts: Record<string, string>;
  // Boost
  boostInputDeviceId: string;
  boostOutputDeviceId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  onboarded: false,
  themeId: DEFAULT_THEME_ID,
  layout: 'classic',
  textScale: 1,
  motion: 'system',
  visualizer: 'bars',
  showVisualizer: true,
  crossfadeSec: 0,
  normalization: 'off',
  autoplay: true,
  resume: true,
  smartShuffle: true,
  volume: 0.8,
  muted: false,
  defaultSound: { kind: 'preset', id: 'normal' },
  outputDeviceId: '',
  backgroundSafe: 'auto',
  sourcesEnabled: { local: true, audius: true, jamendo: true },
  lyricsAutoOpen: false,
  shareActivity: true,
  privateSession: false,
  shortcuts: {},
  closeToTray: true,
  launchOnStartup: false,
  startMinimized: false,
  miniOpacity: 0.96,
  overlayMode: 'change',
  overlayPosition: 'top-center',
  overlaySeconds: 6,
  overlayClickThrough: true,
  discordEnabled: false,
  discordClientId: '',
  globalShortcuts: {
    playPause: 'Ctrl+Alt+Space',
    next: 'Ctrl+Alt+Right',
    prev: 'Ctrl+Alt+Left',
    cyclePreset: 'Ctrl+Alt+B',
    toggleMini: 'Ctrl+Alt+M',
    toggleOverlay: 'Ctrl+Alt+O',
  },
  boostInputDeviceId: '',
  boostOutputDeviceId: '',
};

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const SETTINGS_STORAGE_KEY = 'tuneshift:settings';

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set({ ...DEFAULT_SETTINGS, onboarded: true }),
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _s, reset: _r, ...rest }) => rest,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return {
          ...current,
          ...p,
          sourcesEnabled: { ...current.sourcesEnabled, ...p.sourcesEnabled },
          globalShortcuts: { ...current.globalShortcuts, ...p.globalShortcuts },
          shortcuts: { ...current.shortcuts, ...p.shortcuts },
        };
      },
    },
  ),
);

export const getSettings = (): Settings => useSettings.getState();

export function prefersReducedMotion(): boolean {
  const m = getSettings().motion;
  if (m !== 'system') return m === 'reduced';
  return (
    typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
