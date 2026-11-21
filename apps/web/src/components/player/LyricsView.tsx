import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { Minus, MicVocal, Plus, RotateCcw } from 'lucide-react';
import {
  activeLineIndex,
  cloneSound,
  LYRICS_OFFSET_LIMIT_MS,
  lyricsClock,
  type Track,
} from '@tuneshift/core';
import { Button, cn, IconButton, Switch } from '@tuneshift/ui';
import { EmptyState, ErrorState, Skeleton } from '../common';
import { lyrics } from '../../lib/sources';
import { db } from '../../db/db';
import { setLyricsOffset } from '../../db/library';
import { player } from '../../player/controller';
import { usePlayer } from '../../state/player';
import { useSound } from '../../state/sound';
import { prefersReducedMotion } from '../../state/settings';

/**
 * Synced lyrics (LRCLIB): smooth auto-scroll, active line highlight, tap-to-seek, per-track
 * offset (±5 s), plain-text fallback, karaoke toggle. Timing follows song time, so it scales
 * with playback speed automatically (spec §7).
 */
export function LyricsView({ track, big }: { track: Track; big?: boolean }) {
  const q = useQuery({
    queryKey: ['lyrics', track.key],
    queryFn: ({ signal }) =>
      lyrics.find(
        {
          title: track.title,
          artist: track.artist,
          album: track.album,
          durationSec: track.durationSec,
        },
        signal,
      ),
    staleTime: Infinity,
    retry: false,
  });
  const offset = useLiveQuery(
    async () => (await db.lyricsOffsets.get(track.key))?.offsetMs ?? 0,
    [track.key],
    0,
  );
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLOListElement>(null);
  const isCurrent = usePlayer((s) => s.current?.key === track.key);
  const sound = useSound((s) => s.settings);
  const karaoke = sound.vocalReduce.enabled;
  const data = q.data;
  const lines = data?.status === 'found' && data.lyrics.synced ? data.lyrics.lines : null;

  useEffect(() => {
    if (!lines || !isCurrent) return;
    let raf = 0;
    let last = -2;
    const tick = () => {
      const idx = activeLineIndex(lines, lyricsClock(player.engine.currentTime, offset));
      if (idx !== last) {
        last = idx;
        setActive(idx);
        const el = listRef.current?.children[idx] as HTMLElement | undefined;
        el?.scrollIntoView({
          block: 'center',
          behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lines, offset, isCurrent]);

  const bump = (d: number) => {
    const next = Math.max(-LYRICS_OFFSET_LIMIT_MS, Math.min(LYRICS_OFFSET_LIMIT_MS, offset + d));
    void setLyricsOffset(track.key, next);
  };
  const toggleKaraoke = (on: boolean) => {
    const s = cloneSound(sound);
    s.vocalReduce = {
      enabled: on,
      amount: on ? Math.max(0.9, s.vocalReduce.amount) : s.vocalReduce.amount,
    };
    player.applySound(s);
  };

  if (q.isLoading) {
    return (
      <div className="space-y-3 p-2" aria-label="Loading lyrics">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
    );
  }
  if (q.isError)
    return (
      <ErrorState title="Couldn't load lyrics" error={q.error} onRetry={() => void q.refetch()} />
    );
  if (!data || data.status !== 'found') {
    return (
      <EmptyState
        icon={<MicVocal />}
        title={data?.status === 'instrumental' ? 'Instrumental' : 'No lyrics found'}
        body={
          data?.status === 'instrumental'
            ? 'This one has no words — enjoy the music.'
            : 'LRCLIB has no lyrics for this song yet.'
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3" data-testid="lyrics-view">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {lines && (
          <div className="flex items-center gap-1" role="group" aria-label="Lyrics timing offset">
            <IconButton label="Lyrics earlier by 0.25 seconds" size="sm" onClick={() => bump(-250)}>
              <Minus size={14} />
            </IconButton>
            <span className="w-16 text-center tabular-nums text-muted">
              {offset === 0 ? 'in sync' : `${offset > 0 ? '+' : ''}${(offset / 1000).toFixed(2)} s`}
            </span>
            <IconButton label="Lyrics later by 0.25 seconds" size="sm" onClick={() => bump(250)}>
              <Plus size={14} />
            </IconButton>
            {offset !== 0 && (
              <IconButton
                label="Reset lyrics offset"
                size="sm"
                onClick={() => void setLyricsOffset(track.key, 0)}
              >
                <RotateCcw size={14} />
              </IconButton>
            )}
          </div>
        )}
        <div className="ml-auto">
          <Switch label="Karaoke" checked={karaoke} onChange={toggleKaraoke} />
        </div>
      </div>
      {lines ? (
        <ol
          ref={listRef}
          className={cn(
            'scrollbar-none min-h-0 flex-1 space-y-3 overflow-y-auto py-[30vh]',
            big && 'space-y-5',
          )}
        >
          {lines.map((l, i) => (
            <li key={`${l.timeMs}-${i}`}>
              <button
                type="button"
                onClick={() => isCurrent && player.seek(Math.max(0, (l.timeMs - offset) / 1000))}
                aria-current={i === active ? 'true' : undefined}
                className={cn(
                  'w-full text-left font-display font-bold leading-snug transition-all duration-300',
                  big ? 'text-3xl md:text-4xl' : 'text-xl',
                  i === active
                    ? 'scale-[1.02] text-fg'
                    : i < active
                      ? 'text-muted/60'
                      : 'text-muted',
                )}
              >
                {l.text || '♪'}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap font-body text-base leading-relaxed text-fg">
          {data.lyrics.plain}
        </pre>
      )}
      <p className="text-[11px] text-muted">
        Lyrics from{' '}
        <a href="https://lrclib.net" target="_blank" rel="noreferrer" className="underline">
          LRCLIB
        </a>
        {!lines && ' · not synced'}
      </p>
    </div>
  );
}

export function LyricsUnavailable() {
  return (
    <EmptyState
      icon={<MicVocal />}
      title="Nothing playing"
      body="Lyrics appear here for the current song."
      action={
        <Button size="sm" onClick={() => void player.play()}>
          Play
        </Button>
      }
    />
  );
}
