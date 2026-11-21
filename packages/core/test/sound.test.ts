import { describe, expect, it } from 'vitest';
import {
  EQ_PRESETS,
  NEUTRAL_SOUND,
  SOUND_PRESETS,
  SoundSettingsSchema,
  autoHeadroomDb,
  biquadMagnitudeDb,
  isNeutral,
  liveInputSound,
  matchPreset,
  migrateSound,
  needsGraph,
  neutralSound,
  parseSound,
  peakBoostDb,
  presetSettings,
  soundLabel,
  tapeOnly,
  toneResponseDb,
} from '../src';

describe('sound presets', () => {
  it('every built-in preset validates against the strict schema', () => {
    for (const p of SOUND_PRESETS) {
      const r = SoundSettingsSchema.safeParse(p.settings);
      expect(r.success, `${p.name}: ${r.success ? '' : r.error.message}`).toBe(true);
    }
    expect(SOUND_PRESETS.slice(0, 8).map((p) => p.name)).toEqual([
      'Normal',
      'Bass Boosted',
      'Sped Up',
      'Sped Up + Bass',
      'Nightcore',
      'Slowed + Reverb',
      '8D Audio',
      'Club',
    ]);
  });

  it('uses the exact spec values', () => {
    expect(presetSettings('bass-boosted')).toMatchObject({
      bassBoostDb: 9,
      eqGains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
    });
    expect(presetSettings('sped-up-bass')).toMatchObject({
      speed: 1.25,
      pitchMode: 'tape',
      bassBoostDb: 8,
    });
    expect(presetSettings('nightcore')).toMatchObject({ speed: 1.4, bassBoostDb: 2 });
    expect(presetSettings('nightcore').eqGains.slice(8)).toEqual([2, 3]);
    expect(presetSettings('slowed-reverb').reverb).toEqual({
      amount: 0.38,
      room: 'dreamy',
      preDelayMs: 20,
      tone: 0.6,
    });
    expect(presetSettings('slowed-reverb').eqGains.slice(8)).toEqual([-1, -2]);
    expect(presetSettings('8d').eightD).toEqual({
      enabled: true,
      speedHz: 0.12,
      radius: 1,
      heightWobble: false,
    });
    expect(presetSettings('club')).toMatchObject({ bassBoostDb: 7, widener: 1.3 });
    expect(presetSettings('club').compressor).toMatchObject({
      enabled: true,
      threshold: -18,
      ratio: 4,
    });
    expect(presetSettings('phonk-drift')).toMatchObject({
      speed: 1.1,
      bassBoostDb: 10,
      widener: 1.2,
    });
    expect(presetSettings('karaoke').vocalReduce).toEqual({ enabled: true, amount: 0.9 });
    expect(EQ_PRESETS.find((p) => p.id === 'phonk')!.gains).toEqual([
      7, 6, 3, 0, -2, -1, 1, 3, 4, 3,
    ]);
    expect(EQ_PRESETS).toHaveLength(15);
  });

  it('matches presets and labels custom sounds', () => {
    expect(matchPreset(presetSettings('nightcore'))?.id).toBe('nightcore');
    expect(soundLabel(presetSettings('sped-up-bass'))).toBe('Sped Up + Bass');
    const custom = presetSettings('sped-up');
    custom.reverb.amount = 0.3;
    expect(soundLabel(custom)).toBe('Sped Up + Reverb');
    expect(soundLabel(neutralSound(), 'My Car Mix')).toBe('My Car Mix');
    expect(isNeutral(neutralSound())).toBe(true);
  });

  it('knows which sounds need the graph', () => {
    expect(needsGraph(presetSettings('sped-up'))).toBe(false);
    expect(needsGraph(presetSettings('bass-boosted'))).toBe(true);
    expect(tapeOnly(presetSettings('sped-up-bass'))).toMatchObject({ speed: 1.25, bassBoostDb: 0 });
  });

  it('converts tape speed to pitch for live inputs', () => {
    const live = liveInputSound(presetSettings('nightcore'), { tapeToPitch: true });
    expect(live.speed).toBe(1);
    expect(live.pitchMode).toBe('independent');
    expect(live.pitchSemitones).toBeCloseTo(5.8, 1);
    expect(liveInputSound(presetSettings('nightcore'), { tapeToPitch: false }).pitchSemitones).toBe(
      0,
    );
  });
});

describe('sound migration', () => {
  it('fills missing fields and clamps out-of-range values', () => {
    const s = migrateSound({
      version: 1,
      speed: 9,
      eqGains: [99, -99],
      bassBoostDb: -3,
      reverb: { room: 'nope' },
    });
    expect(s.speed).toBe(2);
    expect(s.eqGains.slice(0, 3)).toEqual([12, -12, 0]);
    expect(s.bassBoostDb).toBe(0);
    expect(s.reverb.room).toBe('room');
    expect(SoundSettingsSchema.safeParse(s).success).toBe(true);
  });

  it('migrates the legacy v0 shape', () => {
    const s = migrateSound({ rate: 1.25, bass: 8, eq: [1, 2, 3], reverb: 0.3, eightD: true });
    expect(s).toMatchObject({ version: 1, speed: 1.25, bassBoostDb: 8 });
    expect(s.eqGains.slice(0, 3)).toEqual([1, 2, 3]);
    expect(s.reverb.amount).toBe(0.3);
    expect(s.eightD.enabled).toBe(true);
  });

  it('rejects junk', () => {
    expect(() => migrateSound('nope')).toThrow();
    expect(() => migrateSound({ version: 7 })).toThrow();
    expect(parseSound(null)).toBeNull();
    expect(parseSound({ version: 1 })).toEqual({
      ...NEUTRAL_SOUND,
      eqGains: [...NEUTRAL_SOUND.eqGains],
    });
  });
});

describe('EQ response maths (Web Audio cookbook)', () => {
  it('peaking filter hits its gain at the centre and is flat far away', () => {
    const spec = { type: 'peaking' as const, freq: 1000, q: 1, gainDb: 6 };
    expect(biquadMagnitudeDb(spec, 1000)).toBeCloseTo(6, 1);
    expect(Math.abs(biquadMagnitudeDb(spec, 20))).toBeLessThan(0.2);
  });

  it('shelves reach full gain on their side', () => {
    expect(biquadMagnitudeDb({ type: 'lowshelf', freq: 90, q: 1, gainDb: 9 }, 20)).toBeCloseTo(
      9,
      0,
    );
    expect(
      Math.abs(biquadMagnitudeDb({ type: 'lowshelf', freq: 90, q: 1, gainDb: 9 }, 5000)),
    ).toBeLessThan(0.1);
    expect(
      biquadMagnitudeDb({ type: 'highshelf', freq: 16000, q: 1, gainDb: 3 }, 20000),
    ).toBeGreaterThan(1.5);
  });

  it('flat sound has a flat response and no auto headroom', () => {
    expect(Math.max(...toneResponseDb(neutralSound(), [50, 500, 5000]).map(Math.abs))).toBeLessThan(
      1e-6,
    );
    expect(autoHeadroomDb(neutralSound())).toBe(0);
  });

  it('auto headroom kicks in above +6 dB of summed boost', () => {
    const s = presetSettings('bass-boosted');
    const peak = peakBoostDb(s);
    expect(peak).toBeGreaterThan(12);
    expect(autoHeadroomDb(s)).toBeCloseTo(-(peak - 6), 6);
    expect(autoHeadroomDb(presetSettings('nightcore'))).toBe(0);
  });
});
