import type { Theme, ThemeTokens } from './theme';

type ThemeInit = Omit<
  Theme,
  | 'builtIn'
  | 'animatedGradient'
  | 'blur'
  | 'radius'
  | 'fontSans'
  | 'fontDisplay'
  | 'density'
  | 'shadow'
  | 'adaptiveAccent'
> &
  Partial<Theme>;

function theme(init: ThemeInit): Theme {
  return {
    builtIn: true,
    animatedGradient: false,
    blur: 18,
    radius: 14,
    fontSans: 'inter',
    fontDisplay: 'outfit',
    density: 'comfortable',
    shadow: 'soft',
    adaptiveAccent: false,
    ...init,
  };
}

const t = (tokens: ThemeTokens) => tokens;

/** The 12 built-in themes (spec §9). Midnight Bloom is the default. */
export const BUILT_IN_THEMES: readonly Theme[] = [
  theme({
    id: 'midnight-bloom',
    name: 'Midnight Bloom',
    colorScheme: 'dark',
    tokens: t({
      bg: '#0d0b14',
      bgElevated: '#15121f',
      surface: '#1c1828',
      surfaceHover: '#262036',
      border: '#2e2740',
      text: '#f4f1fa',
      textMuted: '#a9a2bd',
      accent: '#8b5cf6',
      accent2: '#ec4899',
      accentContrast: '#ffffff',
    }),
    gradient: { stops: ['#8b5cf6', '#ec4899'], angle: 135 },
  }),
  theme({
    id: 'neon-night',
    name: 'Neon Night',
    colorScheme: 'dark',
    tokens: t({
      bg: '#05060f',
      bgElevated: '#0b0d1c',
      surface: '#11142a',
      surfaceHover: '#1a1e3a',
      border: '#252a4d',
      text: '#eef2ff',
      textMuted: '#9ea7cb',
      accent: '#22d3ee',
      accent2: '#e879f9',
      accentContrast: '#04111a',
    }),
    gradient: { stops: ['#22d3ee', '#818cf8', '#e879f9'], angle: 120 },
    animatedGradient: true,
    fontDisplay: 'space-grotesk',
  }),
  theme({
    id: 'sunset',
    name: 'Sunset',
    colorScheme: 'dark',
    tokens: t({
      bg: '#140a0c',
      bgElevated: '#1f1013',
      surface: '#2a161a',
      surfaceHover: '#371d22',
      border: '#45262c',
      text: '#fff4ec',
      textMuted: '#d4a99a',
      accent: '#fb923c',
      accent2: '#f43f5e',
      accentContrast: '#1a0b05',
    }),
    gradient: { stops: ['#f97316', '#f43f5e', '#a855f7'], angle: 160 },
  }),
  theme({
    id: 'ocean',
    name: 'Ocean',
    colorScheme: 'dark',
    tokens: t({
      bg: '#04121c',
      bgElevated: '#082030',
      surface: '#0c2a3d',
      surfaceHover: '#12364d',
      border: '#1b4560',
      text: '#e6f6ff',
      textMuted: '#93bbcf',
      accent: '#38bdf8',
      accent2: '#2dd4bf',
      accentContrast: '#03131d',
    }),
    gradient: { stops: ['#0ea5e9', '#2dd4bf'], angle: 140 },
  }),
  theme({
    id: 'forest',
    name: 'Forest',
    colorScheme: 'dark',
    tokens: t({
      bg: '#08110b',
      bgElevated: '#0e1a12',
      surface: '#142419',
      surfaceHover: '#1b2f21',
      border: '#263d2c',
      text: '#ecf7ee',
      textMuted: '#a1bca7',
      accent: '#4ade80',
      accent2: '#a3e635',
      accentContrast: '#052e12',
    }),
    gradient: { stops: ['#15803d', '#4ade80', '#a3e635'], angle: 135 },
    fontDisplay: 'nunito',
  }),
  theme({
    id: 'cherry-blossom',
    name: 'Cherry Blossom',
    colorScheme: 'dark',
    tokens: t({
      bg: '#1b1016',
      bgElevated: '#24151d',
      surface: '#2e1b25',
      surfaceHover: '#3a2230',
      border: '#4a2c3d',
      text: '#fff0f6',
      textMuted: '#e3adc8',
      accent: '#f9a8d4',
      accent2: '#ffffff',
      accentContrast: '#3b0a24',
    }),
    gradient: { stops: ['#f472b6', '#f9a8d4', '#fdf2f8'], angle: 150 },
    petals: true,
    fontDisplay: 'nunito',
    radius: 18,
  }),
  theme({
    id: 'amoled',
    name: 'AMOLED Black',
    colorScheme: 'dark',
    tokens: t({
      bg: '#000000',
      bgElevated: '#0a0a0a',
      surface: '#111111',
      surfaceHover: '#1a1a1a',
      border: '#262626',
      text: '#ffffff',
      textMuted: '#a3a3a3',
      accent: '#a78bfa',
      accent2: '#f472b6',
      accentContrast: '#000000',
    }),
    gradient: { stops: ['#a78bfa', '#f472b6'], angle: 135 },
    blur: 0,
    shadow: 'none',
  }),
  theme({
    id: 'mono',
    name: 'Mono',
    colorScheme: 'dark',
    tokens: t({
      bg: '#0f0f0f',
      bgElevated: '#171717',
      surface: '#1f1f1f',
      surfaceHover: '#2a2a2a',
      border: '#333333',
      text: '#f5f5f5',
      textMuted: '#ababab',
      accent: '#e5e5e5',
      accent2: '#a3a3a3',
      accentContrast: '#0a0a0a',
    }),
    gradient: { stops: ['#404040', '#a3a3a3'], angle: 135 },
    fontDisplay: 'space-grotesk',
    radius: 8,
  }),
  theme({
    id: 'y2k-chrome',
    name: 'Y2K Chrome',
    colorScheme: 'dark',
    tokens: t({
      bg: '#0e1116',
      bgElevated: '#161b22',
      surface: '#1e2530',
      surfaceHover: '#27303d',
      border: '#36414f',
      text: '#f0f6ff',
      textMuted: '#adbacc',
      accent: '#c0d8ff',
      accent2: '#ff8ef0',
      accentContrast: '#0b1220',
    }),
    gradient: { stops: ['#e2e8f0', '#93c5fd', '#f0abfc'], angle: 110 },
    animatedGradient: true,
    fontDisplay: 'unbounded',
    radius: 20,
  }),
  theme({
    id: 'vaporwave',
    name: 'Vaporwave',
    colorScheme: 'dark',
    tokens: t({
      bg: '#12061f',
      bgElevated: '#1c0b2e',
      surface: '#26103d',
      surfaceHover: '#31164d',
      border: '#43205f',
      text: '#fdf4ff',
      textMuted: '#d6ace9',
      accent: '#ff71ce',
      accent2: '#01cdfe',
      accentContrast: '#2a0420',
    }),
    gradient: { stops: ['#ff71ce', '#b967ff', '#01cdfe'], angle: 135 },
    animatedGradient: true,
    fontDisplay: 'unbounded',
  }),
  theme({
    id: 'light',
    name: 'Light',
    colorScheme: 'light',
    tokens: t({
      bg: '#f7f5fb',
      bgElevated: '#ffffff',
      surface: '#ffffff',
      surfaceHover: '#efeaf7',
      border: '#ddd6ea',
      text: '#17121f',
      textMuted: '#5c5470',
      accent: '#7c3aed',
      accent2: '#db2777',
      accentContrast: '#ffffff',
    }),
    gradient: { stops: ['#a78bfa', '#f472b6'], angle: 135 },
  }),
  theme({
    id: 'high-contrast',
    name: 'High Contrast',
    colorScheme: 'dark',
    tokens: t({
      bg: '#000000',
      bgElevated: '#000000',
      surface: '#0a0a0a',
      surfaceHover: '#1f1f1f',
      border: '#ffffff',
      text: '#ffffff',
      textMuted: '#e6e6e6',
      accent: '#ffd60a',
      accent2: '#00e5ff',
      accentContrast: '#000000',
    }),
    gradient: { stops: ['#ffd60a', '#00e5ff'], angle: 90 },
    blur: 0,
    radius: 6,
    shadow: 'none',
  }),
];

export const DEFAULT_THEME_ID = 'midnight-bloom';
/** Theme applied by the "reset to safe theme" escape hatch. */
export const SAFE_THEME_ID = 'midnight-bloom';

export function builtInTheme(id: string): Theme | undefined {
  return BUILT_IN_THEMES.find((th) => th.id === id);
}

export function defaultTheme(): Theme {
  return structuredCloneTheme(builtInTheme(DEFAULT_THEME_ID) as Theme);
}

export function structuredCloneTheme(th: Theme): Theme {
  return {
    ...th,
    tokens: { ...th.tokens },
    gradient: { stops: [...th.gradient.stops], angle: th.gradient.angle },
  };
}
