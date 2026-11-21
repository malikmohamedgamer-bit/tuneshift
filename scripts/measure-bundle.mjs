// Measures gzipped JS the home page loads (run `pnpm build && pnpm preview` first).
import { chromium } from 'playwright';
import { gzipSync } from 'node:zlib';
const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(() =>
  localStorage.setItem(
    'tuneshift:settings',
    JSON.stringify({ state: { onboarded: true }, version: 1 }),
  ),
);
const page = await ctx.newPage();
const js = new Map();
page.on('response', async (r) => {
  if (r.url().endsWith('.js') && r.url().includes('/assets/')) {
    try {
      const b = await r.body();
      js.set(r.url().split('/').pop(), gzipSync(b).length);
    } catch {
      /* body unavailable (redirect/cache) */
    }
  }
});
await page.route(/audius|lrclib/, (r) =>
  r.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' }),
);
const critical = new Set();
let loaded = false;
page.on('load', () => (loaded = true));
page.on('request', (r) => {
  if (!loaded && r.url().endsWith('.js')) critical.add(r.url().split('/').pop());
});
await page.goto('http://localhost:4173/tuneshift/');
await page.waitForTimeout(2500);
let total = 0;
for (const [k, v] of [...js].sort((a, b) => b[1] - a[1])) {
  total += v;
  console.log(String((v / 1024).toFixed(1)).padStart(7), k);
}
console.log('TOTAL gz KB (after 2.5 s, incl. idle loads)', (total / 1024).toFixed(1));
let crit = 0;
for (const [k, v] of js) if (critical.has(k)) crit += v;
console.log('CRITICAL gz KB (requested before the load event)', (crit / 1024).toFixed(1));
await browser.close();
