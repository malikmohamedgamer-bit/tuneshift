// Zips apps/extension/dist → tuneshift-boost-extension.zip (repo root) for the GitHub Release.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { zipSync, type Zippable } from 'fflate';

const dist = join(import.meta.dirname, '..', 'apps', 'extension', 'dist');
const out = join(import.meta.dirname, '..', 'tuneshift-boost-extension.zip');

function walk(dir: string, files: Zippable) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files[relative(dist, full).split('\\').join('/')] = readFileSync(full);
  }
}

const files: Zippable = {};
walk(dist, files);
if (!files['manifest.json'])
  throw new Error('apps/extension/dist has no manifest.json — build first');
// Fixed timestamps keep the zip reproducible.
const zip = zipSync(files, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') });
writeFileSync(out, zip);
console.info(`${Object.keys(files).length} files → ${out} (${(zip.length / 1024).toFixed(0)} KB)`);
