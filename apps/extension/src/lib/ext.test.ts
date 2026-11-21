import { describe, expect, it } from 'vitest';
import { NEUTRAL_SOUND, presetSettings, SOUND_PRESETS } from '@tuneshift/core';
import { captureBlockedReason, hostOf, originOf, pageSpeedFor, speedBlockedReason } from './pages';
import { mySoundKey, mySoundsFrom, newMySound } from './mySounds';

describe('extension page rules', () => {
  it('blocks browser pages and web stores', () => {
    expect(captureBlockedReason('chrome://settings')).toMatch(/Browser pages/);
    expect(captureBlockedReason('edge://extensions')).toMatch(/Browser pages/);
    expect(captureBlockedReason('https://chromewebstore.google.com/x')).toMatch(/web store/);
    expect(captureBlockedReason(undefined)).toBeTruthy();
    expect(captureBlockedReason('https://www.youtube.com/watch?v=1')).toBeNull();
  });
  it('marks Spotify Web as speed-unsupported only', () => {
    expect(captureBlockedReason('https://open.spotify.com/')).toBeNull();
    expect(speedBlockedReason('https://open.spotify.com/')).toMatch(/Spotify/);
    expect(speedBlockedReason('https://music.youtube.com/')).toBeNull();
    expect(speedBlockedReason('https://soundcloud.com/')).toBeNull();
  });
  it('derives host and origin', () => {
    expect(hostOf('https://www.youtube.com/watch')).toBe('youtube.com');
    expect(originOf('https://music.youtube.com/watch?v=2')).toBe('https://music.youtube.com');
    expect(originOf('nonsense')).toBe('');
  });
  it('maps presets to page speed', () => {
    const nightcore = SOUND_PRESETS.find((p) => /nightcore/i.test(p.name));
    expect(nightcore).toBeDefined();
    const ns = pageSpeedFor(presetSettings(nightcore?.id ?? ''));
    expect(ns.rate).toBeGreaterThan(1);
    expect(ns.preservesPitch).toBe(false);
    expect(pageSpeedFor(NEUTRAL_SOUND)).toEqual({ rate: 1, preservesPitch: false });
  });
});

describe('My Sounds storage', () => {
  it('round-trips and validates untrusted values', () => {
    const a = newMySound('  Late   night  ', presetSettings(SOUND_PRESETS[1]?.id ?? ''), 2000);
    const b = newMySound('', NEUTRAL_SOUND, 1000);
    const items = {
      [mySoundKey(a.id)]: a,
      [mySoundKey(b.id)]: b,
      themeId: 'midnight-bloom',
      [mySoundKey('bad')]: { id: 5 },
      [mySoundKey('junk')]: { id: 'junk', name: 'Junk', settings: { speed: 99, eq: 'x' } },
    };
    const list = mySoundsFrom(items);
    expect(list.map((s) => s.name)).toEqual(['Late night', 'My Sound', 'Junk']);
    expect(list[0]?.settings).toEqual(a.settings);
    // Out-of-range values are clamped by migrateSound.
    expect(list[2]?.settings.speed).toBeLessThanOrEqual(2);
  });
});
