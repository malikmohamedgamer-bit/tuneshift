import { memo, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { DropdownMenu } from 'radix-ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  Download,
  Ellipsis,
  ListEnd,
  ListPlus,
  ListStart,
  Pause,
  Play,
  Share2,
  Trash2,
  User,
  WandSparkles,
} from 'lucide-react';
import { formatDuration, type QueueContext, type Track } from '@tuneshift/core';
import { cn, IconButton } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Artwork, SourceBadge } from './common';
import { LikeButton } from './LikeButton';
import { player } from '../player/controller';
import { usePlayer } from '../state/player';
import { useUi } from '../state/ui';
import { db } from '../db/db';
import { addToPlaylist, createPlaylist } from '../db/library';
import { removeLocalFiles } from '../lib/localFiles';
import { isDemoId } from '../lib/demo';

const itemCls =
  'flex cursor-pointer select-none items-center gap-2 rounded-chip px-2.5 py-2 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover data-[disabled]:opacity-40';
const menuCls =
  'z-[70] min-w-[220px] rounded-ctl border border-line bg-bg-elevated p-1 shadow-theme';

export interface TrackMenuOptions {
  playlistId?: string;
  index?: number;
  total?: number;
  onMove?: (from: number, to: number) => void;
  onRemove?: () => void;
}

export function TrackMenu({
  track,
  opts = {},
  trigger,
}: {
  track: Track;
  opts?: TrackMenuOptions;
  trigger?: ReactNode;
}) {
  const nav = useNavigate();
  const setUi = useUi((s) => s.set);
  const playlists = useLiveQuery(
    async () => (await db.playlists.orderBy('order').toArray()).filter((p) => !p.deleted),
    [],
    [],
  );
  const isLocal = track.source === 'local';
  const share = async () => {
    if (track.permalink) {
      await navigator.clipboard.writeText(track.permalink);
      toast.success('Link copied');
    }
  };
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {trigger ?? (
          <IconButton
            label={`More options for ${track.title}`}
            size="sm"
            onClick={(e) => e.stopPropagation()}
          >
            <Ellipsis size={18} />
          </IconButton>
        )}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menuCls}
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu.Item className={itemCls} onSelect={() => player.playNext([track])}>
            <ListStart size={16} /> Play next
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={() => player.addToQueue([track])}>
            <ListEnd size={16} /> Add to queue
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemCls}>
              <ListPlus size={16} /> Add to playlist
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={cn(menuCls, 'max-h-72 overflow-y-auto')}>
                <DropdownMenu.Item
                  className={itemCls}
                  onSelect={() =>
                    void createPlaylist(`${track.title} mix`, [track.key]).then((p) =>
                      toast.success(`Created “${p.name}”`),
                    )
                  }
                >
                  + New playlist
                </DropdownMenu.Item>
                {playlists.map((p) => (
                  <DropdownMenu.Item
                    key={p.id}
                    className={itemCls}
                    onSelect={() =>
                      void addToPlaylist(p.id, [track]).then((n) =>
                        toast.success(n ? `Added to “${p.name}”` : `Already in “${p.name}”`),
                      )
                    }
                  >
                    {p.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          {track.artistId && !isLocal && (
            <DropdownMenu.Item
              className={itemCls}
              onSelect={() =>
                void nav(`/artist/${track.source}/${encodeURIComponent(track.artistId ?? '')}`)
              }
            >
              <User size={16} /> Go to artist
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item className={itemCls} onSelect={() => setUi({ versionsFor: track })}>
            <WandSparkles size={16} /> Find versions
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemCls}
            onSelect={() =>
              setUi({ assignFor: { kind: 'track', id: track.key, name: track.title } })
            }
          >
            <AudioWaveform size={16} /> Always play with…
          </DropdownMenu.Item>
          {track.permalink && (
            <DropdownMenu.Item className={itemCls} onSelect={() => void share()}>
              <Share2 size={16} /> Copy link
            </DropdownMenu.Item>
          )}
          {isLocal && (
            <DropdownMenu.Item className={itemCls} onSelect={() => setUi({ exportFor: track })}>
              <Download size={16} /> Export with effects
            </DropdownMenu.Item>
          )}
          {opts.onMove && opts.index !== undefined && (
            <>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item
                className={itemCls}
                disabled={opts.index === 0}
                onSelect={() => opts.onMove?.(opts.index as number, (opts.index as number) - 1)}
              >
                <ArrowUp size={16} /> Move up
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className={itemCls}
                disabled={opts.index >= (opts.total ?? 0) - 1}
                onSelect={() => opts.onMove?.(opts.index as number, (opts.index as number) + 1)}
              >
                <ArrowDown size={16} /> Move down
              </DropdownMenu.Item>
            </>
          )}
          {opts.onRemove && (
            <DropdownMenu.Item className={cn(itemCls, 'text-red-300')} onSelect={opts.onRemove}>
              <Trash2 size={16} /> Remove from playlist
            </DropdownMenu.Item>
          )}
          {isLocal && !isDemoId(track.id) && !opts.onRemove && (
            <DropdownMenu.Item
              className={cn(itemCls, 'text-red-300')}
              onSelect={() =>
                void removeLocalFiles([track.id]).then(() =>
                  toast.success('Removed from your library'),
                )
              }
            >
              <Trash2 size={16} /> Remove from library
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface TrackRowProps {
  track: Track;
  index: number;
  onPlay: () => void;
  numbered?: boolean;
  showAlbum?: boolean;
  menu?: TrackMenuOptions;
  extra?: ReactNode;
}

export const TrackRow = memo(function TrackRow({
  track,
  index,
  onPlay,
  numbered,
  showAlbum,
  menu,
  extra,
}: TrackRowProps) {
  const isCurrent = usePlayer((s) => s.current?.key === track.key);
  const playing = usePlayer(
    (s) => s.current?.key === track.key && (s.status === 'playing' || s.status === 'buffering'),
  );
  const missing = track.local?.missing;
  return (
    <div
      className={cn(
        'group grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-ctl px-2 py-1.5 transition hover:bg-surface-hover md:grid-cols-[2rem_minmax(0,2fr)_minmax(0,1fr)_auto]',
        isCurrent && 'bg-accent-soft',
        missing && 'opacity-50',
      )}
      onDoubleClick={onPlay}
      data-testid="track-row"
    >
      <div className="relative grid h-8 w-8 place-items-center">
        <span
          aria-hidden="true"
          className={cn(
            'text-sm tabular-nums text-muted group-hover:invisible group-focus-within:invisible',
            isCurrent && 'text-accent-text',
          )}
        >
          {numbered ? index + 1 : playing ? '♪' : index + 1}
        </span>
        <button
          type="button"
          onClick={() => (isCurrent ? void player.togglePlay() : onPlay())}
          aria-label={playing ? `Pause ${track.title}` : `Play ${track.title} by ${track.artist}`}
          className="absolute inset-0 grid place-items-center rounded-full text-fg opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <Artwork art={track.artwork} alt="" size="small" className="h-10 w-10" seed={track.title} />
        <div className="min-w-0">
          <div className={cn('truncate text-sm font-semibold', isCurrent && 'text-accent-text')}>
            {track.title}
          </div>
          <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
            <SourceBadge source={track.source} />
            {track.artistId && track.source !== 'local' ? (
              <Link
                to={`/artist/${track.source}/${encodeURIComponent(track.artistId)}`}
                className="truncate hover:text-fg hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {track.artist}
              </Link>
            ) : (
              <span className="truncate">{track.artist}</span>
            )}
            {missing && <span className="text-amber-300">· missing file</span>}
          </div>
        </div>
      </div>
      <div className="hidden min-w-0 truncate text-sm text-muted md:block">
        {showAlbum ? track.album : track.genre}
      </div>
      <div className="flex items-center gap-1">
        {extra}
        <span className="hidden opacity-0 transition group-hover:opacity-100 sm:inline-flex">
          <LikeButton track={track} />
        </span>
        <span className="w-10 text-right text-xs tabular-nums text-muted">
          {formatDuration(track.durationSec)}
        </span>
        <TrackMenu track={track} opts={menu} />
      </div>
    </div>
  );
});

export function TrackList({
  tracks,
  context,
  numbered,
  showAlbum,
  menuFor,
  virtualizeOver = 120,
  label,
}: {
  tracks: Track[];
  context?: QueueContext;
  numbered?: boolean;
  showAlbum?: boolean;
  menuFor?: (t: Track, i: number) => TrackMenuOptions;
  virtualizeOver?: number;
  label: string;
}) {
  const play = (i: number) => void player.playTracks(tracks, i, context);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtual = tracks.length > virtualizeOver;
  const v = useVirtualizer({
    count: virtual ? tracks.length : 0,
    getScrollElement: () => document.getElementById('main-scroll'),
    estimateSize: () => 56,
    overscan: 12,
    scrollMargin: parentRef.current?.offsetTop ?? 0,
  });
  if (!virtual) {
    return (
      <div role="list" aria-label={label} className="flex flex-col">
        {tracks.map((t, i) => (
          <div role="listitem" key={`${t.key}-${i}`}>
            <TrackRow
              track={t}
              index={i}
              onPlay={() => play(i)}
              numbered={numbered}
              showAlbum={showAlbum}
              menu={menuFor?.(t, i)}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div
      ref={parentRef}
      role="list"
      aria-label={label}
      style={{ height: v.getTotalSize(), position: 'relative' }}
    >
      {v.getVirtualItems().map((row) => {
        const t = tracks[row.index] as Track;
        return (
          <div
            role="listitem"
            key={row.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${row.start - v.options.scrollMargin}px)`,
            }}
          >
            <TrackRow
              track={t}
              index={row.index}
              onPlay={() => play(row.index)}
              numbered={numbered}
              showAlbum={showAlbum}
              menu={menuFor?.(t, row.index)}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Square card for shelves (tracks/collections). */
export function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const isCurrent = usePlayer((s) => s.current?.key === track.key);
  return (
    <div role="listitem" className="group w-40 shrink-0 snap-start md:w-44">
      <div className="relative">
        <Artwork
          art={track.artwork}
          alt={`${track.title} cover`}
          className="aspect-square w-full rounded-card shadow-theme"
          seed={track.title}
        />
        <button
          type="button"
          onClick={onPlay}
          aria-label={`Play ${track.title} by ${track.artist}`}
          className="absolute bottom-2 right-2 grid h-11 w-11 translate-y-1 place-items-center rounded-full bg-accent-fill text-on-accent opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100"
        >
          <Play size={18} fill="currentColor" />
        </button>
      </div>
      <div className={cn('mt-2 truncate text-sm font-semibold', isCurrent && 'text-accent-text')}>
        {track.title}
      </div>
      <div className="flex items-center gap-1.5 truncate text-xs text-muted">
        <SourceBadge source={track.source} />
        <span className="truncate">{track.artist}</span>
      </div>
    </div>
  );
}
