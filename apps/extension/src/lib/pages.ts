import type { SoundSettings } from '@tuneshift/core';

/**
 * Which pages the extension can work on. Chrome never lets extensions capture or script its own
 * pages, other extensions or the web stores.
 */
const BLOCKED_SCHEMES = [
  'chrome:',
  'edge:',
  'about:',
  'chrome-extension:',
  'extension:',
  'devtools:',
  'view-source:',
  'chrome-search:',
];
const BLOCKED_HOSTS = [
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
];

function parse(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function captureBlockedReason(url: string | undefined): string | null {
  const u = parse(url);
  if (!u) return 'Open a web page with audio to boost it.';
  if (BLOCKED_SCHEMES.includes(u.protocol)) return 'Browser pages can’t be boosted.';
  if (BLOCKED_HOSTS.includes(u.hostname)) return 'The web store can’t be boosted.';
  return null;
}

/** Spotify Web's player resets playbackRate, so page speed control is not offered there. */
export function speedBlockedReason(url: string | undefined): string | null {
  const blocked = captureBlockedReason(url);
  if (blocked) return blocked;
  const u = parse(url) as URL;
  if (/(^|\.)spotify\.com$/.test(u.hostname))
    return 'Speed not supported on Spotify Web (its player resets it).';
  return null;
}

export function hostOf(url: string | undefined): string {
  return parse(url)?.hostname.replace(/^www\./, '') ?? '';
}

export function originOf(url: string | undefined): string {
  return parse(url)?.origin ?? '';
}

/**
 * Page speed for a sound: tape mode lets pitch follow speed (Sped Up / Slowed / Nightcore);
 * independent mode keeps the pitch (and the worklet adds the chosen semitones).
 */
export function pageSpeedFor(s: SoundSettings): { rate: number; preservesPitch: boolean } {
  const rate = Math.min(4, Math.max(0.25, Math.round(s.speed * 1000) / 1000));
  return { rate, preservesPitch: s.pitchMode === 'independent' };
}
