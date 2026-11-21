import type { SpeedMessage } from './lib/messages';

/**
 * Page speed control (spec §11.3), injected on demand into the active tab. It only sets
 * `playbackRate` and `preservesPitch` on the page's own <audio>/<video> elements — the same as a
 * video speed controller. It never changes page content, hides anything or downloads anything.
 */

interface SpeedState {
  rate: number | null;
  preservesPitch: boolean;
}

declare global {
  interface Window {
    __tuneshiftSpeed?: SpeedState;
  }
}

function apply(el: HTMLMediaElement, s: SpeedState) {
  const rate = s.rate ?? 1;
  const keep = s.rate === null ? true : s.preservesPitch;
  try {
    if (el.preservesPitch !== keep) el.preservesPitch = keep;
    if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
  } catch {
    // Some players lock these properties; nothing to do.
  }
}

function applyAll(s: SpeedState) {
  document.querySelectorAll<HTMLMediaElement>('audio, video').forEach((el) => apply(el, s));
}

if (!window.__tuneshiftSpeed) {
  const state: SpeedState = { rate: null, preservesPitch: true };
  window.__tuneshiftSpeed = state;

  // Players often reset the rate when a new item loads: re-apply then (capture phase, because
  // media events don't bubble). Elements created later are covered the same way.
  for (const type of ['play', 'playing', 'loadedmetadata']) {
    document.addEventListener(
      type,
      (e) => {
        if (state.rate !== null && e.target instanceof HTMLMediaElement) apply(e.target, state);
      },
      true,
    );
  }

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    const msg = raw as Partial<SpeedMessage> | undefined;
    if (msg?.type !== 'tuneshift:speed') return false;
    const wasOn = state.rate !== null;
    state.rate = typeof msg.rate === 'number' ? Math.min(4, Math.max(0.25, msg.rate)) : null;
    state.preservesPitch = msg.preservesPitch !== false;
    if (state.rate !== null || wasOn) applyAll(state);
    sendResponse({ ok: true, data: document.querySelectorAll('audio, video').length });
    return false;
  });
}
