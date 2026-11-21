import { isTauri } from './detect';

/** Thin, lazily-loaded wrappers around the desktop (Rust) commands. Safe to call on the web. */

export interface SmtcInfo {
  app: string;
  title: string;
  artist: string;
  playing: boolean;
  /** data: URL of the thumbnail, when the app provides one. */
  thumbnail: string | null;
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import('@tauri-apps/api/core');
  return core.invoke<T>(cmd, args);
}

export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else window.open(url, '_blank', 'noopener');
}

/** Windows SMTC: what another app (Spotify, browser…) is playing. Null when unavailable. */
export async function smtcCurrent(): Promise<SmtcInfo | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<SmtcInfo | null>('smtc_current');
  } catch {
    return null;
  }
}

export async function smtcControl(action: 'toggle' | 'next' | 'previous'): Promise<void> {
  if (!isTauri()) return;
  try {
    await invoke('smtc_control', { action });
  } catch {
    // SMTC session went away
  }
}

export { invoke as tauriInvoke };
