import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { computeStats, type HistoryEntry, type Track } from '@tuneshift/core';
import { collectionDef, loadCollection, type CollectionDef } from '@tuneshift/sources';
import { audius, jamendo, registry, rememberTracks } from './sources';
import { loadDemoTracks } from './demo';
import { db } from '../db/db';
import { useSettings } from '../state/settings';

/** Re-render when sources are toggled (registry reads settings lazily). */
function useSourcesKey(): string {
  const enabled = useSettings((s) => s.sourcesEnabled);
  return JSON.stringify(enabled);
}

export function useTrending(
  genre?: string,
  time: 'week' | 'month' | 'allTime' = 'week',
  limit = 20,
) {
  const key = useSourcesKey();
  return useQuery({
    queryKey: ['trending', genre ?? 'all', time, limit, key],
    queryFn: async () => {
      const t = await audius.trending({ genre, time, limit });
      void rememberTracks(t);
      return t;
    },
    enabled: registry.isUsable('audius'),
  });
}

export function useAudiusSearch(q: string, limit = 20) {
  const key = useSourcesKey();
  return useQuery({
    queryKey: ['audius-search', q, limit, key],
    queryFn: async () => (await audius.search(q, { type: 'track', limit, offset: 0 })).tracks,
    enabled: registry.isUsable('audius') && q.length > 0,
  });
}

export function useCollection(def: CollectionDef | undefined, limit = 40) {
  const key = useSourcesKey();
  return useQuery({
    queryKey: ['collection', def?.id, limit, key],
    queryFn: async () => {
      if (!def) return [];
      const tracks = await loadCollection(
        def,
        registry.isUsable('audius') ? audius : null,
        registry.isUsable('jamendo') ? jamendo : null,
        limit,
      );
      void rememberTracks(tracks);
      return tracks;
    },
    enabled: Boolean(def) && (registry.isUsable('audius') || registry.isUsable('jamendo')),
    staleTime: 30 * 60_000,
  });
}

export function useCollectionById(id: string | undefined) {
  return useCollection(id ? collectionDef(id) : undefined);
}

export function useDemoTracks() {
  return useQuery({ queryKey: ['demo'], queryFn: loadDemoTracks, staleTime: Infinity });
}

/** Live list of history entries (not deleted), newest first. */
export function useHistory(limit = 5000): HistoryEntry[] {
  return useLiveQuery(
    async () =>
      (await db.history.orderBy('playedAt').reverse().limit(limit).toArray()).filter(
        (h) => !h.deleted,
      ),
    [limit],
    [],
  );
}

/** Tracks for a list of keys, in order (missing ones are dropped). */
export function useTracksByKeys(keys: string[] | undefined): Track[] | undefined {
  return useLiveQuery(async () => {
    if (!keys) return undefined;
    const rows = await db.tracks.bulkGet(keys);
    return rows.filter((t): t is Track => Boolean(t));
  }, [JSON.stringify(keys ?? null)]);
}

export function useStats(period: 'week' | 'month' | 'year' | 'all') {
  const history = useHistory();
  return computeStats(history, period);
}
