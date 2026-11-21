import type {
  Artist,
  Collection,
  SearchPage,
  SearchType,
  SourceCapabilities,
  SourceId,
  Track,
} from '@tuneshift/core';

export interface SearchOptions {
  type: SearchType;
  limit: number;
  offset: number;
}

export interface TrendingOptions {
  genre?: string;
  time?: 'week' | 'month' | 'allTime';
  limit?: number;
}

/** Spec §3 — every source implements this, so any source can be disabled without breakage. */
export interface SourceAdapter {
  id: SourceId;
  displayName: string;
  capabilities: SourceCapabilities;
  search(q: string, opts: SearchOptions): Promise<SearchPage>;
  getTrack(id: string): Promise<Track>;
  /** Fresh URL each play (URLs may expire). */
  resolveStreamUrl(track: Track): Promise<string>;
  trending?(opts: TrendingOptions): Promise<Track[]>;
  getArtist?(id: string): Promise<Artist>;
  getAlbumOrPlaylist?(id: string): Promise<Collection>;
}

/** Why a source can't be used right now (shown on its "Add key" card). */
export interface SourceStatus {
  enabled: boolean;
  available: boolean;
  reason?: string;
}
