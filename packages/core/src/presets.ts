import {
  cloneSound,
  neutralSound,
  soundsEqual,
  type CompressorSettings,
  type SoundSettings,
} from './sound';

export interface EqPreset {
  id: string;
  name: string;
  gains: readonly number[];
  /** Optional extras applied with the curve (e.g. Late Night is quiet + compressed). */
  preampDb?: number;
  compressor?: CompressorSettings;
}

/** Built-in EQ presets (10-band dB values, 32 Hz → 16 kHz). Spec §4.6. */
export const EQ_PRESETS: readonly EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass-boost', name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { id: 'phonk', name: 'Phonk', gains: [7, 6, 3, 0, -2, -1, 1, 3, 4, 3] },
  { id: 'car', name: 'Car', gains: [5, 4, 2, 0, -1, 0, 1, 2, 3, 2] },
  { id: 'vocal', name: 'Vocal', gains: [-2, -2, -1, 1, 3, 4, 4, 2, 0, -1] },
  { id: 'treble', name: 'Treble', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 6] },
  { id: 'loudness', name: 'Loudness', gains: [5, 4, 2, 0, -1, -1, 0, 2, 4, 5] },
  { id: 'headphones', name: 'Headphones', gains: [3, 2, 1, 0, -1, 0, 1, 2, 3, 2] },
  { id: 'rock', name: 'Rock', gains: [4, 3, 2, 0, -1, -1, 0, 2, 3, 4] },
  { id: 'pop', name: 'Pop', gains: [-1, 0, 2, 3, 4, 3, 1, 0, -1, -1] },
  { id: 'hip-hop', name: 'Hip-Hop', gains: [6, 5, 2, 1, -1, -1, 1, 0, 2, 3] },
  { id: 'edm', name: 'EDM', gains: [6, 5, 2, 0, -1, 1, 0, 2, 4, 5] },
  { id: 'acoustic', name: 'Acoustic', gains: [4, 3, 2, 1, 1, 1, 2, 3, 3, 2] },
  { id: 'podcast', name: 'Podcast / Spoken', gains: [-4, -3, -1, 1, 3, 4, 4, 3, 1, -2] },
  {
    id: 'late-night',
    name: 'Late Night',
    gains: [-2, -1, 0, 0, 1, 1, 0, -1, -2, -3],
    preampDb: -6,
    compressor: { enabled: true, threshold: -30, ratio: 6, attack: 0.005, release: 0.3, knee: 12 },
  },
];

export function eqPreset(id: string): EqPreset | undefined {
  return EQ_PRESETS.find((p) => p.id === id);
}

const gainsOf = (id: string): number[] => [...(eqPreset(id)?.gains ?? EQ_PRESETS[0]!.gains)];

export interface SoundPreset {
  id: string;
  name: string;
  subtitle: string;
  /** Two gradient stops for the preset card. */
  colors: readonly [string, string];
  settings: SoundSettings;
}

function preset(
  id: string,
  name: string,
  subtitle: string,
  colors: readonly [string, string],
  edit: (s: SoundSettings) => void,
): SoundPreset {
  const settings = neutralSound();
  edit(settings);
  return { id, name, subtitle, colors, settings };
}

/** Built-in Sound presets (spec §4.6 — exact values). The first 8 map to keys 1–8. */
export const SOUND_PRESETS: readonly SoundPreset[] = [
  preset('normal', 'Normal', 'Original sound', ['#3f3a52', '#5b5470'], () => {}),
  preset('bass-boosted', 'Bass Boosted', 'Heavy low end', ['#7c3aed', '#2563eb'], (s) => {
    s.bassBoostDb = 9;
    s.eqGains = gainsOf('bass-boost');
  }),
  preset('sped-up', 'Sped Up', '1.25× + higher pitch', ['#ec4899', '#f97316'], (s) => {
    s.speed = 1.25;
    s.pitchMode = 'tape';
  }),
  preset('sped-up-bass', 'Sped Up + Bass', 'TikTok edit sound', ['#db2777', '#7c3aed'], (s) => {
    s.speed = 1.25;
    s.pitchMode = 'tape';
    s.bassBoostDb = 8;
  }),
  preset('nightcore', 'Nightcore', '1.4× bright & fast', ['#06b6d4', '#a855f7'], (s) => {
    s.speed = 1.4;
    s.pitchMode = 'tape';
    s.eqGains = [0, 0, 0, 0, 0, 0, 0, 0, 2, 3];
    s.bassBoostDb = 2;
  }),
  preset('slowed-reverb', 'Slowed + Reverb', '0.8× dreamy', ['#6366f1', '#0ea5e9'], (s) => {
    s.speed = 0.8;
    s.pitchMode = 'tape';
    s.reverb = { amount: 0.38, room: 'dreamy', preDelayMs: 20, tone: 0.6 };
    s.eqGains = [0, 0, 0, 0, 0, 0, 0, 0, -1, -2];
  }),
  preset('8d', '8D Audio', 'Spins around you', ['#10b981', '#6366f1'], (s) => {
    s.eightD = { enabled: true, speedHz: 0.12, radius: 1, heightWobble: false };
    s.reverb = { amount: 0.15, room: 'room', preDelayMs: 0, tone: 1 };
  }),
  preset('club', 'Club', 'Bass + room echo', ['#f43f5e', '#8b5cf6'], (s) => {
    s.bassBoostDb = 7;
    s.reverb = { amount: 0.22, room: 'hall', preDelayMs: 0, tone: 1 };
    s.compressor = {
      enabled: true,
      threshold: -18,
      ratio: 4,
      attack: 0.01,
      release: 0.25,
      knee: 6,
    };
    s.widener = 1.3;
  }),
  preset('phonk-drift', 'Phonk Drift', 'Cowbell-ready low end', ['#991b1b', '#7c3aed'], (s) => {
    s.speed = 1.1;
    s.pitchMode = 'tape';
    s.bassBoostDb = 10;
    s.eqGains = gainsOf('phonk');
    s.widener = 1.2;
  }),
  preset('lofi-chill', 'Lo-fi Chill', 'Warm, slow, dusty', ['#a16207', '#be185d'], (s) => {
    s.speed = 0.9;
    s.pitchMode = 'tape';
    s.lofi = { enabled: true, amount: 0.6 };
    s.reverb = { amount: 0.2, room: 'room', preDelayMs: 0, tone: 1 };
  }),
  preset('vinyl', 'Vinyl', 'Crackle & wow', ['#78350f', '#57534e'], (s) => {
    s.lofi = { enabled: true, amount: 0.4 };
  }),
  preset('concert-hall', 'Concert Hall', 'Big live room', ['#0f766e', '#4338ca'], (s) => {
    s.reverb = { amount: 0.35, room: 'hall', preDelayMs: 0, tone: 1 };
  }),
  preset('car-speakers', 'Car Speakers', 'Windows-down bass', ['#1d4ed8', '#0891b2'], (s) => {
    s.eqGains = gainsOf('car');
    s.bassBoostDb = 6;
  }),
  preset('karaoke', 'Karaoke', 'Vocals pulled back', ['#c026d3', '#0284c7'], (s) => {
    s.vocalReduce = { enabled: true, amount: 0.9 };
  }),
];

export function soundPreset(id: string): SoundPreset | undefined {
  return SOUND_PRESETS.find((p) => p.id === id);
}

export function presetSettings(id: string): SoundSettings {
  const p = soundPreset(id);
  return p ? cloneSound(p.settings) : neutralSound();
}

/** Name of the built-in preset that exactly matches `s`, if any. */
export function matchPreset(s: SoundSettings): SoundPreset | undefined {
  return SOUND_PRESETS.find((p) => soundsEqual(p.settings, s));
}

/** Apply an EQ preset to a sound, returning a new sound. */
export function withEqPreset(s: SoundSettings, p: EqPreset): SoundSettings {
  const out = cloneSound(s);
  out.eqEnabled = true;
  out.eqMode = 'graphic';
  out.eqGains = [...p.gains];
  if (p.preampDb !== undefined) out.preampDb = p.preampDb;
  if (p.compressor) out.compressor = { ...p.compressor };
  return out;
}

/** Short human label for the active sound (badge text, overlay pill, Discord). */
export function soundLabel(s: SoundSettings, savedName?: string): string {
  if (savedName) return savedName;
  const p = matchPreset(s);
  if (p) return p.name;
  const parts: string[] = [];
  if (Math.abs(s.speed - 1) > 1e-3) {
    if (s.speed > 1.32) parts.push('Nightcore');
    else if (s.speed > 1) parts.push('Sped Up');
    else parts.push('Slowed');
  }
  if (s.bassBoostDb >= 4) parts.push('Bass');
  if (s.reverb.amount >= 0.1) parts.push('Reverb');
  if (s.eightD.enabled) parts.push('8D');
  if (s.lofi.enabled) parts.push('Lo-fi');
  if (s.vocalReduce.enabled) parts.push('Karaoke');
  return parts.length ? parts.join(' + ') : 'Custom';
}
