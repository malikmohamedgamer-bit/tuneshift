import { migrateSound, type SoundSettings } from '@tuneshift/core';

/** A saved sound in chrome.storage.sync (one key per sound keeps each well under 8 KB). */
export interface MySound {
  id: string;
  name: string;
  settings: SoundSettings;
  createdAt: number;
}

export const MY_SOUND_PREFIX = 'mysound:';
export const MAX_MY_SOUNDS = 60;
export const MAX_NAME = 40;

export const mySoundKey = (id: string) => `${MY_SOUND_PREFIX}${id}`;

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
}

export function newMySound(name: string, settings: SoundSettings, now = Date.now()): MySound {
  return {
    id: `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName(name) || 'My Sound',
    settings,
    createdAt: now,
  };
}

/** Read every saved sound out of a storage snapshot, validating untrusted values. */
export function mySoundsFrom(items: Record<string, unknown>): MySound[] {
  const out: MySound[] = [];
  for (const [key, raw] of Object.entries(items)) {
    if (!key.startsWith(MY_SOUND_PREFIX) || !raw || typeof raw !== 'object') continue;
    const r = raw as Partial<MySound>;
    if (typeof r.id !== 'string' || typeof r.name !== 'string') continue;
    out.push({
      id: r.id,
      name: cleanName(r.name) || 'My Sound',
      settings: migrateSound(r.settings),
      createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
    });
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
