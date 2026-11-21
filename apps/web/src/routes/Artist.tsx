import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import type { SourceId } from '@tuneshift/core';
import { CollectionHeader } from '../components/CollectionHeader';
import { EmptyState, ErrorState, SectionHeader, Skeleton, SourceBadge } from '../components/common';
import { TrackList } from '../components/TrackList';
import { registry, rememberTracks } from '../lib/sources';

export function ArtistPage() {
  const { source = 'audius', id = '' } = useParams();
  const src = source as SourceId;
  const q = useQuery({
    queryKey: ['artist', src, id],
    queryFn: async () => {
      const a = registry.get(src);
      if (!a.getArtist) throw new Error('This source has no artist pages');
      const artist = await a.getArtist(id);
      void rememberTracks(artist.tracks ?? []);
      return artist;
    },
    enabled: registry.has(src) && registry.isUsable(src),
  });
  if (!registry.has(src) || !registry.isUsable(src))
    return (
      <EmptyState
        title="This source is turned off"
        body={registry.has(src) ? registry.statusOf(src).reason : undefined}
      />
    );
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const a = q.data;
  if (!a) return null;
  const tracks = a.tracks ?? [];
  return (
    <div>
      <CollectionHeader
        kind="Artist"
        title={a.name}
        round
        art={a.artwork}
        tracks={tracks}
        context={{ name: a.name, kind: 'artist', id: a.id }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <SourceBadge source={a.source} />
            {a.followerCount !== undefined && (
              <span>{a.followerCount.toLocaleString()} followers</span>
            )}
            {a.permalink && (
              <a
                className="inline-flex items-center gap-1 underline"
                href={a.permalink}
                target="_blank"
                rel="noreferrer"
              >
                View on {a.source === 'audius' ? 'Audius' : 'Jamendo'} <ExternalLink size={12} />
              </a>
            )}
          </span>
        }
      />
      {a.bio && <p className="mb-6 max-w-3xl whitespace-pre-line text-sm text-muted">{a.bio}</p>}
      <SectionHeader title="Popular" />
      {tracks.length ? (
        <TrackList
          tracks={tracks}
          label={`${a.name} songs`}
          numbered
          context={{ name: a.name, kind: 'artist', id: a.id }}
        />
      ) : (
        <EmptyState title="No playable tracks" />
      )}
    </div>
  );
}
