import { trackKey, type Track } from '@tuneshift/core';
import { z } from 'zod';
import { BASE_URL } from '../env';
import { db } from '../db/db';

/** The three original demo loops shipped in public/demo (spec §3.1). */

const DemoSchema = z.array(
  z.object({
    id: z.string(),
    file: z.string(),
    cover: z.string(),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    genre: z.string(),
    mood: z.string(),
    bpm: z.number(),
    durationSec: z.number(),
  }),
);

const DEMO_PREFIX = 'demo-';
export const isDemoId = (id: string) => id.startsWith(DEMO_PREFIX);
const files = new Map<string, string>();

export function demoUrl(id: string): Promise<string> {
  const f = files.get(id) ?? `${id.slice(DEMO_PREFIX.length)}.mp3`;
  return Promise.resolve(new URL(`${BASE_URL}demo/${f}`, window.location.origin).toString());
}

let loaded: Promise<Track[]> | null = null;

export function loadDemoTracks(): Promise<Track[]> {
  loaded ??= (async () => {
    const res = await fetch(`${BASE_URL}demo/demo.json`);
    if (!res.ok) throw new Error('Demo tracks are missing from this build');
    const list = DemoSchema.parse(await res.json());
    const tracks: Track[] = list.map((d) => {
      const id = `${DEMO_PREFIX}${d.id}`;
      files.set(id, d.file);
      const art = `${BASE_URL}demo/${d.cover}`;
      return {
        key: trackKey('local', id),
        source: 'local',
        id,
        title: d.title,
        artist: d.artist,
        album: d.album,
        genre: d.genre,
        mood: d.mood,
        durationSec: d.durationSec,
        artwork: { small: art, medium: art, large: art },
        local: { fileId: id, folder: 'Demo', path: `Demo/${d.file}` },
        addedAt: 0,
      };
    });
    await db.tracks.bulkPut(tracks);
    return tracks;
  })();
  return loaded;
}
