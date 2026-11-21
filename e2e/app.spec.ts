import { expect, test } from '@playwright/test';
import { SOUND_PRESETS } from '../packages/core/src/presets';
import {
  collectErrors,
  dropFile,
  markOnboarded,
  MELODY_WAV,
  mockApis,
  startNoCorsServer,
} from './helpers';

test.describe('Tuneshift web (production build at /tuneshift/)', () => {
  test('onboarding → greeting with my name', async ({ page }) => {
    const errors = collectErrors(page);
    await mockApis(page);
    await page.goto('./');
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await page.getByTestId('onboarding-name').fill('Malik');
    for (let i = 0; i < 4; i++) await page.getByTestId('onboarding-next').click();
    await page.getByRole('button', { name: 'Start listening' }).click();
    await expect(page.getByTestId('greeting')).toContainText('Malik');
    expect(errors).toEqual([]);
  });

  test('local file: drop → play → every preset applies → My Sound persists after reload', async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await mockApis(page);
    await markOnboarded(page);
    await page.goto('./library?tab=songs');
    await dropFile(page, 'Test Artist - Sine Melody.wav', MELODY_WAV, 'audio/wav');
    await expect(page.getByText('Added 1 song')).toBeVisible();
    const row = page.getByTestId('track-row').filter({ hasText: 'Sine Melody' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Play Sine Melody/ }).click();
    await expect(page.getByTestId('now-title')).toHaveText('Sine Melody');
    // Position advances = audio is actually playing.
    await expect
      .poll(async () => page.getByRole('slider', { name: 'Seek' }).inputValue().then(Number), {
        timeout: 10_000,
      })
      .toBeGreaterThan(0.3);
    await expect(page.getByTestId('capability-badge').first()).toHaveText('Full Sound Lab');

    await page.goto('./lab');
    // Resume restores the track (paused); start it again inside the Sound Lab.
    await page.getByTestId('play-pause').click();
    for (const p of SOUND_PRESETS) {
      await page
        .getByRole('button', { name: new RegExp(`^${p.name.replace('+', '\\+')}`) })
        .first()
        .click();
      await expect(page.getByTestId('preset-badge').first()).toHaveText(p.name);
    }
    // Tweak the sound so it's custom, then save it.
    await page.getByTestId('bass-slider').fill('11');
    await page.getByTestId('sound-name').fill('E2E Car Mix');
    await page.getByTestId('save-sound').click();
    await expect(page.getByTestId('my-sounds')).toContainText('E2E Car Mix');
    await page.reload();
    await expect(page.getByTestId('my-sounds')).toContainText('E2E Car Mix');
    expect(errors).toEqual([]);
  });

  test('themes switch, playlist is created, queue reorders', async ({ page }) => {
    await mockApis(page);
    await markOnboarded(page);
    await page.goto('./settings/appearance');
    await page.getByTestId('theme-ocean').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).toHaveAttribute('data-scheme', 'light');

    await page.goto('./library');
    await page.getByRole('button', { name: 'New playlist' }).click();
    await expect(page).toHaveURL(/\/playlist\//);
    await page.getByLabel('Name').fill('Road Trip');
    await page.getByLabel('Name').blur();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Road Trip');

    await page.goto('./collection/demo');
    await page.getByTestId('collection-play').click();
    await expect(page.getByTestId('now-title')).toHaveText('Midnight Drift');
    const items = page.getByTestId('queue-context-item');
    await expect(items).toHaveCount(2);
    const firstBefore = await items.first().innerText();
    await items.first().focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect(items.nth(1)).toContainText(firstBefore.split('\n')[0] ?? '');
  });

  test('lyrics view with mocked LRCLIB', async ({ page }) => {
    await mockApis(page);
    await markOnboarded(page);
    await page.goto('./collection/demo');
    await page.getByTestId('collection-play').click();
    await page.getByRole('tab', { name: 'Lyrics' }).click();
    const view = page.getByTestId('lyrics-view');
    await expect(view).toContainText('City lights are calling');
    await expect(view).toContainText('Lyrics from');
  });

  test('search with mocked Audius shows grouped results with source badges', async ({ page }) => {
    await mockApis(page);
    await markOnboarded(page);
    await page.goto('./search?q=night');
    const results = page.getByTestId('search-results');
    await expect(results).toContainText('Top result');
    await expect(results).toContainText('Night Runner');
    await expect(results.getByText('Audius').first()).toBeVisible();
    await expect(results).toContainText('Artists');
    await expect(results).toContainText('Playlists & albums');
  });

  test('Limited-mode badge when the CORS probe fails', async ({ page }) => {
    const server = await startNoCorsServer();
    await test.info().attach('no-cors stream', { body: server.url });
    await mockApis(page, { streamRedirect: server.url });
    await markOnboarded(page);
    await page.goto('./search?q=night');
    await page.getByTestId('top-result-play').click();
    await expect(page.getByTestId('now-title')).toHaveText('Night Runner');
    await expect(page.getByTestId('capability-badge').first()).toHaveText('Speed only');
    // In-app navigation (no reload) to the Sound Lab shows why effects are greyed out.
    await page.getByRole('link', { name: 'Sound Lab' }).first().click();
    await expect(
      page.getByText("This source doesn't allow audio processing").first(),
    ).toBeVisible();
    await server.close();
  });

  test('share link round-trip: a shared sound can be added', async ({ page }) => {
    await mockApis(page);
    await markOnboarded(page);
    const { encodeShareCode } = await import('../packages/core/src/shareCode');
    const { presetSettings } = await import('../packages/core/src/presets');
    const code = encodeShareCode({
      kind: 'sound',
      data: { name: 'Shared Club', settings: presetSettings('club') },
    });
    await page.goto(`./s/${code}`);
    await page.getByRole('button', { name: 'Add to my library' }).click();
    await expect(page).toHaveURL(/\/lab$/);
    await expect(page.getByTestId('my-sounds')).toContainText('Shared Club');
  });
});
