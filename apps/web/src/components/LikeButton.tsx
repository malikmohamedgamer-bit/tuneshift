import { useLiveQuery } from 'dexie-react-hooks';
import { Heart } from 'lucide-react';
import { IconButton } from '@tuneshift/ui';
import type { Track } from '@tuneshift/core';
import { toast } from 'sonner';
import { db } from '../db/db';
import { toggleLike } from '../db/library';

export function useIsLiked(key?: string): boolean {
  return useLiveQuery(
    async () => (key ? Boolean((await db.likes.get(key))?.deleted === false) : false),
    [key],
    false,
  );
}

export function LikeButton({ track, size = 'sm' }: { track: Track; size?: 'sm' | 'md' | 'lg' }) {
  const liked = useIsLiked(track.key);
  return (
    <IconButton
      label={liked ? `Remove ${track.title} from Liked songs` : `Like ${track.title}`}
      active={liked}
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        void toggleLike(track).then((now) =>
          toast.success(now ? 'Added to Liked songs' : 'Removed from Liked songs'),
        );
      }}
    >
      <Heart size={size === 'lg' ? 22 : 17} fill={liked ? 'currentColor' : 'none'} />
    </IconButton>
  );
}
