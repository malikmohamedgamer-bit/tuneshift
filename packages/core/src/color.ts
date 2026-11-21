/** Colour maths: parsing, WCAG contrast, HSL adjustments. */

export interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1] as string;
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: v(0), g: v(2), b: v(4), a: h.length === 8 ? v(6) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1;
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a };
  }
  return null;
}

const hex2 = (n: number) =>
  Math.round(Math.min(255, Math.max(0, n)))
    .toString(16)
    .padStart(2, '0');

export function toHex(c: RGB): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(c: RGB): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

export function contrastRatio(a: string | RGB, b: string | RGB): number {
  const ca = typeof a === 'string' ? parseColor(a) : a;
  const cb = typeof b === 'string' ? parseColor(b) : b;
  if (!ca || !cb) return 1;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  return { r: f(hue + 1 / 3) * 255, g: f(hue) * 255, b: f(hue - 1 / 3) * 255 };
}

export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${alpha})`;
}

/**
 * Nudge `fg`'s lightness (keeping hue) until it reaches `min` contrast against `bg`.
 * Moves toward white on dark backgrounds and toward black on light ones.
 */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  const cf = parseColor(fg);
  const cb = parseColor(bg);
  if (!cf || !cb) return fg;
  if (contrastRatio(cf, cb) >= min) return toHex(cf);
  const hsl = rgbToHsl(cf);
  const lighter = relativeLuminance(cb) < 0.18;
  for (let i = 1; i <= 100; i++) {
    const l = lighter ? hsl.l + ((1 - hsl.l) * i) / 100 : hsl.l - (hsl.l * i) / 100;
    const cand = toHex(hslToRgb({ ...hsl, l }));
    if (contrastRatio(cand, cb) >= min) return cand;
  }
  return lighter ? '#ffffff' : '#000000';
}

/**
 * Darken/lighten a *fill* colour until `text` on it reaches `min` contrast (button backgrounds).
 */
export function ensureFillContrast(fill: string, text: string, min = 4.5): string {
  const cf = parseColor(fill);
  const ct = parseColor(text);
  if (!cf || !ct) return fill;
  if (contrastRatio(cf, ct) >= min) return toHex(cf);
  const hsl = rgbToHsl(cf);
  const textIsLight = relativeLuminance(ct) > 0.4;
  for (let i = 1; i <= 100; i++) {
    const l = textIsLight ? hsl.l - (hsl.l * i) / 100 : hsl.l + ((1 - hsl.l) * i) / 100;
    const cand = toHex(hslToRgb({ ...hsl, l }));
    if (contrastRatio(cand, ct) >= min) return cand;
  }
  return textIsLight ? '#000000' : '#ffffff';
}

/** Best readable text colour (near-white or near-black) for a background. */
export function readableOn(bg: string): string {
  return contrastRatio('#ffffff', bg) >= contrastRatio('#0b0b0f', bg) ? '#ffffff' : '#0b0b0f';
}
