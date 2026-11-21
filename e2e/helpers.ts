import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import {
  audiusPlaylists,
  audiusTracks,
  audiusUsers,
  envelope,
  lrclibRecord,
} from '../packages/sources/src/mocks/fixtures';

const root = join(import.meta.dirname, '..');
export const DEMO_MP3 = readFileSync(join(root, 'apps/web/public/demo/neon-pluck.mp3'));
export const MELODY_WAV = readFileSync(join(root, 'e2e/fixtures/melody.wav'));
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export interface MockOptions {
  /**
   * Redirect Audius streams to this cross-origin URL (a real local server that sends NO CORS
   * headers), so the browser's own CORS enforcement makes the probe fail → Limited mode.
   */
  streamRedirect?: string;
}

/** A real HTTP server (different origin) serving the demo MP3 without CORS headers. */
export async function startNoCorsServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const { createServer } = await import('node:http');
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': DEMO_MP3.length });
    res.end(DEMO_MP3);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}/stream.mp3`,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

const json = (route: Route, body: unknown) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  });

/** Mock every external API the app touches so tests are hermetic (spec §13: no keys, no network). */
export async function mockApis(page: Page, opts: MockOptions = {}): Promise<void> {
  await page.route('https://api.audius.co/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/v1', '');
    if (/^\/tracks\/[^/]+\/stream$/.test(path)) {
      const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: cors });
      if (opts.streamRedirect) {
        return route.fulfill({ status: 302, headers: { ...cors, Location: opts.streamRedirect } });
      }
      return route.fulfill({
        status: 200,
        headers: { ...cors, 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes' },
        body: DEMO_MP3,
      });
    }
    if (path === '/tracks/search') {
      const q = (url.searchParams.get('query') ?? '').toLowerCase();
      return json(
        route,
        envelope(
          audiusTracks.filter((t) =>
            q.split(/\s+/).some((w) => `${t.title} ${t.tags ?? ''}`.toLowerCase().includes(w)),
          ),
        ),
      );
    }
    if (path === '/tracks/trending') return json(route, envelope(audiusTracks));
    if (path === '/users/search') return json(route, envelope(audiusUsers));
    if (path === '/playlists/search') return json(route, envelope(audiusPlaylists));
    if (/^\/users\/[^/]+\/tracks$/.test(path))
      return json(route, envelope(audiusTracks.slice(0, 2)));
    if (/^\/users\/[^/]+$/.test(path)) return json(route, envelope(audiusUsers[0]));
    if (/^\/playlists\/[^/]+\/tracks$/.test(path))
      return json(route, envelope(audiusTracks.slice(0, 2)));
    if (/^\/playlists\/[^/]+$/.test(path)) return json(route, envelope([audiusPlaylists[0]]));
    const m = /^\/tracks\/([^/]+)$/.exec(path);
    if (m) return json(route, envelope(audiusTracks.find((t) => t.id === m[1]) ?? audiusTracks[0]));
    return route.fulfill({ status: 404, body: '{}' });
  });
  await page.route('https://lrclib.net/api/**', (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'lrclib-client,x-user-agent',
        },
      });
    }
    return json(route, route.request().url().includes('/search') ? [lrclibRecord] : lrclibRecord);
  });
  await page.route(/audius\.test|jamendo\.test/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: PNG_1PX,
    }),
  );
}

/** Skip onboarding for tests that start inside the app. */
export async function markOnboarded(page: Page, name = 'Tester'): Promise<void> {
  await page.addInitScript((n) => {
    if (!localStorage.getItem('tuneshift:settings')) {
      localStorage.setItem(
        'tuneshift:settings',
        JSON.stringify({ state: { onboarded: true, displayName: n }, version: 1 }),
      );
    }
  }, name);
}

/** Simulate dropping audio files onto the window (exercises the real import path). */
export async function dropFile(
  page: Page,
  name: string,
  bytes: Buffer,
  type: string,
): Promise<void> {
  await page.evaluate(
    async ({ name, b64, type }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bin], name, { type, lastModified: 1_700_000_000_000 });
      const dt = new DataTransfer();
      dt.items.add(file);
      for (const kind of ['dragenter', 'dragover', 'drop'] as const) {
        window.dispatchEvent(
          new DragEvent(kind, { dataTransfer: dt, bubbles: true, cancelable: true }),
        );
        await new Promise((r) => setTimeout(r, 20));
      }
    },
    { name, b64: bytes.toString('base64'), type },
  );
}

/** Console errors that come from the page itself (third-party network failures excluded). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource'))
      errors.push(m.text());
  });
  return errors;
}
