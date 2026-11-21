import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AUDIUS_GENRES, AUDIUS_MOODS, COLLECTIONS } from '@tuneshift/sources';
import { Segmented } from '@tuneshift/ui';
import {
  EmptyState,
  ErrorState,
  GradientCard,
  PageHeader,
  SectionHeader,
  Skeleton,
} from '../components/common';
import { TrackList } from '../components/TrackList';
import { jamendo, registry, rememberTracks } from '../lib/sources';
import { useAudiusSearch, useTrending } from '../lib/queries';

const HUES = (s: string): [string, string] => {
  const h = [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 11);
  return [`hsl(${h} 70% 42%)`, `hsl(${(h + 50) % 360} 75% 32%)`];
};

export function Browse() {
  const [genre, setGenre] = useState<string>('Electronic');
  const [mood, setMood] = useState<string | null>(null);
  const [time, setTime] = useState<'week' | 'month' | 'allTime'>('week');
  const trending = useTrending(genre, time, 40);
  const moodQ = useAudiusSearch(mood ?? '', 30);
  const featured = useQuery({
    queryKey: ['jamendo-featured'],
    queryFn: async () => {
      const t = await jamendo.trending({ time: 'week', limit: 20 });
      void rememberTracks(t);
      return t;
    },
    enabled: registry.isUsable('jamendo'),
  });
  const audiusOn = registry.isUsable('audius');
  return (
    <div className="space-y-10">
      <PageHeader title="Browse" subtitle="Genres, moods and what's trending" />
      <section>
        <SectionHeader title="Collections" />
        <div role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {COLLECTIONS.map((c) => (
            <GradientCard
              key={c.id}
              to={`/collection/${c.id}`}
              title={c.name}
              subtitle={c.subtitle}
              colors={c.colors}
            />
          ))}
        </div>
      </section>
      {audiusOn ? (
        <>
          <section>
            <SectionHeader title="Genres" />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Genre">
              {AUDIUS_GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={genre === g}
                  onClick={() => setGenre(g)}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-white shadow transition hover:scale-105 aria-checked:ring-2 aria-checked:ring-fg"
                  style={{
                    backgroundImage: `linear-gradient(135deg, ${HUES(g)[0]}, ${HUES(g)[1]})`,
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </section>
          <section>
            <SectionHeader
              title={`Trending in ${genre}`}
              action={
                <Segmented
                  label="Period"
                  size="sm"
                  value={time}
                  onChange={setTime}
                  options={[
                    { value: 'week', label: 'Week' },
                    { value: 'month', label: 'Month' },
                    { value: 'allTime', label: 'All time' },
                  ]}
                />
              }
            />
            {trending.isLoading ? (
              <Skeleton className="h-64" />
            ) : trending.isError ? (
              <ErrorState error={trending.error} onRetry={() => void trending.refetch()} />
            ) : trending.data?.length ? (
              <TrackList
                tracks={trending.data}
                label={`Trending ${genre}`}
                numbered
                context={{ name: `Trending ${genre}`, kind: 'trending' }}
              />
            ) : (
              <EmptyState title="Nothing trending here right now" />
            )}
          </section>
          <section>
            <SectionHeader title="Moods" />
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Mood">
              {AUDIUS_MOODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mood === m}
                  onClick={() => setMood(mood === m ? null : m)}
                  className="rounded-full bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-hover aria-checked:bg-accent-fill aria-checked:text-on-accent"
                >
                  {m}
                </button>
              ))}
            </div>
            {mood && (
              <div className="mt-4">
                {moodQ.isLoading ? (
                  <Skeleton className="h-40" />
                ) : moodQ.data?.length ? (
                  <TrackList
                    tracks={moodQ.data}
                    label={`${mood} songs`}
                    context={{ name: mood, kind: 'mood' }}
                  />
                ) : (
                  <EmptyState title={`No ${mood} songs found`} />
                )}
              </div>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title="Audius is off"
          body="Turn Audius on in Settings → Sources to browse genres and trending."
          action={
            <Link
              className="text-sm font-semibold text-accent-text underline"
              to="/settings/sources"
            >
              Sources settings
            </Link>
          }
        />
      )}
      <section>
        <SectionHeader title="Jamendo featured" subtitle="Creative Commons music" />
        {registry.isUsable('jamendo') ? (
          featured.isLoading ? (
            <Skeleton className="h-40" />
          ) : featured.isError ? (
            <ErrorState error={featured.error} />
          ) : (
            <TrackList
              tracks={featured.data ?? []}
              label="Jamendo featured"
              context={{ name: 'Jamendo featured', kind: 'collection' }}
            />
          )
        ) : (
          <EmptyState
            title="Add a Jamendo key to enable"
            body={registry.statusOf('jamendo').reason ?? 'Jamendo is turned off.'}
            action={
              <Link
                className="text-sm font-semibold text-accent-text underline"
                to="/settings/sources"
              >
                Add key
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}
