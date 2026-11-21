import { useLiveQuery } from 'dexie-react-hooks';
import { Heart } from 'lucide-react';
import type { Track } from '@tuneshift/core';
import { CollectionHeader } from '../components/CollectionHeader';
import { EmptyState } from '../components/common';
import { TrackList } from '../components/TrackList';
import { db } from '../db/db';

export function LikedPage() {
  const tracks = useLiveQuery(async () => {
    const likes = (await db.likes.orderBy('likedAt').reverse().toArray()).filter((l) => !l.deleted);
    const rows = await db.tracks.bulkGet(likes.map((l) => l.id));
    return rows.filter((t): t is Track => Boolean(t));
  }, []);
  const list = tracks ?? [];
  return (
    <div>
      <CollectionHeader
        kind="Playlist"
        title="Liked songs"
        subtitle={`${list.length} songs`}
        tracks={list}
        context={{ name: 'Liked songs', kind: 'liked' }}
        cover={
          <div
            className="grid h-44 w-44 shrink-0 place-items-center rounded-panel bg-hero text-white shadow-theme sm:h-52 sm:w-52"
            aria-hidden="true"
          >
            <Heart size={64} fill="currentColor" />
          </div>
        }
      />
      {list.length ? (
        <TrackList
          tracks={list}
          label="Liked songs"
          context={{ name: 'Liked songs', kind: 'liked' }}
        />
      ) : (
        <EmptyState
          icon={<Heart />}
          title="Songs you like appear here"
          body="Tap the heart on any song (or press L while it plays)."
        />
      )}
    </div>
  );
}
