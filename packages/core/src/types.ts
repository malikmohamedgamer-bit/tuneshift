/** Shared domain types used by every package and app. DOM-free. */

export type SourceId = 'local' | 'audius' | 'jamendo';
export type SearchType = 'track' | 'artist' | 'album' | 'playlist';

export interface SourceCapabilities {
  /** Web Audio graph works (CORS ok / local blob). */
  fullEffects: boolean;
  /** playbackRate + preservesPitch=false works (always true for <audio>). */
  tapeSpeed: boolean;
  /** Export with effects — only 'local'. */
  export: boolean;
  /** Can a friend play it? (false for 'local'). */
  shareable: boolean;
}

export interface Artwork {
  small?: string;
  medium?: string;
  large?: string;
}

export interface TrackLicense {
  name: string;
  url: string;
}

export interface LocalFileInfo {
  fileId: string;
  path?: string;
  folder?: string;
  size?: number;
  mtime?: number;
  trackNo?: number;
  year?: number;
  replayGainDb?: number;
  replayGainAlbumDb?: number;
  missing?: boolean;
}

export interface Track {
  /** `${source}:${id}` — stable unique key used everywhere (likes, history, playlists). */
  key: string;
  source: SourceId;
  id: string;
  title: string;
  artist: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  durationSec: number;
  artwork?: Artwork;
  genre?: string;
  mood?: string;
  tags?: string[];
  /** Attribution link to the track page on the source (Audius/Jamendo). */
  permalink?: string;
  /** Licence (Jamendo Creative Commons). */
  license?: TrackLicense;
  releaseDate?: string;
  playCount?: number;
  local?: LocalFileInfo;
  addedAt?: number;
}

export interface Artist {
  key: string;
  source: SourceId;
  id: string;
  name: string;
  artwork?: Artwork;
  bio?: string;
  followerCount?: number;
  trackCount?: number;
  permalink?: string;
  tracks?: Track[];
}

export interface Collection {
  key: string;
  source: SourceId;
  id: string;
  kind: 'album' | 'playlist';
  title: string;
  owner?: string;
  ownerId?: string;
  artwork?: Artwork;
  description?: string;
  trackCount?: number;
  tracks: Track[];
  permalink?: string;
}

export interface SearchPage {
  tracks: Track[];
  artists: Artist[];
  collections: Collection[];
  hasMore: boolean;
}

export const emptySearchPage = (): SearchPage => ({
  tracks: [],
  artists: [],
  collections: [],
  hasMore: false,
});

export function trackKey(source: SourceId, id: string): string {
  return `${source}:${id}`;
}

export function parseTrackKey(key: string): { source: SourceId; id: string } | null {
  const i = key.indexOf(':');
  if (i <= 0) return null;
  const source = key.slice(0, i);
  if (source !== 'local' && source !== 'audius' && source !== 'jamendo') return null;
  return { source, id: key.slice(i + 1) };
}

/** Fields every synced record carries. `dirty` is 0/1 so IndexedDB can index it. */
export interface SyncMeta {
  updatedAt: number;
  deleted?: boolean;
  dirty?: 0 | 1;
}

export interface Playlist extends SyncMeta {
  id: string;
  name: string;
  description?: string;
  folderId?: string | null;
  /** Custom cover as a data URL (resized client-side); otherwise an auto-mosaic is drawn. */
  coverDataUrl?: string;
  trackKeys: string[];
  createdAt: number;
  order: number;
  soundId?: string | null;
  themeId?: string | null;
}

export interface PlaylistFolder extends SyncMeta {
  id: string;
  name: string;
  order: number;
}

export interface Like extends SyncMeta {
  id: string; // = trackKey
  likedAt: number;
}

export interface HistoryEntry extends SyncMeta {
  id: string;
  trackKey: string;
  source: SourceId;
  title: string;
  artist: string;
  genre?: string;
  playedAt: number;
  msListened: number;
  presetName?: string;
}

export const LOCAL_ONLY_MARKER = 'local-only';
