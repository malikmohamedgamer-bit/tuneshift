/**
 * Rasterises assets/logo.svg into the PWA icons, favicon and the 1024 px source used by
 * `tauri icon`. Uses the Playwright Chromium already installed for tests (no native deps).
 *   pnpm tsx scripts/make-icons.ts
 */
import { chromium } from 'playwright';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const svg = readFileSync(join(root, 'assets/logo.svg'), 'utf8');
const pub = join(root, 'apps/web/public');
mkdirSync(join(pub, 'icons'), { recursive: true });

const targets: { file: string; size: number; maskable?: boolean }[] = [
  { file: join(pub, 'icons/icon-192.png'), size: 192 },
  { file: join(pub, 'icons/icon-512.png'), size: 512 },
  { file: join(pub, 'icons/icon-maskable-512.png'), size: 512, maskable: true },
  { file: join(pub, 'apple-touch-icon.png'), size: 180, maskable: true },
  { file: join(root, 'assets/logo-1024.png'), size: 1024 },
  { file: join(root, 'apps/extension/public/icons/icon-16.png'), size: 16 },
  { file: join(root, 'apps/extension/public/icons/icon-32.png'), size: 32 },
  { file: join(root, 'apps/extension/public/icons/icon-48.png'), size: 48 },
  { file: join(root, 'apps/extension/public/icons/icon-128.png'), size: 128 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  mkdirSync(join(t.file, '..'), { recursive: true });
  // Maskable icons need a full-bleed background with the logo inside the 80 % safe zone.
  const inner = t.maskable
    ? `<div style="width:${t.size}px;height:${t.size}px;background:#0d0b14;display:grid;place-items:center">
         <div style="width:${t.size * 0.8}px;height:${t.size * 0.8}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></div>`
    : `<div style="width:${t.size}px;height:${t.size}px">${svg.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div>`;
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${inner}</body></html>`,
  );
  await page.screenshot({
    path: t.file,
    omitBackground: !t.maskable,
    clip: { x: 0, y: 0, width: t.size, height: t.size },
  });
  console.log('wrote', t.file);
}
await browser.close();
copyFileSync(join(root, 'assets/logo.svg'), join(pub, 'favicon.svg'));
console.log('wrote favicon.svg');
