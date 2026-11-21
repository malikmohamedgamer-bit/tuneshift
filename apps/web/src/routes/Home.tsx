import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play, Sparkles } from 'lucide-react';
import {
  fisherYates,
  greeting,
  presetSettings,
  seededRng,
  SOUND_PRESETS,
  topGenresForMixes,
  type Track,
} from '@tuneshift/core';
import { COLLECTIONS } from '@tuneshift/sources';
import { Button, cn } from '@tuneshift/ui';
import {
  Artwork,
  EmptyState,
  ErrorState,
  GradientCard,
  SectionHeader,
  Shelf,
  ShelfSkeleton,
} from '../components/common';
import { TrackCard } from '../components/TrackList';
import { FriendsShelf } from '../components/social/FriendsShelf';
import { player } from '../player/controller';
import { useSettings } from '../state/settings';
import { useSound } from '../state/sound';
import { audius, registry, rememberTracks } from '../lib/sources';
import {
  useCollection,
  useDemoTracks,
  useHistory,
  useTracksByKeys,
  useTrending,
} from '../lib/queries';
import { listSounds, recentTrackKeys } from '../db/library';

function TrackShelf({
  tracks,
  label,
  context,
}: {
  tracks: Track[];
  label: string;
  context: string;
}) {
  return (
    <Shelf label={label}>
      {tracks.map((t, i) => (
        <TrackCard
          key={t.key}
          track={t}
          onPlay={() => void player.playTracks(tracks, i, { name: context, kind: 'collection' })}
        />
      ))}
    </Shelf>
  );
}

function ContinueListening() {
  const keys = useLiveQuery(() => recentTrackKeys(8), [], undefined);
  const tracks = useTracksByKeys(keys);
  if (!tracks?.length) return null;
  return (
    <section>
      <SectionHeader title="Continue listening" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {tracks.slice(0, 8).map((t, i) => (
          <button
            key={t.key}
            type="button"
            onClick={() =>
              void player.playTracks(tracks, i, { name: 'Recently played', kind: 'history' })
            }
            className="group flex items-center gap-3 overflow-hidden rounded-ctl bg-surface/80 pr-3 text-left transition hover:bg-surface-hover"
          >
            <TrackArt track={t} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.title}</span>
            <Play
              size={16}
              className="shrink-0 opacity-0 transition group-hover:opacity-100"
              fill="currentColor"
            />
          </button>
        ))}
      </div>
    </section>
  );
}

function TrackArt({ track }: { track: Track }) {
  return (
    <Artwork
      art={track.artwork}
      alt=""
      size="small"
      className="h-14 w-14"
      rounded="rounded-none"
      seed={track.title}
    />
  );
}

function SpedSlowedPicks() {
  const q = useQuery({
    queryKey: ['sped-slowed-picks'],
    queryFn: async () => {
      const [a, b] = await Promise.all([
        audius.search('sped up', { type: 'track', limit: 10, offset: 0 }),
        audius.search('slowed reverb', { type: 'track', limit: 10, offset: 0 }),
      ]);
      const mix: Track[] = [];
      for (let i = 0; i < 10; i++) {
        if (a.tracks[i]) mix.push(a.tracks[i] as Track);
        if (b.tracks[i]) mix.push(b.tracks[i] as Track);
      }
      void rememberTracks(mix);
      return mix;
    },
    enabled: registry.isUsable('audius'),
  });
  if (!registry.isUsable('audius')) return null;
  return (
    <section>
      <SectionHeader
        title="Sped up & slowed picks"
        subtitle="Edits from Audius — or make your own in the Sound Lab"
      />
      {q.isLoading ? (
        <ShelfSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <TrackShelf
          tracks={q.data ?? []}
          label="Sped up and slowed picks"
          context="Sped up & slowed picks"
        />
      )}
    </section>
  );
}

function Trending() {
  const q = useTrending(undefined, 'week', 20);
  if (!registry.isUsable('audius')) return null;
  return (
    <section>
      <SectionHeader
        title="Trending on Audius"
        subtitle="This week"
        action={
          <Link to="/browse" className="text-sm font-semibold text-muted hover:text-fg">
            Browse all
          </Link>
        }
      />
      {q.isLoading ? (
        <ShelfSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <TrackShelf tracks={q.data ?? []} label="Trending on Audius" context="Trending on Audius" />
      )}
    </section>
  );
}

function CollectionCard({ id }: { id: string }) {
  const def = COLLECTIONS.find((c) => c.id === id);
  const q = useCollection(def);
  if (!def) return null;
  return (
    <GradientCard
      to={`/collection/${def.id}`}
      title={def.name}
      subtitle={def.subtitle}
      colors={def.colors}
      count={q.data?.length}
    />
  );
}

function Collections() {
  const online = registry.isUsable('audius') || registry.isUsable('jamendo');
  const demo = useDemoTracks();
  return (
    <section>
      <SectionHeader title="Collections" />
      <div role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <GradientCard
          to="/collection/demo"
          title="Demo"
          subtitle="Original Tuneshift loops"
          colors={['#8b5cf6', '#ec4899']}
          count={demo.data?.length}
        />
        {online && COLLECTIONS.map((c) => <CollectionCard key={c.id} id={c.id} />)}
      </div>
      {!online && (
        <p className="mt-3 text-sm text-muted">
          Turn on Audius or Jamendo in Settings → Sources to see more collections.
        </p>
      )}
    </section>
  );
}

function TopSounds() {
  const history = useHistory(2000);
  const saved = useLiveQuery(() => listSounds(), [], []);
  const active = useSound((s) => s.label);
  const top = useMemo(() => {
    const counts = new Map<string, number>();
    for (const h of history)
      if (h.presetName) counts.set(h.presetName, (counts.get(h.presetName) ?? 0) + 1);
    const presets = [...SOUND_PRESETS]
      .sort((a, b) => (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0))
      .slice(0, 6);
    return { presets, favs: saved.filter((s) => s.favourite).slice(0, 4) };
  }, [history, saved]);
  return (
    <section>
      <SectionHeader
        title="Your top sounds"
        subtitle="One tap applies it to whatever's playing"
        action={
          <Link to="/lab" className="text-sm font-semibold text-muted hover:text-fg">
            Sound Lab
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {top.favs.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => player.applySound(s.settings, { kind: 'saved', id: s.id }, s.name)}
            className={cn(
              'rounded-card bg-surface p-3 text-left transition hover:bg-surface-hover',
              active === s.name && 'ring-2 ring-accent',
            )}
          >
            <span className="text-xs font-bold uppercase text-accent-text">My sound</span>
            <span className="block truncate font-semibold">{s.name}</span>
          </button>
        ))}
        {top.presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() =>
              player.applySound(presetSettings(p.id), { kind: 'preset', id: p.id }, p.name)
            }
            className={cn(
              'rounded-card p-3 text-left text-white transition hover:scale-[1.02]',
              active === p.name && 'ring-2 ring-fg',
            )}
            style={{ backgroundImage: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})` }}
          >
            <span className="block font-bold">{p.name}</span>
            <span className="text-xs text-white/85">{p.subtitle}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function MadeForYou() {
  const history = useHistory(3000);
  const genres = useMemo(() => {
    const g = topGenresForMixes(history, 3);
    const defaults = ['Electronic', 'Hip-Hop/Rap', 'Lo-Fi'];
    return [...g, ...defaults.filter((d) => !g.includes(d))].slice(0, 3);
  }, [history]);
  const day = Math.floor(Date.now() / 86_400_000);
  const q = useQuery({
    queryKey: ['daily-mixes', genres, day],
    queryFn: async () => {
      const lists = await Promise.all(
        genres.map((g) =>
          audius.trending({ genre: g, time: 'month', limit: 40 }).catch(() => [] as Track[]),
        ),
      );
      return lists.map((l, i) => ({
        genre: genres[i] as string,
        tracks: fisherYates(l, seededRng(day + i)).slice(0, 25),
      }));
    },
    enabled: registry.isUsable('audius'),
  });
  if (!registry.isUsable('audius')) return null;
  const colors: [string, string][] = [
    ['#7c3aed', '#db2777'],
    ['#0891b2', '#7c3aed'],
    ['#ea580c', '#be123c'],
  ];
  return (
    <section>
      <SectionHeader
        title="Made for you"
        subtitle={
          history.length
            ? 'Daily mixes from your top genres'
            : 'Starter mixes — they adapt as you listen'
        }
      />
      {q.isLoading ? (
        <ShelfSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {(q.data ?? []).map((m, i) => (
            <div
              key={m.genre}
              className="flex flex-col justify-between gap-3 rounded-card p-4 text-white"
              style={{
                backgroundImage: `linear-gradient(135deg, ${colors[i]?.[0]}, ${colors[i]?.[1]})`,
              }}
            >
              <div>
                <div className="text-xs font-bold uppercase text-white/80">Daily mix {i + 1}</div>
                <div className="font-display text-xl font-extrabold">{m.genre}</div>
                <div className="text-xs text-white/80">
                  {m.tracks.length} tracks · new every day
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Play size={14} fill="currentColor" />}
                disabled={!m.tracks.length}
                onClick={() =>
                  void player.playTracks(m.tracks, 0, {
                    name: `Daily mix: ${m.genre}`,
                    kind: 'mix',
                  })
                }
              >
                Play mix
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Home() {
  const name = useSettings((s) => s.displayName);
  const demo = useDemoTracks();
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            className="font-display text-3xl font-extrabold tracking-tight md:text-4xl"
            data-testid="greeting"
          >
            {greeting(new Date(), name)}
          </h1>
          <p className="mt-1 text-muted">What are we shifting today?</p>
        </div>
        {demo.data && demo.data.length > 0 && (
          <Button
            variant="primary"
            icon={<Sparkles size={16} />}
            onClick={() =>
              void player.playTracks(demo.data ?? [], 0, {
                name: 'Demo',
                kind: 'collection',
                id: 'demo',
              })
            }
          >
            Play the demo loops
          </Button>
        )}
      </header>
      <ContinueListening />
      <SpedSlowedPicks />
      <Trending />
      <Collections />
      <FriendsShelf />
      <TopSounds />
      <MadeForYou />
      {!registry.isUsable('audius') && !registry.isUsable('jamendo') && (
        <EmptyState
          title="Online catalogs are off"
          body="You can still play the demo loops and your own files. Turn sources on in Settings."
          action={
            <Link
              to="/settings/sources"
              className="text-sm font-semibold text-accent-text underline"
            >
              Open Sources settings
            </Link>
          }
        />
      )}
    </div>
  );
}
