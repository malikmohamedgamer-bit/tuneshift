import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/nunito';
import '@fontsource-variable/unbounded';
import '@tuneshift/ui/styles.css';
import { applySafeTheme, applyTheme } from '@tuneshift/ui';
import { builtInTheme } from '@tuneshift/core';
import { SETTINGS_STORAGE_KEY, useSettings } from './state/settings';
import { App } from './App';
import { secondaryWindowRoot } from './platform/windows';

/**
 * Escape hatch (spec §9): holding Shift while the app loads — or opening with ?safe — drops
 * custom CSS and switches to the safe default theme.
 */
function wantsSafeTheme(): boolean {
  const w = window as Window & { __tsShift?: boolean };
  return Boolean(w.__tsShift) || new URLSearchParams(location.search).has('safe');
}

function bootTheme() {
  if (wantsSafeTheme()) {
    const safe = applySafeTheme();
    try {
      const raw = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}') as {
        state?: Record<string, unknown>;
      };
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ ...raw, state: { ...(raw.state ?? {}), themeId: safe.id } }),
      );
    } catch {
      // storage unavailable
    }
    useSettings.getState().set({ themeId: safe.id });
    sessionStorage.setItem('tuneshift:safe-restored', '1');
    return;
  }
  // Apply built-in themes synchronously to avoid a flash; custom themes apply once IndexedDB loads.
  const t = builtInTheme(useSettings.getState().themeId);
  if (t) applyTheme(t, { textScale: useSettings.getState().textScale });
}

bootTheme();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root');
const secondary = secondaryWindowRoot();
createRoot(rootEl).render(<StrictMode>{secondary ?? <App />}</StrictMode>);
