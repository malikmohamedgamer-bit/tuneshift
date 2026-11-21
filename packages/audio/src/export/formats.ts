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
