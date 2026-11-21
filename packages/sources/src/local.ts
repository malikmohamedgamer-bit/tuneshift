import { emptySearchPage, type SearchPage, type Track } from '@tuneshift/core';
import { SourceError } from './http';
import type { SearchOptions, SourceAdapter } from './types';

/** Implemented by the app (IndexedDB + File System Access / OPFS, or the Tauri file scanner). */
export interface LocalLibraryProvider {
  getTrack(id: string): Promise<Track | undefined>;
  search(q: string, limit: number, offset: number): Promise<Track[]>;
  /** A URL the <audio> element can play (blob:, same-origin demo file, or Tauri asset URL). */
  fileUrl(track: Track): Promise<string>;
}

/** Local files + bundled demo loops: full Sound Lab and export (they're the user's own files). */
export class LocalAdapter implements SourceAdapter {
  readonly id = 'local' as const;
  readonly displayName = 'Local files';
  readonly capabilities = { fullEffects: true, tapeSpeed: true, export: true, shareable: false };

  constructor(private readonly lib: LocalLibraryProvider) {}

  async search(q: string, opts: SearchOptions): Promise<SearchPage> {
    const page = emptySearchPage();
    if (opts.type !== 'track' || !q.trim()) return page;
    page.tracks = await this.lib.search(q.trim(), opts.limit, opts.offset);
    page.hasMore = page.tracks.length >= opts.limit;
    return page;
  }

  async getTrack(id: string): Promise<Track> {
    const t = await this.lib.getTrack(id);
    if (!t)
      throw new SourceError('This local file is no longer in your library', 404, 'Local files');
    return t;
  }

  resolveStreamUrl(track: Track): Promise<string> {
    return this.lib.fileUrl(track);
  }
}

export const LOCAL_AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'flac',
  'wav',
  'ogg',
  'opus',
  'oga',
  'webm',
];

export function isAudioFileName(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return LOCAL_AUDIO_EXTENSIONS.includes(ext);
}

/** "01 - Artist - Title.mp3" → { artist, title, trackNo } (fallback when tags are missing). */
export function metadataFromFileName(fileName: string): {
  title: string;
  artist: string;
  trackNo?: number;
} {
  let base = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/_/g, ' ')
    .trim();
  let trackNo: number | undefined;
  const num = /^(\d{1,3})[\s.\-)]+(.*)$/.exec(base);
  if (num) {
    trackNo = Number(num[1]);
    base = (num[2] as string).trim();
  }
  const parts = base.split(/\s[-–—]\s/);
  if (parts.length >= 2) {
    return {
      artist: (parts[0] as string).trim(),
      title: parts.slice(1).join(' - ').trim(),
      trackNo,
    };
  }
  return { title: base || fileName, artist: 'Unknown artist', trackNo };
}
