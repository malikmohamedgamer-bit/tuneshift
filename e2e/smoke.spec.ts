import { expect, test } from '@playwright/test';

test('production build boots at /tuneshift/ without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Tuneshift' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('deep links fall back to the SPA (404.html copy)', async ({ page }) => {
  const res = await page.goto('./some/deep/link');
  expect([200, 404]).toContain(res?.status());
  await expect(page.getByRole('heading', { name: 'Tuneshift' })).toBeVisible();
});
