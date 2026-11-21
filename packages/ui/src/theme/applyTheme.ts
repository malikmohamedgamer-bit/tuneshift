import { builtInTheme, SAFE_THEME_ID, themeToCssVars, type Theme } from '@tuneshift/core';

export interface ApplyThemeOptions {
  /** Accent extracted from album art (adaptive accent). */
  accentOverride?: string;
  /** 0.9–1.3 */
  textScale?: number;
  reducedMotion?: boolean;
  root?: HTMLElement;
}

const CUSTOM_CSS_ID = 'ts-custom-css';

/**
 * Sanitises user CSS and scopes it to the app root using CSS nesting, so it can't restyle
 * anything outside #root. @import (remote loads) and attempts to close the style tag are removed.
 */
export function scopeCustomCss(css: string): string {
  const cleaned = css
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/@charset[^;]*;?/gi, '')
    .replace(/expression\s*\(/gi, '(')
    .slice(0, 20000);
  return cleaned.trim() ? `#root {\n${cleaned}\n}` : '';
}

export function applyTheme(theme: Theme, opts: ApplyThemeOptions = {}): void {
  const root = opts.root ?? document.documentElement;
  const vars = themeToCssVars(theme, opts.accentOverride);
  for (const [k, v] of Object.entries(vars)) {
    if (k === 'color-scheme') root.style.colorScheme = v;
    else root.style.setProperty(k, v);
  }
  root.style.setProperty('--text-scale', String(opts.textScale ?? 1));
  root.dataset.scheme = theme.colorScheme;
  root.dataset.animatedGradient = String(theme.animatedGradient);
  root.dataset.density = theme.density;
  root.dataset.theme = theme.id;
  if (opts.reducedMotion !== undefined) root.dataset.reducedMotion = String(opts.reducedMotion);
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', theme.tokens.bg);
  let style = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null;
  const css = scopeCustomCss(theme.customCss ?? '');
  if (css) {
    if (!style) {
      style = document.createElement('style');
      style.id = CUSTOM_CSS_ID;
      document.head.appendChild(style);
    }
    style.textContent = css;
  } else style?.remove();
}

/** Escape hatch: drop custom CSS and apply the safe default theme. */
export function applySafeTheme(): Theme {
  const safe = builtInTheme(SAFE_THEME_ID) as Theme;
  document.getElementById(CUSTOM_CSS_ID)?.remove();
  applyTheme(safe);
  return safe;
}
