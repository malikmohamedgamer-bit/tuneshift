import type { ReactNode } from 'react';
import { Play, Shuffle } from 'lucide-react';
import type { Artwork as ArtworkT, QueueContext, Track } from '@tuneshift/core';
import { Button } from '@tuneshift/ui';
import { Artwork } from './common';
import { player } from '../player/controller';
import { getPlayer } from '../state/player';

export function CollectionHeader({
  kind,
  title,
  subtitle,
  art,
  colors,
  tracks,
  context,
  round,
  children,
  cover,
}: {
  kind: string;
  title: string;
  subtitle?: ReactNode;
  art?: ArtworkT;
  colors?: readonly [string, string];
  tracks: Track[];
  context: QueueContext;
  round?: boolean;
  children?: ReactNode;
  cover?: ReactNode;
}) {
  const shufflePlay = async () => {
    if (getPlayer().queue.shuffle === 'off') player.toggleShuffle();
    await player.playTracks(tracks, Math.floor(Math.random() * tracks.length), context);
  };
  return (
    <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
      {cover ??
        (colors && !art ? (
          <div
            className="h-44 w-44 shrink-0 rounded-panel shadow-theme sm:h-52 sm:w-52"
            style={{ backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
            aria-hidden="true"
          />
        ) : (
          <Artwork
            art={art}
            alt={`${title} cover`}
            size="large"
            className="h-44 w-44 shadow-theme sm:h-52 sm:w-52"
            rounded={round ? 'rounded-full' : 'rounded-panel'}
            seed={title}
          />
        ))}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold uppercase tracking-wider text-muted">{kind}</div>
        <h1 className="mt-1 break-words font-display text-3xl font-extrabold tracking-tight md:text-5xl">
          {title}
        </h1>
        {subtitle && <div className="mt-2 text-sm text-muted">{subtitle}</div>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="lg"
            icon={<Play size={18} fill="currentColor" />}
            disabled={!tracks.length}
            onClick={() => void player.playTracks(tracks, 0, context)}
            data-testid="collection-play"
          >
            Play
          </Button>
          <Button
            size="lg"
            icon={<Shuffle size={18} />}
            disabled={!tracks.length}
            onClick={() => void shufflePlay()}
          >
            Shuffle
          </Button>
          {children}
        </div>
      </div>
    </header>
  );
}
