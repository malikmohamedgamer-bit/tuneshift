import { expect, test } from '@playwright/test';
import { mockApis } from './helpers';

test.describe('PWA', () => {
  test('manifest scope/start_url match the /tuneshift/ base', async ({ page }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = (await (
      await page.request.get(new URL(href as string, page.url()).toString())
    ).json()) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      name: 'Tuneshift',
      start_url: '/tuneshift/',
      scope: '/tuneshift/',
      display: 'standalone',
    });
    expect((manifest.icons as unknown[]).length).toBeGreaterThanOrEqual(3);
  });

  test('offline shell: the app boots with the network off once the service worker is installed', async ({
    page,
    context,
  }) => {
    await mockApis(page);
    await page.goto('./');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // Second load is controlled by the service worker.
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('onboarding')).toBeVisible();
    await context.setOffline(false);
  });
});
