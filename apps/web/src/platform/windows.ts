import { createElement, lazy, Suspense, type ReactNode } from 'react';
import { isTauri } from './detect';

const Mini = lazy(async () => ({
  default: (await import('./windows/SecondaryWindows')).MiniPlayerWindow,
}));
const Overlay = lazy(async () => ({
  default: (await import('./windows/SecondaryWindows')).OverlayWindow,
}));

/**
 * Secondary desktop windows (mini player, game overlay) load the same bundle with `?window=`
 * and render a small controller UI instead of the full app. Null on the web.
 */
export function secondaryWindowRoot(): ReactNode | null {
  const which = new URLSearchParams(window.location.search).get('window');
  if (!which || !isTauri()) return null;
  const C = which === 'overlay' ? Overlay : which === 'mini' ? Mini : null;
  return C ? createElement(Suspense, { fallback: null }, createElement(C)) : null;
}
