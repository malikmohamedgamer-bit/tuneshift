import type { SoundSettings } from '@tuneshift/core';
import { decodeFile, renderWithEffects } from './render';
import {
  EXPORT_FORMATS,
  type EncodeMessage,
  type EncodeRequest,
  type ExportFormat,
} from './encode';

export { EXPORT_FORMATS, type ExportFormat } from './encode';
export { renderWithEffects, decodeFile, tailSeconds } from './render';

export type ExportPhase = 'decode' | 'render' | 'encode';

/**
 * "Export with effects" for the user's OWN local files only (spec §2, §4.8). Callers must
 * check the track's source capability (`export: true` is only set for 'local').
 */
export async function exportWithEffects(
  file: Blob,
  settings: SoundSettings,
  format: ExportFormat,
  onProgress: (phase: ExportPhase, value: number) => void,
  signal?: AbortSignal,
): Promise<Blob> {
  onProgress('decode', 0);
  const decoded = await decodeFile(await file.arrayBuffer(), 48000);
  onProgress('decode', 1);
  const rendered = await renderWithEffects(decoded, settings, {
    onProgress: (v) => onProgress('render', v),
    signal,
  });
  const channels = Array.from({ length: rendered.numberOfChannels }, (_, i) =>
    Float32Array.from(rendered.getChannelData(i)),
  );
  const worker = new Worker(new URL('./encode.worker.ts', import.meta.url), { type: 'module' });
  try {
    return await new Promise<Blob>((resolve, reject) => {
      signal?.addEventListener('abort', () =>
        reject(new DOMException('Export cancelled', 'AbortError')),
      );
      worker.onmessage = (e: MessageEvent<EncodeMessage>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress('encode', m.value);
        else if (m.type === 'done') resolve(new Blob([m.data], { type: m.mime }));
        else reject(new Error(m.message));
      };
      worker.onerror = (e) => reject(new Error(e.message || 'Encoder crashed'));
      const req: EncodeRequest = { channels, sampleRate: rendered.sampleRate, format };
      worker.postMessage(
        req,
        channels.map((c) => c.buffer),
      );
    });
  } finally {
    worker.terminate();
  }
}

export function exportFileName(base: string, presetLabel: string, format: ExportFormat): string {
  const ext = EXPORT_FORMATS.find((f) => f.id === format)?.ext ?? 'wav';
  const clean = `${base} (${presetLabel})`.replace(/[\\/:*?"<>|]+/g, ' ').trim();
  return `${clean}.${ext}`;
}
