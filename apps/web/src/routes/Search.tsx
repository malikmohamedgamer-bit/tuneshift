import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { History, Play, Search as SearchIcon, X } from 'lucide-react';
import type { SearchType, SourceId } from '@tuneshift/core';
import type { TopResult } from '@tuneshift/sources';
import { Button, cn, IconButton, Segmented } from '@tuneshift/ui';
import {
  Artwork,
  EmptyState,
  ErrorState,
  SectionHeader,
  Skeleton,
  SourceBadge,
} from '../components/common';
import { TrackList } from '../components/TrackList';
import { player } from '../player/controller';
import { registry, rememberTracks, sourceLabel } from '../lib/sources';
import { db } from '../db/db';
import { addRecentSearch } from '../db/library';
import { useSettings } from '../state/settings';

type TypeFilter = 'all' | SearchType;
type SourceFilter = 'all' | SourceId;

function TopCard({ top }: { top: TopResult }) {
  if (top.kind === 'track') {
    const t = top.item;
    return (
      <div className="flex items-center gap-4 rounded-card bg-surface p-4">
        <Artwork art={t.artwork} alt={`${t.title} cover`} className="h-24 w-24" seed={t.title} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-2xl font-extrabold">{t.title}</div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <SourceBadge source={t.source} /> {t.artist} · Song
          </div>
        </div>
        <Button
          variant="primary"
          icon={<Play size={16} fill="currentColor" />}
          onClick={() => void player.playTrack(t)}
          data-testid="top-result-play"
        >
          Play
        </Button>
      </div>
    );
  }
  if (top.kind === 'artist') {
    const a = top.item;
    return (
      <Link
        to={`/artist/${a.source}/${encodeURIComponent(a.id)}`}
        className="flex items-center gap-4 rounded-card bg-surface p-4 hover:bg-surface-hover"
      >
        <Artwork
          art={a.artwork}
          alt={a.name}
          className="h-24 w-24"
          rounded="rounded-full"
          seed={a.name}
        />
        <div>
          <div className="font-display text-2xl font-extrabold">{a.name}</div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <SourceBadge source={a.source} /> Artist
          </div>
        </div>
      </Link>
    );
  }
  const c = top.item;
  return (
    <Link
      to={`/album/${c.source}/${encodeURIComponent(c.id)}`}
      className="flex items-center gap-4 rounded-card bg-surface p-4 hover:bg-surface-hover"
    >
      <Artwork art={c.artwork} alt={c.title} className="h-24 w-24" seed={c.title} />
      <div>
        <div className="font-display text-2xl font-extrabold">{c.title}</div>
        <div className="flex items-center gap-2 text-sm text-muted">
          <SourceBadge source={c.source} /> {c.kind === 'album' ? 'Album' : 'Playlist'} · {c.owner}
        </div>
      </div>
    </Link>
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const [input, setInput] = useState(q);
  const [type, setType] = useState<TypeFilter>('all');
  const [source, setSource] = useState<SourceFilter>('all');
  const enabled = useSettings((s) => s.sourcesEnabled);
  const recents = useLiveQuery(
    () => db.searches.orderBy('at').reverse().limit(10).toArray(),
    [],
    [],
  );
  useEffect(() => setInput(q), [q]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (input.trim() !== q) setParams(input.trim() ? { q: input.trim() } : {}, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [input, q, setParams]);
  const res = useQuery({
    queryKey: ['search', q, type, source, JSON.stringify(enabled)],
    queryFn: async ({ signal }) => {
      const r = await registry.search(q, {
        types: type === 'all' ? undefined : [type],
        sources: source === 'all' ? undefined : [source],
        limit: type === 'all' ? 12 : 30,
        signal,
      });
      void rememberTracks(r.tracks);
      void addRecentSearch(q);
      return r;
    },
    enabled: q.length > 0,
  });
  const sourceOptions = (['all', 'local', 'audius', 'jamendo'] as const).map((s) => ({
    value: s,
    label: s === 'all' ? 'All sources' : sourceLabel(s),
    disabled: s !== 'all' && !registry.isUsable(s),
  }));
  const r = res.data;
  const nothing = r && !r.tracks.length && !r.artists.length && !r.collections.length;
  return (
    <div className="space-y-6">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParams(input.trim() ? { q: input.trim() } : {});
        }}
        className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 focus-within:ring-2 focus-within:ring-accent"
      >
        <SearchIcon size={20} className="text-muted" aria-hidden="true" />
        <input
          id="search-input"
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Songs, artists, playlists, sped up edits…"
          aria-label="Search all sources"
          className="h-12 flex-1 bg-transparent text-base outline-none"
          autoFocus
        />
        {input && (
          <IconButton label="Clear search" size="sm" onClick={() => setInput('')}>
            <X size={16} />
          </IconButton>
        )}
      </form>
      <div className="flex flex-wrap gap-2">
        <Segmented
          label="Result type"
          size="sm"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: 'All' },
            { value: 'track', label: 'Songs' },
            { value: 'artist', label: 'Artists' },
            { value: 'playlist', label: 'Playlists' },
            { value: 'album', label: 'Albums' },
          ]}
        />
        <Segmented
          label="Source"
          size="sm"
          value={source}
          onChange={setSource}
          options={sourceOptions}
        />
      </div>

      {!q && (
        <section>
          <SectionHeader
            title="Recent searches"
            action={
              recents.length ? (
                <button
                  type="button"
                  className="text-sm text-muted hover:text-fg"
                  onClick={() => void db.searches.clear()}
                >
                  Clear
                </button>
              ) : undefined
            }
          />
          {recents.length ? (
            <div className="flex flex-wrap gap-2">
              {recents.map((s) => (
                <button
                  key={s.q}
                  type="button"
                  onClick={() => setParams({ q: s.q })}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover"
                >
                  <History size={14} className="text-muted" /> {s.q}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<SearchIcon />}
              title="Search everything at once"
              body="Your files, Audius and Jamendo are searched in parallel. Try “phonk”, “sped up” or an artist."
            />
          )}
        </section>
      )}

      {q && res.isLoading && (
        <div className="space-y-2" aria-label="Searching">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}
      {res.isError && <ErrorState error={res.error} onRetry={() => void res.refetch()} />}
      {r && r.errors.length > 0 && (
        <div
          role="status"
          className="rounded-ctl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          {r.errors.map((e) => `${sourceLabel(e.source)}: ${e.message}`).join(' · ')}
        </div>
      )}
      {nothing && (
        <EmptyState
          icon={<SearchIcon />}
          title={`No results for “${q}”`}
          body="Try another spelling, or turn on more sources in Settings."
        />
      )}
      {r && !nothing && (
        <div className="space-y-8" data-testid="search-results">
          {r.top && type === 'all' && (
            <section>
              <SectionHeader title="Top result" />
              <TopCard top={r.top} />
            </section>
          )}
          {r.tracks.length > 0 && (
            <section>
              <SectionHeader title="Songs" />
              <TrackList
                tracks={r.tracks}
                label="Songs"
                context={{ name: `Search: ${q}`, kind: 'search' }}
              />
            </section>
          )}
          {r.artists.length > 0 && (
            <section>
              <SectionHeader title="Artists" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {r.artists.map((a) => (
                  <Link
                    key={a.key}
                    to={`/artist/${a.source}/${encodeURIComponent(a.id)}`}
                    className="group text-center"
                  >
                    <Artwork
                      art={a.artwork}
                      alt={a.name}
                      className="mx-auto aspect-square w-full max-w-[9rem]"
                      rounded="rounded-full"
                      seed={a.name}
                    />
                    <div className="mt-2 truncate text-sm font-semibold group-hover:underline">
                      {a.name}
                    </div>
                    <SourceBadge source={a.source} />
                  </Link>
                ))}
              </div>
            </section>
          )}
          {r.collections.length > 0 && (
            <section>
              <SectionHeader title="Playlists & albums" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                {r.collections.map((c) => (
                  <Link
                    key={c.key}
                    to={`/album/${c.source}/${encodeURIComponent(c.id)}`}
                    className="group"
                  >
                    <Artwork
                      art={c.artwork}
                      alt={c.title}
                      className="aspect-square w-full"
                      rounded="rounded-card"
                      seed={c.title}
                    />
                    <div className="mt-2 truncate text-sm font-semibold group-hover:underline">
                      {c.title}
                    </div>
                    <div className={cn('flex items-center gap-1 text-xs text-muted')}>
                      <SourceBadge source={c.source} /> {c.kind === 'album' ? 'Album' : 'Playlist'}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
