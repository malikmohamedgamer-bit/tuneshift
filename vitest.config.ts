import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'packages/*/test/**/*.test.ts',
            'apps/*/src/**/*.test.ts',
            'supabase/test/**/*.test.ts',
          ],
          exclude: ['**/*.browser.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'audio-browser',
          include: ['packages/audio/test/**/*.browser.test.ts'],
          testTimeout: 60_000,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
            }),
            instances: [{ browser: 'chromium' }],
            screenshotFailures: false,
          },
        },
      },
    ],
  },
});
