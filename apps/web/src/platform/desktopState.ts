import type { SmtcInfo } from './tauriBridge';

/** Snapshot broadcast from the main window to the mini player and overlay (~4 Hz + on change). */
export interface DesktopState {
  trackKey: string | null;
  title: string | null;
  artist: string | null;
  /** http(s) or asset URL usable from another window (local IndexedDB covers are null). */
  artwork: string | null;
  playing: boolean;
  position: number;
  duration: number;
  preset: string;
  liked: boolean;
  fullEffects: boolean;
  upNext: { title: string; artist: string }[];
  boostOn: boolean;
  smtc: SmtcInfo | null;
  settings: {
    miniOpacity: number;
    overlayMode: 'always' | 'change' | 'off';
    overlaySeconds: number;
    themeId: string;
  };
}

export type DesktopCommand =
  | 'play'
  | 'next'
  | 'prev'
  | 'like'
  | 'toggle-mini'
  | 'toggle-overlay'
  | 'toggle-boost'
  | 'show-main'
  | `preset:${string}`
  | `seek:${number}`
  | `smtc:${'toggle' | 'next' | 'previous'}`;

export const STATE_EVENT = 'ts://state';
export const COMMAND_EVENT = 'ts://command';

/** "Ctrl+Alt+Right" (settings) → "CommandOrControl+Alt+ArrowRight" (Tauri accelerator). */
export function toAccelerator(combo: string): string {
  return combo
    .split('+')
    .map((p) => {
      const k = p.trim();
      if (/^ctrl$/i.test(k)) return 'CommandOrControl';
      if (/^(left|right|up|down)$/i.test(k))
        return `Arrow${k[0]?.toUpperCase()}${k.slice(1).toLowerCase()}`;
      return k.length === 1 ? k.toUpperCase() : k;
    })
    .join('+');
}
