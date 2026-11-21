import { Link, useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ListPlus } from 'lucide-react';
import type { SourceId } from '@tuneshift/core';
import { Button } from '@tuneshift/ui';
import { toast } from 'sonner';
import { CollectionHeader } from '../components/CollectionHeader';
import { EmptyState, ErrorState, Skeleton, SourceBadge } from '../components/common';
import { TrackList } from '../components/TrackList';
import { registry, rememberTracks } from '../lib/sources';
import { createPlaylist } from '../db/library';

export function AlbumPage() {
  const { source = 'audius', id = '' } = useParams();
  const src = source as SourceId;
  const nav = useNavigate();
  const q = useQuery({
    queryKey: ['album', src, id],
    queryFn: async () => {
      const a = registry.get(src);
      if (!a.getAlbumOrPlaylist) throw new Error('This source has no album pages');
      const c = await a.getAlbumOrPlaylist(id);
      void rememberTracks(c.tracks);
      return c;
    },
    enabled: registry.has(src) && registry.isUsable(src),
  });
  if (!registry.has(src) || !registry.isUsable(src))
    return <EmptyState title="This source is turned off" />;
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const c = q.data;
  if (!c) return null;
  const save = async () => {
    const p = await createPlaylist(
      c.title,
      c.tracks.map((t) => t.key),
    );
    toast.success(`Saved “${c.title}” to your playlists`, {
      action: { label: 'Open', onClick: () => void nav(`/playlist/${p.id}`) },
    });
  };
  return (
    <div>
      <CollectionHeader
        kind={c.kind === 'album' ? 'Album' : 'Playlist'}
        title={c.title}
        art={c.artwork}
        tracks={c.tracks}
        context={{ name: c.title, kind: c.kind, id: c.key }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <SourceBadge source={c.source} />
            {c.owner &&
              (c.ownerId ? (
                <Link
                  className="hover:underline"
                  to={`/artist/${c.source}/${encodeURIComponent(c.ownerId)}`}
                >
                  {c.owner}
                </Link>
              ) : (
                <span>{c.owner}</span>
              ))}
            <span>· {c.tracks.length} songs</span>
            {c.permalink && (
              <a
                className="inline-flex items-center gap-1 underline"
                href={c.permalink}
                target="_blank"
                rel="noreferrer"
              >
                Open source page <ExternalLink size={12} />
              </a>
            )}
          </span>
        }
      >
        <Button
          size="lg"
          icon={<ListPlus size={18} />}
          onClick={() => void save()}
          disabled={!c.tracks.length}
        >
          Save as playlist
        </Button>
      </CollectionHeader>
      {c.description && <p className="mb-6 max-w-3xl text-sm text-muted">{c.description}</p>}
      {c.tracks.length ? (
        <TrackList
          tracks={c.tracks}
          label={`${c.title} tracks`}
          numbered
          context={{ name: c.title, kind: c.kind, id: c.key }}
        />
      ) : (
        <EmptyState title="No playable tracks" />
      )}
    </div>
  );
}
