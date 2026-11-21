import type {
  BackgroundMessage,
  LiveStats,
  OffscreenMessage,
  Reply,
  SessionInfo,
  SpeedMessage,
} from '../lib/messages';

/** Omit over each member of a union (plain Omit collapses the union). */
type Untargeted<T> = T extends unknown ? Omit<T, 'target'> : never;

async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const r = (await p) as Reply<T> | undefined;
  if (!r) throw new Error('Tuneshift Boost did not answer. Try again.');
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

export function toBackground<T = null>(msg: Untargeted<BackgroundMessage>): Promise<T> {
  return unwrap<T>(chrome.runtime.sendMessage({ target: 'background', ...msg }));
}

export function toOffscreen<T = null>(msg: Untargeted<OffscreenMessage>): Promise<T> {
  return unwrap<T>(chrome.runtime.sendMessage({ target: 'offscreen', ...msg }));
}

export const listSessions = () => toBackground<SessionInfo[]>({ type: 'sessions' });

export async function liveStats(tabId: number): Promise<LiveStats | null> {
  try {
    return await toOffscreen<LiveStats | null>({ type: 'stats', tabId });
  } catch {
    return null; // offscreen document not running
  }
}

/** Inject the page speed script (idempotent) and send it the current speed. */
export async function sendPageSpeed(
  tabId: number,
  rate: number | null,
  preservesPitch: boolean,
): Promise<void> {
  if (rate !== null)
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  const msg: SpeedMessage = { type: 'tuneshift:speed', rate, preservesPitch };
  await chrome.tabs.sendMessage(tabId, msg).catch((e: unknown) => {
    // Turning off on a page that never had the script is fine.
    if (rate !== null) throw e;
  });
}

export const speedKey = (tabId: number) => `speed:${tabId}`;
