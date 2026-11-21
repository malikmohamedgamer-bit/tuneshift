import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { markOnboarded, mockApis } from './helpers';

const SCREENS = [
  './',
  './search?q=night',
  './library',
  './lab',
  './settings/appearance',
  './stats',
  './friends',
];

test.describe('accessibility (axe)', () => {
  // Axe samples colours; reduced motion avoids catching elements mid fade-in.
  test.use({ reducedMotion: 'reduce' });
  for (const path of SCREENS) {
    test(`no serious/critical violations on ${path}`, async ({ page }) => {
      await mockApis(page);
      await markOnboarded(page);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        serious.map(
          (v) => `${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(' ')}`,
        ),
      ).toEqual([]);
    });
  }

  test('onboarding is accessible', async ({ page }) => {
    await mockApis(page);
    await page.goto('./');
    await page.getByTestId('onboarding').waitFor();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(
      results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .flatMap((v) =>
          v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary ?? ''}`),
        ),
    ).toEqual([]);
  });
});
