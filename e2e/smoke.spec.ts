import { expect, test } from '@playwright/test';
import { collectErrors, mockApis } from './helpers';

test('production build boots at /tuneshift/ and deep links fall back to the SPA', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await mockApis(page);
  // A real deep link boots the SPA (via 404.html on Pages) and redirects first-timers to onboarding.
  const res = await page.goto('./stats');
  expect([200, 404]).toContain(res?.status());
  await expect(page.getByTestId('onboarding')).toBeVisible();
  // Unknown paths render a not-found page inside the app.
  await page.getByTestId('skip-onboarding').click();
  await page.goto('./no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
