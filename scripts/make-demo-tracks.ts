/**
 * Synthesises the three ORIGINAL demo loops (~45 s each) and encodes them to MP3 under
 * apps/web/public/demo/, plus cover art and a manifest. No samples, no third-party audio.
 *   pnpm demo:make
 */
import { Mp3Encoder } from '@breezystack/lamejs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SR, Track, bass808, duck, kick, lowpass, midiToHz, noiseHit, note, space } from './synth';

const outDir = join(import.meta.dirname, '../apps/web/public/demo');
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- 1. Phonk — "Midnight Drift"
function phonk(): Track {
  const bpm = 130;
  const beat = 60 / bpm;
  const bars = 24;
  const t = new Track(bars * 4 * beat + 0.6);
  const k = kick({ punch: 160, decay: 9, drive: 2 });
  const clap = noiseHit(11, { decay: 22, hp: 900, lp: 7000, len: 0.35, tone: [190, 0.4] });
  const hat = noiseHit(5, { decay: 60, hp: 7000, len: 0.08 });
  const cowbell = (midi: number) => {
    const f = midiToHz(midi);
    const x = note({
      freq: f,
      dur: 0.05,
      waves: [
        ['square', 0.5],
        ['square', 0.5, 680],
      ],
      env: { a: 0.001, d: 0.12, s: 0.0, r: 0.12 },
      cutoff: [3200, 1400, 0.15],
    });
    return x;
  };
  const melody = [72, 72, 75, 72, 79, 77, 75, 72, 70, 70, 72, 75, 72, 70, 67, 70];
  const roots = [36, 36, 32, 32, 34, 34, 31, 31];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const full = bar >= 4 && bar < 20;
    const section = Math.floor(bar / 2) % 4;
    // Cowbell melody (8ths), pattern spans two bars.
    for (let i = 0; i < 8; i++) {
      const m = melody[(bar % 2) * 8 + i] as number;
      t.add(cowbell(m + (section === 3 ? -2 : 0)), t0 + i * (beat / 2), 0.32, i % 2 ? 0.25 : -0.25);
    }
    // Hats: 8ths with a triplet roll at the end of every other bar.
    for (let i = 0; i < 8; i++) t.add(hat, t0 + i * (beat / 2), 0.22, 0.4);
    if (bar % 2 === 1)
      for (let r = 0; r < 6; r++) t.add(hat, t0 + 3 * beat + (r * beat) / 6, 0.16, 0.4);
    if (!full && bar < 4) continue;
    if (full) {
      // Kick + 808.
      for (const b of [0, 1.75, 2.5]) t.add(k, t0 + b * beat, 0.9);
      const root = roots[bar % 8] as number;
      t.add(bass808(midiToHz(root), beat * 1.6), t0, 0.75);
      t.add(bass808(midiToHz(root), beat * 1.2), t0 + 2.5 * beat, 0.6);
    }
    t.add(clap, t0 + 2 * beat, 0.55);
  }
  space(t, 0.12, 0.14, 0.35);
  t.master(-1);
  return t;
}

// ---------------------------------------------------------- 2. Lo-fi — "Paper Lanterns"
function lofi(): Track {
  const bpm = 80;
  const beat = 60 / bpm;
  const bars = 15;
  const t = new Track(bars * 4 * beat + 1.5);
  const chords = [
    [50, 53, 57, 60, 64], // Dm9
    [43, 53, 57, 59, 62], // G9
    [48, 52, 55, 59, 62], // Cmaj9
    [45, 52, 55, 59, 60], // Am9-ish
  ];
  const keys = (midi: number, dur: number) =>
    note({
      freq: midiToHz(midi),
      dur,
      waves: [
        ['sine', 0.7],
        ['triangle', 0.25, 4],
        ['sine', 0.08, 1200],
      ],
      env: { a: 0.012, d: 1.6, s: 0.35, r: 0.6 },
      vibrato: [4.5, 0.0015],
    });
  const k = kick({ punch: 90, decay: 9, drive: 1.1 });
  const snare = noiseHit(23, { decay: 18, hp: 600, lp: 4500, len: 0.3, tone: [210, 0.5] });
  const hat = noiseHit(29, { decay: 45, hp: 6000, lp: 9000, len: 0.1 });
  const swing = 0.6;
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const ch = chords[bar % 4] as number[];
    ch.forEach((m, i) => t.add(keys(m, 4 * beat * 0.95), t0 + i * 0.018, 0.17, (i - 2) * 0.2));
    if (bar >= 1) {
      for (const b of [0, 2.5]) t.add(k, t0 + b * beat, 0.7);
      for (const b of [1, 3]) t.add(snare, t0 + b * beat + 0.02, 0.32);
      for (let i = 0; i < 8; i++) {
        const off = i % 2 ? beat * swing : 0;
        t.add(hat, t0 + Math.floor(i / 2) * beat + off, i % 2 ? 0.1 : 0.16, 0.3);
      }
    }
    // A sparse top-line melody in the second half.
    if (bar >= 7 && bar % 2 === 1) {
      const line = [76, 74, 72, 69];
      line.forEach((m, i) => t.add(keys(m, beat * 0.9), t0 + i * beat, 0.12, 0.1));
    }
  }
  // Light hiss for that tape feel.
  const hiss = noiseHit(31, { decay: 0, hp: 3000, len: t.seconds });
  t.add(lowpass(hiss, 9000), 0, 0.012);
  space(t, 0.25, 0.21, 0.5);
  lowpass(t.L, 7500);
  lowpass(t.R, 7500);
  t.master(-1.5);
  return t;
}

// ------------------------------------------------------------- 3. EDM pluck — "Neon Pluck"
function edm(): Track {
  const bpm = 124;
  const beat = 60 / bpm;
  const bars = 23;
  const t = new Track(bars * 4 * beat + 0.8);
  const progression = [
    [57, 60, 64], // Am
    [53, 57, 60], // F
    [48, 52, 55], // C
    [55, 59, 62], // G
  ];
  const pluck = (midi: number) =>
    note({
      freq: midiToHz(midi),
      dur: 0.06,
      waves: [
        ['saw', 0.5, -7],
        ['saw', 0.5, 7],
      ],
      env: { a: 0.002, d: 0.16, s: 0.1, r: 0.12 },
      cutoff: [5200, 420, 0.2],
      res: 2,
    });
  const pad = (midi: number, dur: number) =>
    note({
      freq: midiToHz(midi),
      dur,
      waves: [
        ['saw', 0.34, -12],
        ['saw', 0.34, 0],
        ['saw', 0.34, 12],
      ],
      env: { a: 0.6, d: 0.5, s: 0.8, r: 0.6 },
      cutoff: [900, 1400, dur],
    });
  const k = kick({ punch: 130, decay: 8, drive: 1.6 });
  const clap = noiseHit(41, { decay: 20, hp: 1000, lp: 8000, len: 0.3, tone: [230, 0.25] });
  const openHat = noiseHit(43, { decay: 14, hp: 7500, len: 0.25 });
  const beats: number[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * 4 * beat;
    const ch = progression[Math.floor(bar / 1) % 4] as number[];
    const drop = bar >= 8 && bar < 20;
    // 16th arpeggio up/down across the chord + octave.
    const arp = [...ch, (ch[0] as number) + 12, ...[...ch].reverse()];
    for (let i = 0; i < 16; i++) {
      t.add(
        pluck((arp[i % arp.length] as number) + 12),
        t0 + i * (beat / 4),
        0.2,
        Math.sin(i) * 0.5,
      );
    }
    if (bar >= 4) {
      ch.forEach((m) => t.add(pad(m, 4 * beat), t0, 0.07, 0));
    }
    if (bar >= 2 && !(bar >= 6 && bar < 8)) {
      for (let b = 0; b < 4; b++) {
        t.add(k, t0 + b * beat, 0.95);
        beats.push(t0 + b * beat);
        t.add(openHat, t0 + b * beat + beat / 2, 0.14, 0.3);
      }
      for (const b of [1, 3]) t.add(clap, t0 + b * beat, 0.42);
    }
    if (drop) {
      // Offbeat saw bass.
      for (let b = 0; b < 4; b++) {
        const bassNote = note({
          freq: midiToHz((ch[0] as number) - 24),
          dur: beat * 0.4,
          waves: [
            ['saw', 0.6],
            ['square', 0.3, -5],
          ],
          env: { a: 0.005, d: 0.1, s: 0.7, r: 0.05 },
          cutoff: [1200, 300, 0.2],
        });
        t.add(bassNote, t0 + b * beat + beat / 2, 0.45);
      }
    }
  }
  space(t, 0.2, 60 / bpm / 2, 0.38);
  duck(t, beats, 0.55, beat * 0.55);
  t.master(-1);
  return t;
}

function toMp3(track: Track, kbps = 112): Uint8Array {
  const enc = new Mp3Encoder(2, SR, kbps);
  const toI16 = (x: Float32Array, a: number, b: number) => {
    const o = new Int16Array(b - a);
    for (let i = a; i < b; i++) {
      const v = Math.max(-1, Math.min(1, x[i] as number));
      o[i - a] = v < 0 ? v * 32768 : v * 32767;
    }
    return o;
  };
  const parts: Uint8Array[] = [];
  const chunk = 1152 * 40;
  for (let i = 0; i < track.length; i += chunk) {
    const end = Math.min(track.length, i + chunk);
    const out = enc.encodeBuffer(toI16(track.L, i, end), toI16(track.R, i, end));
    if (out.length) parts.push(new Uint8Array(out));
  }
  parts.push(new Uint8Array(enc.flush()));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return buf;
}

function cover(stops: [string, string, string], shape: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${stops[0]}"/><stop offset="0.55" stop-color="${stops[1]}"/><stop offset="1" stop-color="${stops[2]}"/>
    </linearGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  ${shape}
</svg>
`;
}

const demos = [
  {
    id: 'midnight-drift',
    title: 'Midnight Drift',
    genre: 'Phonk',
    mood: 'Aggressive',
    bpm: 130,
    make: phonk,
    cover: cover(
      ['#1e1b4b', '#7c3aed', '#ec4899'],
      `<g fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="14" stroke-linecap="round">
         <path d="M90 420 Q 300 140 510 420"/><path d="M150 470 Q 300 260 450 470"/></g>
       <circle cx="300" cy="190" r="46" fill="rgba(255,255,255,0.9)"/>`,
    ),
  },
  {
    id: 'paper-lanterns',
    title: 'Paper Lanterns',
    genre: 'Lo-Fi',
    mood: 'Peaceful',
    bpm: 80,
    make: lofi,
    cover: cover(
      ['#78350f', '#db2777', '#fbbf24'],
      `<g fill="rgba(255,244,214,0.9)"><rect x="140" y="170" width="90" height="130" rx="40"/>
       <rect x="270" y="120" width="110" height="160" rx="50"/><rect x="410" y="210" width="70" height="105" rx="32"/></g>
       <g stroke="rgba(255,244,214,0.7)" stroke-width="4"><path d="M185 170 V60"/><path d="M325 120 V40"/><path d="M445 210 V90"/></g>`,
    ),
  },
  {
    id: 'neon-pluck',
    title: 'Neon Pluck',
    genre: 'Electronic',
    mood: 'Energizing',
    bpm: 124,
    make: edm,
    cover: cover(
      ['#0e7490', '#6366f1', '#f0abfc'],
      `<g fill="rgba(255,255,255,0.9)">${Array.from({ length: 9 }, (_, i) => {
        const h = [80, 160, 240, 320, 380, 320, 240, 160, 80][i] as number;
        return `<rect x="${86 + i * 50}" y="${300 - h / 2}" width="28" height="${h}" rx="14"/>`;
      }).join('')}</g>`,
    ),
  },
] as const;

const manifest = demos.map((d) => {
  const track = d.make();
  const mp3 = toMp3(track);
  writeFileSync(join(outDir, `${d.id}.mp3`), mp3);
  writeFileSync(join(outDir, `${d.id}.svg`), d.cover);
  console.log(`${d.title}: ${track.seconds.toFixed(1)} s, ${(mp3.length / 1024).toFixed(0)} KB`);
  return {
    id: d.id,
    file: `${d.id}.mp3`,
    cover: `${d.id}.svg`,
    title: d.title,
    artist: 'Tuneshift Demos',
    album: 'Tuneshift Demos',
    genre: d.genre,
    mood: d.mood,
    bpm: d.bpm,
    durationSec: Math.round(track.seconds * 10) / 10,
  };
});
writeFileSync(join(outDir, 'demo.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('wrote demo.json');
