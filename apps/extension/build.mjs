// Builds the MV3 extension into dist/: popup + offscreen pages (shared chunks), the service
// worker as one ES module, the page-speed content script as one classic script, the manifest
// and the packaged pitch worklet (MV3 pages may not load blob: scripts).
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, 'dist');
const define = { 'process.env.NODE_ENV': JSON.stringify('production') };

// 1. Pages (React popup, offscreen audio engine).
await build({
  root,
  base: './',
  configFile: false,
  envDir: false,
  logLevel: 'warn',
  plugins: [react(), tailwindcss()],
  define,
  build: {
    outDir,
    emptyOutDir: true,
    target: 'chrome116',
    modulePreload: { polyfill: false },
    rollupOptions: {
      input: { popup: join(root, 'popup.html'), offscreen: join(root, 'offscreen.html') },
    },
  },
});

// 2. Service worker and 3. content script: self-contained single files.
for (const [entry, format, file] of [
  ['src/background.ts', 'es', 'background.js'],
  ['src/content.ts', 'iife', 'content.js'],
]) {
  await build({
    root,
    configFile: false,
    envDir: false,
    logLevel: 'warn',
    publicDir: false,
    define,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      minify: true,
      lib: {
        entry: join(root, entry),
        formats: [format],
        name: 'TuneshiftContent',
        fileName: () => file,
      },
    },
  });
}

// Manifest (version kept in sync with package.json).
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
manifest.version = pkg.version;
writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// Pitch worklet module (MIT, Signalsmith Stretch): the library file registers its processor when
// loaded inside AudioWorkletGlobalScope.
const audioRequire = createRequire(resolve(root, '../../packages/audio/package.json'));
const stretchDir = dirname(audioRequire.resolve('signalsmith-stretch'));
mkdirSync(join(outDir, 'worklet'), { recursive: true });
copyFileSync(
  join(stretchDir, 'SignalsmithStretch.mjs'),
  join(outDir, 'worklet', 'signalsmith-stretch.mjs'),
);

console.info(`Tuneshift Boost ${pkg.version} built → ${outDir}`);
