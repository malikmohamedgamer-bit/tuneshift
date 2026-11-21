import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const APP_VERSION = '0.1.0';

export default defineConfig(({ mode }) => {
  const desktop = mode === 'desktop';
  // GitHub Pages serves the app from /tuneshift/; dev, preview-less dev and Tauri use /.
  const base = mode === 'pages' ? '/tuneshift/' : '/';
  return {
    base,
    envDir: '../..',
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __BUILD_TARGET__: JSON.stringify(desktop ? 'desktop' : 'web'),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        disable: desktop,
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Tuneshift',
          short_name: 'Tuneshift',
          description: 'Your music with a live Sound Lab — sped up, slowed, bass, reverb, 8D.',
          start_url: base,
          scope: base,
          id: base,
          display: 'standalone',
          orientation: 'any',
          background_color: '#0d0b14',
          theme_color: '#0d0b14',
          categories: ['music', 'entertainment'],
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: 'icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
          globIgnores: ['**/demo/**'],
          navigateFallback: `${base}index.html`,
          navigateFallbackDenylist: [/\/demo\//],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          runtimeCaching: [
            {
              // Bundled original demo loops: cache so the demo works offline.
              urlPattern: ({ url }) => url.pathname.includes('/demo/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'demo-audio',
                rangeRequests: true,
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cover art only — streamed audio is never cached.
              urlPattern: ({ url, request }) =>
                request.destination === 'image' && url.origin !== self.location.origin,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'artwork',
                expiration: { maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
        },
        devOptions: { enabled: false },
      }),
    ],
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      assetsInlineLimit: 2048,
    },
    server: { port: 5173, strictPort: true },
    preview: { port: 4173, strictPort: true },
  };
});
