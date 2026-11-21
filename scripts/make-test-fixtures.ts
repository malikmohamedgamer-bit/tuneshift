/**
 * Generates e2e/fixtures/melody.wav — a short, original sine melody used by the E2E tests as a
 * "local file" the user drops in. Royalty-free by construction.
 *   pnpm fixtures:make
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encodeWav } from '../packages/audio/src/wav';

const sr = 22050;
const notes = [60, 64, 67, 72, 67, 64, 62, 65, 69, 74, 69, 65];
const noteSec = 0.5;
const total = new Float32Array(Math.ceil(notes.length * noteSec * sr));
notes.forEach((m, k) => {
  const f = 440 * Math.pow(2, (m - 69) / 12);
  const start = Math.floor(k * noteSec * sr);
  const len = Math.floor(noteSec * sr);
  for (let i = 0; i < len; i++) {
    const env = Math.min(1, i / (0.01 * sr)) * Math.exp((-3 * i) / len);
    total[start + i] = 0.5 * env * Math.sin((2 * Math.PI * f * i) / sr);
  }
});
const dir = join(import.meta.dirname, '../e2e/fixtures');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'melody.wav'), new Uint8Array(encodeWav([total], sr, 16)));
console.log(`wrote e2e/fixtures/melody.wav (${(total.length / sr).toFixed(1)} s)`);
