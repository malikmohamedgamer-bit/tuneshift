import type { Track } from '@tuneshift/core';
import { normalizationGainDb, replayGainToNormalizationDb } from '@tuneshift/audio/loudness';
import { decodeFile } from '@tuneshift/audio/export';
import { db } from '../db/db';
import { getLocalBlob } from '../lib/localFiles';
import { demoUrl, isDemoId } from '../lib/demo';
import type { NormalizationMode } from '../state/settings';

/**
 * Loudness normalisation (spec §4.5, target −14 LUFS). Local files: ReplayGain tags if present,
 * otherwise integrated loudness measured once in a Web Worker and cached. Remote streams use a
 * running RMS estimate from the player (see controller).
 */

let worker: Worker | null = null;

function measure(channels: Float32Array[], sampleRate: number): Promise<number> {
  worker ??= new Worker(new URL('./loudness.worker.ts', import.meta.url), { type: 'module' });
  const w = worker;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ ok: boolean; lufs?: number; error?: string }>) => {
      w.removeEventListener('message', onMsg);
      if (e.data.ok) resolve(e.data.lufs ?? Number.NEGATIVE_INFINITY);
      else reject(new Error(e.data.error));
    };
    w.addEventListener('message', onMsg);
    w.postMessage(
      { channels, sampleRate },
      channels.map((c) => c.buffer),
    );
  });
}

const inflight = new Map<string, Promise<number | null>>();

async function measureLocal(track: Track): Promise<number | null> {
  const cached = await db.loudness.get(track.key);
  if (cached) return cached.lufs;
  const blob = isDemoId(track.id)
    ? await (await fetch(await demoUrl(track.id))).blob()
    : await getLocalBlob(track.id);
  if (blob.size > 200 * 1024 * 1024) return null; // don't decode huge files in the browser
  const buf = await decodeFile(await blob.arrayBuffer(), 48000);
  const channels = Array.from({ length: buf.numberOfChannels }, (_, i) =>
    Float32Array.from(buf.getChannelData(i)),
  );
  const lufs = await measure(channels, buf.sampleRate);
  if (Number.isFinite(lufs)) await db.loudness.put({ key: track.key, lufs, at: Date.now() });
  return Number.isFinite(lufs) ? lufs : null;
}

/** Normalisation gain (dB) for a local track, or null when it should be estimated live. */
export async function localNormalizationDb(
  track: Track,
  mode: NormalizationMode,
): Promise<number | null> {
  if (mode === 'off' || track.source !== 'local') return mode === 'off' ? 0 : null;
  const rg =
    mode === 'album'
      ? (track.local?.replayGainAlbumDb ?? track.local?.replayGainDb)
      : track.local?.replayGainDb;
  if (rg !== undefined) return replayGainToNormalizationDb(rg);
  let p = inflight.get(track.key);
  if (!p) {
    p = measureLocal(track).catch(() => null);
    inflight.set(track.key, p);
  }
  const lufs = await p;
  inflight.delete(track.key);
  return lufs === null ? 0 : normalizationGainDb(lufs);
}
