import { useEffect, useRef, useState } from 'react';
import {
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  LoaderCircle,
} from 'lucide-react';
import { formatDuration, presetSettings, SOUND_PRESETS } from '@tuneshift/core';
import { cn, IconButton, Tip } from '@tuneshift/ui';
import { player } from '../../player/controller';
import { usePlayer } from '../../state/player';
import { useSettings } from '../../state/settings';
import { useSound } from '../../state/sound';

export function PlayPauseButton({ size = 'lg' }: { size?: 'md' | 'lg' | 'xl' }) {
  const status = usePlayer((s) => s.status);
  const hasTrack = usePlayer((s) => Boolean(s.current || s.queue.current));
  const playing = status === 'playing' || status === 'buffering';
  const px = size === 'xl' ? 28 : size === 'lg' ? 22 : 18;
  return (
    <IconButton
      label={playing ? 'Pause' : 'Play'}
      tone="filled"
      size={size}
      disabled={!hasTrack}
      onClick={() => void player.togglePlay()}
      data-testid="play-pause"
    >
      {status === 'loading' ? (
        <LoaderCircle size={px} className="animate-spin" />
      ) : playing ? (
        <Pause size={px} fill="currentColor" />
      ) : (
        <Play size={px} fill="currentColor" className="translate-x-px" />
      )}
    </IconButton>
  );
}

export function TransportButtons({
  size = 'md',
  compact,
}: {
  size?: 'md' | 'lg' | 'xl';
  compact?: boolean;
}) {
  const shuffle = usePlayer((s) => s.queue.shuffle);
  const repeat = usePlayer((s) => s.queue.repeat);
  const icon = size === 'xl' ? 26 : size === 'lg' ? 22 : 19;
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {!compact && (
        <IconButton
          label={
            shuffle === 'off'
              ? 'Shuffle off'
              : shuffle === 'smart'
                ? 'Smart shuffle on'
                : 'Shuffle on'
          }
          active={shuffle !== 'off'}
          onClick={() => player.toggleShuffle()}
        >
          <Shuffle size={icon - 2} />
        </IconButton>
      )}
      <IconButton
        label="Previous"
        onClick={() => void player.prev()}
        size={size === 'xl' ? 'lg' : 'md'}
      >
        <SkipBack size={icon} fill="currentColor" />
      </IconButton>
      <PlayPauseButton size={size === 'md' ? 'md' : size} />
      <IconButton
        label="Next"
        onClick={() => void player.next()}
        size={size === 'xl' ? 'lg' : 'md'}
      >
        <SkipForward size={icon} fill="currentColor" />
      </IconButton>
      {!compact && (
        <IconButton
          label={repeat === 'off' ? 'Repeat off' : repeat === 'all' ? 'Repeat all' : 'Repeat one'}
          active={repeat !== 'off'}
          onClick={() => player.setRepeatMode()}
        >
          {repeat === 'one' ? <Repeat1 size={icon - 2} /> : <Repeat size={icon - 2} />}
        </IconButton>
      )}
    </div>
  );
}

/**
 * Seek bar with hover time, A–B loop markers and a "real time left" tooltip that accounts for
 * playbackRate (spec §4.2). Times shown are song time.
 */
export function SeekBar({ className }: { className?: string }) {
  const duration = usePlayer((s) => s.duration);
  const storePos = usePlayer((s) => s.position);
  const loop = usePlayer((s) => s.loop);
  const status = usePlayer((s) => s.status);
  const [pos, setPos] = useState(storePos);
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== 'playing') {
      setPos(storePos);
      return;
    }
    let raf = 0;
    const tick = () => {
      setPos(player.engine.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, storePos]);
  const d = duration || 0;
  const shown = drag ?? pos;
  const pct = d ? Math.min(100, (shown / d) * 100) : 0;
  const rate = player.engine.playbackRate || 1;
  const timeAt = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !d) return 0;
    return Math.max(0, Math.min(d, ((clientX - r.left) / r.width) * d));
  };
  return (
    <div
      className={cn(
        'flex w-full items-center gap-2 text-[11px] tabular-nums text-muted',
        className,
      )}
    >
      <span className="w-10 text-right">{formatDuration(shown)}</span>
      <div
        ref={ref}
        className="group relative flex h-5 flex-1 items-center"
        onPointerMove={(e) =>
          setHover({
            x: e.clientX - (ref.current?.getBoundingClientRect().left ?? 0),
            t: timeAt(e.clientX),
          })
        }
        onPointerLeave={() => setHover(null)}
      >
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-hover group-hover:h-2">
          {loop.a !== null && loop.b !== null && d > 0 && (
            <div
              className="absolute inset-y-0 bg-accent/30"
              style={{ left: `${(loop.a / d) * 100}%`, width: `${((loop.b - loop.a) / d) * 100}%` }}
            />
          )}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-hero"
            style={{ width: `${pct}%` }}
          />
        </div>
        {[loop.a, loop.b].map(
          (m, i) =>
            m !== null &&
            d > 0 && (
              <span
                key={i}
                aria-hidden="true"
                className="absolute top-0 h-5 w-0.5 bg-accent-text"
                style={{ left: `${(m / d) * 100}%` }}
                title={i === 0 ? 'Loop start (A)' : 'Loop end (B)'}
              />
            ),
        )}
        <input
          type="range"
          min={0}
          max={d || 1}
          step={0.1}
          value={shown}
          disabled={!d}
          aria-label="Seek"
          aria-valuetext={`${formatDuration(shown)} of ${formatDuration(d)}`}
          onChange={(e) => setDrag(Number(e.currentTarget.value))}
          onPointerUp={() => {
            if (drag !== null) player.seek(drag);
            setDrag(null);
          }}
          onKeyUp={() => {
            if (drag !== null) player.seek(drag);
            setDrag(null);
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          data-testid="seek"
        />
        {hover && d > 0 && (
          <span
            className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-chip bg-bg-elevated px-1.5 py-0.5 text-[11px] text-fg shadow-theme"
            style={{ left: hover.x }}
          >
            {formatDuration(hover.t)}
          </span>
        )}
      </div>
      <Tip
        content={
          Math.abs(rate - 1) > 0.001
            ? `Real time left at ${rate.toFixed(2)}×: ${player.realTimeLeft()}`
            : null
        }
      >
        <span className="w-10" tabIndex={Math.abs(rate - 1) > 0.001 ? 0 : -1}>
          {formatDuration(d)}
        </span>
      </Tip>
    </div>
  );
}

export function VolumeControl({ className }: { className?: string }) {
  const volume = useSettings((s) => s.volume);
  const muted = useSettings((s) => s.muted);
  const set = useSettings((s) => s.set);
  const Icon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <IconButton
        label={muted ? 'Unmute' : 'Mute'}
        size="sm"
        onClick={() => set({ muted: !muted })}
      >
        <Icon size={18} />
      </IconButton>
      <input
        type="range"
        className="ts-range w-24"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        aria-label="Volume"
        aria-valuetext={`Volume ${Math.round((muted ? 0 : volume) * 100)} percent`}
        style={{ ['--fill' as string]: `${(muted ? 0 : volume) * 100}%` }}
        onChange={(e) => set({ volume: Number(e.currentTarget.value), muted: false })}
      />
    </div>
  );
}

/** One-tap preset chips (now-playing panel, mini player). */
export function PresetChips({ limit = 8, className }: { limit?: number; className?: string }) {
  const label = useSound((s) => s.label);
  return (
    <div
      className={cn('scrollbar-none flex gap-1.5 overflow-x-auto', className)}
      role="group"
      aria-label="Quick presets"
    >
      {SOUND_PRESETS.slice(0, limit).map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={label === p.name}
          onClick={() =>
            player.applySound(presetSettings(p.id), { kind: 'preset', id: p.id }, p.name)
          }
          className={cn(
            'shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition',
            label === p.name
              ? 'bg-accent-fill text-on-accent'
              : 'bg-surface-hover text-muted hover:text-fg',
          )}
        >
          {p.name}
        </button>
      ))}
    </div>
  );
}

export function PresetBadge({ className }: { className?: string }) {
  const label = useSound((s) => s.label);
  const origin = useSound((s) => s.origin);
  const originText =
    origin === 'song'
      ? 'set for this song'
      : origin === 'playlist'
        ? 'set for this playlist'
        : origin === 'global'
          ? 'default sound'
          : 'your pick';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-hero px-2.5 py-0.5 text-[11px] font-bold text-white shadow',
        className,
      )}
      title={`Active sound: ${label} (${originText})`}
      data-testid="preset-badge"
    >
      {label}
    </span>
  );
}
