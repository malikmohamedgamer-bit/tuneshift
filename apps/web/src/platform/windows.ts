import type { ReactNode } from 'react';

/**
 * Secondary desktop windows (mini player, game overlay) load the same bundle with `?window=`.
 * Wired up in phase 7; on the web there is only the main window.
 */
export function secondaryWindowRoot(): ReactNode | null {
  return null;
}
