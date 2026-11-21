import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { presetSettings, SOUND_PRESETS } from '../packages/core/src/presets';
import { encodeShareCode } from '../packages/core/src/shareCode';
import { collectErrors } from './helpers';

/**
 * Tuneshift Boost (spec §11.3), loaded unpacked from apps/extension/dist in real Chromium.
 * Tab capture itself needs a toolbar click (activeTab), which automation can't make, so it is in
 * MANUAL_TESTS.md; everything around it is tested here.
 */

const DIST = join(import.meta.dirname, '..', 'apps', 'extension', 'dist');

let context: BrowserContext;
let extId: string;

test.describe('Tuneshift Boost extension', () => {
  test.skip(!existsSync(join(DIST, 'manifest.json')), 'extension not built (pnpm ext:build)');

  test.beforeAll(async () => {
    const launch = (channel: string) =>
      chromium.launchPersistentContext('', {
        channel,
        args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
      });
    // Extensions need full Chromium (not the headless shell). Where it can't start (seen on a
    // Windows Insider build), Microsoft Edge loads unpacked extensions the same way.
    const wanted = process.env.EXT_CHANNEL ?? 'chromium';
    try {
      context = await launch(wanted);
    } catch (e) {
      if (process.platform !== 'win32' || process.env.EXT_CHANNEL) throw e;
      context = await launch('msedge');
    }
    const sw = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    extId = new URL(sw.url()).host;
  });

  test.afterAll(async () => {
    await context?.close();
  });

  async function openPopup(): Promise<{ page: Page; errors: string[] }> {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await expect(page.getByRole('heading', { name: 'Tuneshift Boost' })).toBeVisible();
    return { page, errors };
  }

  test('manifest is MV3 with the capture permissions and no host access', () => {
    const m = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8')) as {
      manifest_version: number;
      permissions: string[];
      host_permissions?: string[];
      background: { service_worker: string; type: string };
    };
    expect(m.manifest_version).toBe(3);
    expect(m.permissions).toEqual(
      expect.arrayContaining(['tabCapture', 'offscreen', 'storage', 'scripting', 'activeTab']),
    );
    expect(m.host_permissions).toBeUndefined();
    expect(existsSync(join(DIST, m.background.service_worker))).toBe(true);
    expect(existsSync(join(DIST, 'worklet', 'signalsmith-stretch.mjs'))).toBe(true);
  });

  test('popup: presets, My Sounds, share-code import, themes — no console errors', async () => {
    const { page, errors } = await openPopup();
    // The popup opened as a tab sees its own chrome-extension:// page, which can't be captured.
    await expect(
      page.getByRole('region', { name: 'This tab' }).getByText('Browser pages can’t be boosted.'),
    ).toBeVisible();
    await expect(page.getByTestId('boost-toggle')).toBeDisabled();
    await expect(page.getByTestId('page-speed')).toBeDisabled();

    // Every preset applies and is remembered for the next boost.
    for (const p of SOUND_PRESETS.slice(0, 8)) {
      const card = page
        .getByRole('button', { name: new RegExp(`^${p.name.replace('+', '\\+')}`) })
        .first();
      await card.click();
      await expect(card).toHaveAttribute('aria-pressed', 'true');
    }
    const last = SOUND_PRESETS[7];
    await expect
      .poll(() =>
        page.evaluate(() => chrome.storage.local.get('lastLabel').then((r) => r.lastLabel)),
      )
      .toBe(last?.name);

    // Save to My Sounds (chrome.storage.sync).
    await page.getByLabel('Name for this sound').fill('Popup test');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: 'Popup test', exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          chrome.storage.sync
            .get(null)
            .then((all) => Object.keys(all).filter((k) => k.startsWith('mysound:')).length),
        ),
      )
      .toBe(1);

    // Import a sound share code made by the app.
    const preset = SOUND_PRESETS.find((p) => /slowed/i.test(p.name)) ?? SOUND_PRESETS[1];
    const code = encodeShareCode({
      kind: 'sound',
      data: { name: 'Shared slowed', settings: presetSettings(preset?.id ?? '') },
    });
    await page.getByTestId('import-code').fill(`https://example.invalid/s/${code}`);
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('button', { name: 'Shared slowed', exact: true })).toBeVisible();
    await page.getByTestId('import-code').fill('ts1.s.broken.000');
    await page.getByRole('button', { name: 'Import' }).click();
    await expect(page.getByRole('alert')).toContainText(/damaged|Not a Tuneshift/);

    // Delete.
    await page.getByRole('button', { name: 'Delete Popup test' }).click();
    await expect(page.getByRole('button', { name: 'Popup test', exact: true })).toHaveCount(0);

    // Themes: same engine as the app.
    const bg = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
      );
    const before = await bg();
    const select = page.getByTestId('theme-select');
    const other = await select.locator('option').nth(3).getAttribute('value');
    await select.selectOption(other ?? '');
    await expect.poll(bg).not.toBe(before);

    // Re-open: everything persisted.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Shared slowed', exact: true })).toBeVisible();
    await expect(page.getByTestId('theme-select')).toHaveValue(other ?? '');
    expect(errors).toEqual([]);
    await page.close();
  });

  test('popup is accessible (axe)', async () => {
    const { page } = await openPopup();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    await page.close();
  });

  test('service worker refuses browser pages and reports no sessions', async () => {
    const { page } = await openPopup();
    const r = await page.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const start = (await chrome.runtime.sendMessage({
        target: 'background',
        type: 'start',
        tabId: tab?.id,
        sound: {},
        label: 'x',
        tapeToPitch: true,
        volume: 1,
      })) as { ok: boolean; error?: string };
      const sessions = (await chrome.runtime.sendMessage({
        target: 'background',
        type: 'sessions',
      })) as { ok: boolean; data: unknown[] };
      return { start, sessions };
    });
    expect(r.start).toEqual({ ok: false, error: 'Browser pages can’t be boosted.' });
    expect(r.sessions).toEqual({ ok: true, data: [] });
    await page.close();
  });

  test('pitch worklet + WASM load under the extension CSP and shift pitch', async () => {
    const page = await context.newPage();
    const errors = collectErrors(page);
    await page.goto(`chrome-extension://${extId}/offscreen.html`);
    const rms = await page.evaluate(async () => {
      const url = chrome.runtime.getURL('worklet/signalsmith-stretch.mjs');
      const mod = (await import(url)) as {
        default: ((
          ctx: BaseAudioContext,
          o?: AudioWorkletNodeOptions,
        ) => Promise<
          AudioWorkletNode & {
            configure(c: object): Promise<unknown>;
            schedule(c: object): Promise<unknown>;
            start(): Promise<unknown>;
          }
        >) & { moduleUrl?: string };
      };
      mod.default.moduleUrl = url;
      const ctx = new OfflineAudioContext(2, 48000, 48000);
      const osc = new OscillatorNode(ctx, { frequency: 440 });
      const node = await mod.default(ctx, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
      await node.configure({ blockMs: null, preset: 'cheaper' });
      await node.schedule({ semitones: 5 });
      await node.start();
      osc.connect(node).connect(ctx.destination);
      osc.start();
      const out = (await ctx.startRendering()).getChannelData(0).slice(24000);
      let sum = 0;
      for (const v of out) sum += v * v;
      return Math.sqrt(sum / out.length);
    });
    expect(rms).toBeGreaterThan(0.05);
    expect(errors).toEqual([]);
    await page.close();
  });

  test('page speed content script sets rate/preservesPitch and re-applies on new media', async () => {
    const page = await context.newPage();
    await page.setContent('<video id="a"></video><audio id="b"></audio>');
    await page.evaluate(() => {
      type Listener = (m: unknown, s: unknown, r: (x: unknown) => void) => void;
      const listeners: Listener[] = [];
      (window as unknown as { __send: (m: unknown) => unknown }).__send = (m) => {
        let reply: unknown;
        listeners.forEach((l) => l(m, {}, (x) => (reply = x)));
        return reply;
      };
      // A stand-in for the extension messaging API on a plain page.
      const runtime = { onMessage: { addListener: (fn: Listener) => listeners.push(fn) } };
      const w = window as unknown as { chrome?: Record<string, unknown> };
      if (w.chrome)
        Object.defineProperty(w.chrome, 'runtime', { value: runtime, configurable: true });
      else Object.defineProperty(window, 'chrome', { value: { runtime }, configurable: true });
    });
    await page.addScriptTag({ path: join(DIST, 'content.js') });
    const read = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLMediaElement>('audio,video')].map((e) => [
          e.playbackRate,
          e.preservesPitch,
        ]),
      );
    const send = (rate: number | null, preservesPitch: boolean) =>
      page.evaluate((m) => (window as unknown as { __send: (m: unknown) => unknown }).__send(m), {
        type: 'tuneshift:speed',
        rate,
        preservesPitch,
      });
    expect(await send(1.25, false)).toEqual({ ok: true, data: 2 });
    expect(await read()).toEqual([
      [1.25, false],
      [1.25, false],
    ]);
    // A player resetting the rate on a new item, and a new element, both get it re-applied.
    await page.evaluate(() => {
      const v = document.getElementById('a') as HTMLVideoElement;
      v.playbackRate = 1;
      v.dispatchEvent(new Event('loadedmetadata'));
      const c = document.createElement('audio');
      document.body.append(c);
      c.dispatchEvent(new Event('play'));
    });
    expect(await read()).toEqual([
      [1.25, false],
      [1.25, false],
      [1.25, false],
    ]);
    // Off restores normal speed with pitch preserved.
    await send(null, false);
    expect(await read()).toEqual([
      [1, true],
      [1, true],
      [1, true],
    ]);
    await page.close();
  });
});
