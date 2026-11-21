import { ensureContrast, rgbToHsl, toHex } from '@tuneshift/core';

const cache = new Map<string, string | null>();

/**
 * Extracts a vibrant accent from cover art: downsample to 32×32, score pixels by saturation and
 * mid lightness, bucket hues, pick the strongest bucket, then push it to ≥ 4.5:1 on `bg` (WCAG AA).
 * Returns null when the image can't be read (no CORS) or is greyscale.
 */
export async function extractAccent(url: string, bg: string): Promise<string | null> {
  const key = `${url}|${bg}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const result = await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timer = setTimeout(() => resolve(null), 5000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const g = canvas.getContext('2d', { willReadFrequently: true });
        if (!g) return resolve(null);
        g.drawImage(img, 0, 0, size, size);
        const data = g.getImageData(0, 0, size, size).data;
        const buckets = new Map<
          number,
          { score: number; r: number; g: number; b: number; n: number }
        >();
        for (let i = 0; i < data.length; i += 4) {
          const c = { r: data[i] as number, g: data[i + 1] as number, b: data[i + 2] as number };
          const hsl = rgbToHsl(c);
          if (hsl.s < 0.25 || hsl.l < 0.15 || hsl.l > 0.85) continue;
          const score = hsl.s * (1 - Math.abs(hsl.l - 0.55) * 1.6);
          const hb = Math.round(hsl.h / 24) % 15;
          const bk = buckets.get(hb) ?? { score: 0, r: 0, g: 0, b: 0, n: 0 };
          bk.score += score;
          bk.r += c.r;
          bk.g += c.g;
          bk.b += c.b;
          bk.n += 1;
          buckets.set(hb, bk);
        }
        let best: { score: number; r: number; g: number; b: number; n: number } | undefined;
        for (const b of buckets.values()) if (!best || b.score > best.score) best = b;
        if (!best || best.n < 6) return resolve(null);
        const hex = toHex({ r: best.r / best.n, g: best.g / best.n, b: best.b / best.n });
        resolve(ensureContrast(hex, bg, 4.5));
      } catch {
        resolve(null); // tainted canvas (no CORS on the image host)
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
  cache.set(key, result);
  return result;
}
