import { Mp3Encoder } from '@breezystack/lamejs';
import { encodeWav } from '../wav';

export type ExportFormat = 'wav16' | 'wav24' | 'mp3';

export const EXPORT_FORMATS: { id: ExportFormat; label: string; ext: string; mime: string }[] = [
  { id: 'mp3', label: 'MP3 (320 kbps)', ext: 'mp3', mime: 'audio/mpeg' },
  { id: 'wav16', label: 'WAV 16-bit', ext: 'wav', mime: 'audio/wav' },
  { id: 'wav24', label: 'WAV 24-bit', ext: 'wav', mime: 'audio/wav' },
];

export interface EncodeRequest {
  channels: Float32Array[];
  sampleRate: number;
  format: ExportFormat;
  kbps?: number;
}

export type EncodeMessage =
  | { type: 'progress'; value: number }
  | { type: 'done'; data: ArrayBuffer; mime: string }
  | { type: 'error'; message: string };

const MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

function toInt16(x: Float32Array, from: number, to: number): Int16Array {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) {
    const v = Math.max(-1, Math.min(1, x[i] as number));
    out[i - from] = v < 0 ? v * 32768 : v * 32767;
  }
  return out;
}

/** Encode PCM (runs inside the export worker; also usable directly). */
export function encode(
  req: EncodeRequest,
  onProgress: (v: number) => void,
): { data: ArrayBuffer; mime: string } {
  if (req.format !== 'mp3') {
    const data = encodeWav(req.channels, req.sampleRate, req.format === 'wav24' ? 24 : 16);
    onProgress(1);
    return { data, mime: 'audio/wav' };
  }
  if (!MP3_RATES.includes(req.sampleRate)) throw new Error(`MP3 can't use ${req.sampleRate} Hz`);
  const left = req.channels[0] as Float32Array;
  const right = (req.channels[1] ?? left) as Float32Array;
  const enc = new Mp3Encoder(2, req.sampleRate, req.kbps ?? 320);
  const chunk = 1152 * 32;
  const parts: Uint8Array[] = [];
  for (let i = 0; i < left.length; i += chunk) {
    const end = Math.min(left.length, i + chunk);
    const out = enc.encodeBuffer(toInt16(left, i, end), toInt16(right, i, end));
    if (out.length) parts.push(new Uint8Array(out));
    onProgress(end / left.length);
  }
  const tail = enc.flush();
  if (tail.length) parts.push(new Uint8Array(tail));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const data = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    data.set(p, o);
    o += p.length;
  }
  return { data: data.buffer, mime: 'audio/mpeg' };
}
