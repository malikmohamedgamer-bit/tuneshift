import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './popup.css';
import { builtInTheme, defaultTheme } from '@tuneshift/core';
import { applyTheme, TooltipProvider } from '@tuneshift/ui';
import { App } from './App';

async function boot() {
  // Apply the saved theme before the first paint (same themes as the app).
  const { themeId } = await chrome.storage.sync.get('themeId').catch(() => ({ themeId: null }));
  applyTheme((typeof themeId === 'string' && builtInTheme(themeId)) || defaultTheme());
  const root = document.getElementById('root');
  if (!root) return;
  createRoot(root).render(
    <StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </StrictMode>,
  );
}

void boot();
