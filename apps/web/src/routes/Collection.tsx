import { useParams } from 'react-router';
import { collectionDef } from '@tuneshift/sources';
import { CollectionHeader } from '../components/CollectionHeader';
import { EmptyState, ErrorState, Skeleton } from '../components/common';
import { TrackList } from '../components/TrackList';
import { useCollectionById, useDemoTracks } from '../lib/queries';

export function CollectionPage() {
  const { id = '' } = useParams();
  const isDemo = id === 'demo';
  const def = collectionDef(id);
  const demo = useDemoTracks();
  const q = useCollectionById(isDemo ? undefined : id);
  const data = isDemo ? demo : q;
  const tracks = data.data ?? [];
  if (!isDemo && !def) return <EmptyState title="Collection not found" />;
  const title = isDemo ? 'Demo' : (def?.name ?? '');
  return (
    <div>
      <CollectionHeader
        kind="Collection"
        title={title}
        subtitle={
          isDemo
            ? 'Three original loops made for Tuneshift — try every preset on them.'
            : `${def?.subtitle} · ${tracks.length} tracks`
        }
        colors={isDemo ? ['#8b5cf6', '#ec4899'] : def?.colors}
        tracks={tracks}
        context={{ name: title, kind: 'collection', id }}
      />
      {data.isLoading ? (
        <Skeleton className="h-80" />
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      ) : tracks.length ? (
        <TrackList
          tracks={tracks}
          label={`${title} tracks`}
          context={{ name: title, kind: 'collection', id }}
        />
      ) : (
        <EmptyState
          title="Nothing here yet"
          body="This collection is built from Audius/Jamendo — turn them on in Settings."
        />
      )}
    </div>
  );
}
