import { z } from 'zod';
import { ensureContrast, ensureFillContrast, mix, withAlpha } from './color';
import type { SyncMeta } from './types';

export const FONT_IDS = [
  'system',
  'inter',
  'outfit',
  'space-grotesk',
  'nunito',
  'unbounded',
] as const;
export type FontId = (typeof FONT_IDS)[number];

export const FONT_LABEL: Record<FontId, string> = {
  system: 'System',
  inter: 'Inter',
  outfit: 'Outfit',
  'space-grotesk': 'Space Grotesk',
  nunito: 'Nunito',
  unbounded: 'Unbounded',
};

const SYSTEM_STACK = `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;

export const FONT_STACK: Record<FontId, string> = {
  system: SYSTEM_STACK,
  inter: `'Inter Variable', ${SYSTEM_STACK}`,
  outfit: `'Outfit Variable', ${SYSTEM_STACK}`,
  'space-grotesk': `'Space Grotesk Variable', ${SYSTEM_STACK}`,
  nunito: `'Nunito Variable', ${SYSTEM_STACK}`,
  unbounded: `'Unbounded Variable', ${SYSTEM_STACK}`,
};

export const TOKEN_KEYS = [
  'bg',
  'bgElevated',
  'surface',
  'surfaceHover',
  'border',
  'text',
  'textMuted',
  'accent',
  'accent2',
  'accentContrast',
] as const;
export type TokenKey = (typeof TOKEN_KEYS)[number];
export type ThemeTokens = Record<TokenKey, string>;

export const TOKEN_LABEL: Record<TokenKey, string> = {
  bg: 'Background',
  bgElevated: 'Elevated background',
  surface: 'Surface',
  surfaceHover: 'Surface (hover)',
  border: 'Border',
  text: 'Text',
  textMuted: 'Muted text',
  accent: 'Accent',
  accent2: 'Accent 2',
  accentContrast: 'Text on accent',
};

export type LayoutId = 'classic' | 'compact' | 'focus';

export interface Theme extends Partial<SyncMeta> {
  id: string;
  name: string;
  builtIn?: boolean;
  colorScheme: 'dark' | 'light';
  tokens: ThemeTokens;
  gradient: { stops: string[]; angle: number };
  animatedGradient: boolean;
  /** Glass blur in px (0–40). */
  blur: number;
  /** Base corner radius in px (0–28); sm/md/lg/xl derive from it. */
  radius: number;
  fontSans: FontId;
  fontDisplay: FontId;
  density: 'compact' | 'comfortable';
  shadow: 'none' | 'soft' | 'strong';
  adaptiveAccent: boolean;
  /** Decorative falling petals (Cherry Blossom). */
  petals?: boolean;
  /** Advanced: custom CSS, scoped to the app root at apply time. */
  customCss?: string;
}

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected #rrggbb');

export const ThemeSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
  builtIn: z.boolean().optional(),
  colorScheme: z.enum(['dark', 'light']),
  tokens: z.object(
    Object.fromEntries(TOKEN_KEYS.map((k) => [k, hex])) as Record<TokenKey, typeof hex>,
  ),
  gradient: z.object({ stops: z.array(hex).min(2).max(4), angle: z.number().min(0).max(360) }),
  animatedGradient: z.boolean(),
  blur: z.number().min(0).max(40),
  radius: z.number().min(0).max(28),
  fontSans: z.enum(FONT_IDS),
  fontDisplay: z.enum(FONT_IDS),
  density: z.enum(['compact', 'comfortable']),
  shadow: z.enum(['none', 'soft', 'strong']),
  adaptiveAccent: z.boolean(),
  petals: z.boolean().optional(),
  customCss: z.string().max(20000).optional(),
  updatedAt: z.number().optional(),
  deleted: z.boolean().optional(),
});

/** Colours the engine derives so every theme meets WCAG AA regardless of the chosen accent. */
export interface DerivedColors {
  /** Accent usable as text/icon colour on `bg` (≥ 4.5:1). */
  accentText: string;
  /** Accent usable as a button fill under `accentContrast` (≥ 4.5:1). */
  accentFill: string;
  /** Muted text guaranteed ≥ 4.5:1 on surface. */
  textMuted: string;
}

export function deriveColors(t: Pick<Theme, 'tokens'>, accentOverride?: string): DerivedColors {
  const accent = accentOverride ?? t.tokens.accent;
  const worstBg = [t.tokens.bg, t.tokens.surface, t.tokens.bgElevated];
  let accentText = accent;
  for (const bg of worstBg) accentText = ensureContrast(accentText, bg, 4.5);
  let textMuted = t.tokens.textMuted;
  for (const bg of [...worstBg, t.tokens.surfaceHover])
    textMuted = ensureContrast(textMuted, bg, 4.5);
  return {
    accentText,
    accentFill: ensureFillContrast(accent, t.tokens.accentContrast, 4.5),
    textMuted,
  };
}

const SHADOWS: Record<Theme['shadow'], string> = {
  none: 'none',
  soft: '0 8px 30px rgba(0,0,0,0.25)',
  strong: '0 14px 48px rgba(0,0,0,0.5)',
};

/** Theme → CSS custom properties (the design tokens Tailwind reads). */
export function themeToCssVars(t: Theme, accentOverride?: string): Record<string, string> {
  const d = deriveColors(t, accentOverride);
  const accent = accentOverride ?? t.tokens.accent;
  const stops = accentOverride
    ? [accentOverride, mix(accentOverride, t.tokens.accent2, 0.6)]
    : t.gradient.stops;
  const r = t.radius;
  return {
    '--bg': t.tokens.bg,
    '--bg-elevated': t.tokens.bgElevated,
    '--surface': t.tokens.surface,
    '--surface-hover': t.tokens.surfaceHover,
    '--border': t.tokens.border,
    '--text': t.tokens.text,
    '--text-muted': d.textMuted,
    '--accent': accent,
    '--accent-2': t.tokens.accent2,
    '--accent-contrast': t.tokens.accentContrast,
    '--accent-text': d.accentText,
    '--accent-fill': d.accentFill,
    '--accent-soft': withAlpha(accent, 0.18),
    '--gradient-hero': `linear-gradient(${t.gradient.angle}deg, ${stops.join(', ')})`,
    '--gradient-stops': stops.join(', '),
    '--radius-sm': `${Math.round(r * 0.5)}px`,
    '--radius-md': `${r}px`,
    '--radius-lg': `${Math.round(r * 1.5)}px`,
    '--radius-xl': `${Math.round(r * 2)}px`,
    '--blur': `${t.blur}px`,
    '--font-sans': FONT_STACK[t.fontSans],
    '--font-display': FONT_STACK[t.fontDisplay],
    '--shadow': SHADOWS[t.shadow],
    '--density': t.density === 'compact' ? '0.8' : '1',
    'color-scheme': t.colorScheme,
  };
}

/** Pairs checked for WCAG AA (≥ 4.5:1) — used by tests and the theme editor's warning. */
export function contrastPairs(t: Theme): { label: string; fg: string; bg: string }[] {
  const d = deriveColors(t);
  return [
    { label: 'Text on background', fg: t.tokens.text, bg: t.tokens.bg },
    { label: 'Text on surface', fg: t.tokens.text, bg: t.tokens.surface },
    { label: 'Text on elevated', fg: t.tokens.text, bg: t.tokens.bgElevated },
    { label: 'Text on hover', fg: t.tokens.text, bg: t.tokens.surfaceHover },
    { label: 'Muted text on background', fg: d.textMuted, bg: t.tokens.bg },
    { label: 'Muted text on surface', fg: d.textMuted, bg: t.tokens.surface },
    { label: 'Accent text on background', fg: d.accentText, bg: t.tokens.bg },
    { label: 'Button text on accent', fg: t.tokens.accentContrast, bg: d.accentFill },
  ];
}
