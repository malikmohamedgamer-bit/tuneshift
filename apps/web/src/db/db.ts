import Dexie, { type EntityTable } from 'dexie';
import type {
  HistoryEntry,
  Like,
  LyricsOffset,
  Playlist,
  PlaylistFolder,
  SavedSound,
  SmartPlaylist,
  SoundAssignment,
  SyncOp,
  Theme,
  Track,
} from '@tuneshift/core';
import type { LyricsResult } from '@tuneshift/sources';

/** Where a local file's bytes live. */
export type LocalFileKind = 'handle' | 'opfs' | 'tauri' | 'demo';

export interface LocalFileRecord {
  id: string;
  name: string;
  kind: LocalFileKind;
  size: number;
  mtime: number;
  /** File System Access handle (Chromium); persisted in IndexedDB. */
  handle?: FileSystemFileHandle;
  /** OPFS file name (browsers without handles: Safari/Firefox). */
  opfsName?: string;
  /** Absolute path (desktop). */
  path?: string;
  /** Watched folder this came from. */
  folderId?: string;
  /** Path inside the folder, for the Folders view. */
  relPath?: string;
  /** Embedded cover art. */
  cover?: Blob;
}

export interface LocalFolderRecord {
  id: string;
  name: string;
  kind: 'handle' | 'tauri';
  handle?: FileSystemDirectoryHandle;
  path?: string;
  addedAt: number;
  lastScan?: number;
}

export type ThemeRecord = Theme & { updatedAt: number; dirty?: 0 | 1; deleted?: boolean };

export interface KV {
  key: string;
  value: unknown;
}

export class TuneshiftDB extends Dexie {
  tracks!: EntityTable<Track, 'key'>;
  localFiles!: EntityTable<LocalFileRecord, 'id'>;
  folders!: EntityTable<LocalFolderRecord, 'id'>;
  likes!: EntityTable<Like, 'id'>;
  playlists!: EntityTable<Playlist, 'id'>;
  playlistFolders!: EntityTable<PlaylistFolder, 'id'>;
  smartPlaylists!: EntityTable<SmartPlaylist, 'id'>;
  history!: EntityTable<HistoryEntry, 'id'>;
  sounds!: EntityTable<SavedSound, 'id'>;
  themes!: EntityTable<ThemeRecord, 'id'>;
  assignments!: EntityTable<SoundAssignment, 'id'>;
  lyricsOffsets!: EntityTable<LyricsOffset, 'id'>;
  lyricsCache!: EntityTable<{ key: string; value: LyricsResult; at: number }, 'key'>;
  loudness!: EntityTable<{ key: string; lufs: number; at: number }, 'key'>;
  syncQueue!: EntityTable<SyncOp & { seq?: number }, 'seq'>;
  searches!: EntityTable<{ q: string; at: number }, 'q'>;
  kv!: EntityTable<KV, 'key'>;

  constructor(name = 'tuneshift') {
    super(name);
    this.version(1).stores({
      tracks: 'key, source, artist, album, genre, addedAt, title',
      localFiles: 'id, folderId, name, kind',
      folders: 'id',
      likes: 'id, likedAt, dirty',
      playlists: 'id, order, folderId, dirty',
      playlistFolders: 'id, order, dirty',
      smartPlaylists: 'id, dirty',
      history: 'id, playedAt, trackKey, dirty',
      sounds: 'id, order, dirty',
      themes: 'id, dirty',
      assignments: 'id, dirty',
      lyricsOffsets: 'id, dirty',
      lyricsCache: 'key, at',
      loudness: 'key',
      syncQueue: '++seq, table',
      searches: 'q, at',
      kv: 'key',
    });
  }
}

export const db = new TuneshiftDB();

/** Tables that sync to Supabase (and are included in backups). */
export const SYNCED_TABLES = [
  'likes',
  'playlists',
  'playlistFolders',
  'smartPlaylists',
  'history',
  'sounds',
  'themes',
  'assignments',
  'lyricsOffsets',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await db.kv.get(key))?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await db.kv.put({ key, value });
}
