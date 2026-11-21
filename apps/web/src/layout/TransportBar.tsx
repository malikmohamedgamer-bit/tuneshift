import { Link } from 'react-router';
import { DropdownMenu } from 'radix-ui';
import {
  ListMusic,
  Maximize2,
  MicVocal,
  PanelRight,
  Repeat,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import { IconButton, cn } from '@tuneshift/ui';
import { Artwork, CapabilityBadge, SourceBadge } from '../components/common';
import { LikeButton } from '../components/LikeButton';
import {
  PresetBadge,
  SeekBar,
  TransportButtons,
  VolumeControl,
} from '../components/player/PlayerControls';
import { player } from '../player/controller';
import { askText } from '../components/Ask';
import { usePlayer } from '../state/player';
import { useUi } from '../state/ui';

const itemCls =
  'flex cursor-pointer items-center gap-2 rounded-chip px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-surface-hover';

export function SleepMenu() {
  const sleep = usePlayer((s) => s.sleep);
  const set = (mode: 'off' | 'time' | 'track' | 'queue', min = 0) => player.setSleep(mode, min);
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          label={sleep.mode === 'off' ? 'Sleep timer' : 'Sleep timer on'}
          active={sleep.mode !== 'off'}
          size="sm"
        >
          <Timer size={17} />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[70] min-w-[200px] rounded-ctl border border-line bg-bg-elevated p-1 shadow-theme"
          sideOffset={6}
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-bold uppercase text-muted">
            Sleep timer
          </DropdownMenu.Label>
          {[5, 10, 15, 30, 45, 60, 90].map((m) => (
            <DropdownMenu.Item key={m} className={itemCls} onSelect={() => set('time', m)}>
              {m} minutes
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Item
            className={itemCls}
            onSelect={() =>
              void askText({
                title: 'Custom sleep timer',
                label: 'Stop playback after (minutes)',
                initial: '20',
                inputMode: 'numeric',
                validate: (v) => {
                  const n = Number(v);
                  return Number.isFinite(n) && n > 0 && n <= 600 ? null : 'Enter 1–600 minutes';
                },
              }).then((v) => v && set('time', Number(v)))
            }
          >
            Custom…
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={() => set('track')}>
            End of track
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemCls} onSelect={() => set('queue')}>
            End of queue
          </DropdownMenu.Item>
          {sleep.mode !== 'off' && (
            <DropdownMenu.Item
              className={cn(itemCls, 'text-red-300')}
              onSelect={() => player.cancelSleep(true)}
            >
              Turn off
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function LoopMenu() {
  const loop = usePlayer((s) => s.loop);
  const on = loop.a !== null && loop.b !== null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton label={on ? 'A–B loop on' : 'A–B loop'} active={loop.a !== null} size="sm">
          <span className="text-[11px] font-black">A‑B</span>
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-[70] min-w-[180px] rounded-ctl border border-line bg-bg-elevated p-1 shadow-theme"
          sideOffset={6}
        >
          <DropdownMenu.Item className={itemCls} onSelect={() => player.setLoopPoint('a')}>
            <Repeat size={14} /> Set A here
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemCls}
            disabled={loop.a === null}
            onSelect={() => player.setLoopPoint('b')}
          >
            <Repeat size={14} /> Set B here
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemCls}
            disabled={loop.a === null && loop.b === null}
            onSelect={() => player.clearLoop()}
          >
            Clear loop
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Bottom transport bar (desktop/tablet). */
export function TransportBar() {
  const current = usePlayer((s) => s.current);
  const mode = usePlayer((s) => s.mode);
  const setUi = useUi((s) => s.set);
  const panelOpen = useUi((s) => s.nowPanelOpen);
  return (
    <footer
      aria-label="Player"
      className="glass grid h-[88px] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 border-t border-line px-4"
    >
      <div className="flex min-w-0 items-center gap-3">
        {current ? (
          <>
            <button
              type="button"
              onClick={() => setUi({ fullPlayer: true })}
              aria-label="Open full-screen player"
              className="shrink-0"
            >
              <Artwork
                art={current.artwork}
                alt=""
                size="small"
                className="h-14 w-14"
                seed={current.title}
              />
            </button>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold" data-testid="now-title">
                {current.title}
              </div>
              <div className="flex items-center gap-1.5 truncate text-xs text-muted">
                <SourceBadge source={current.source} />
                <span className="truncate">{current.artist}</span>
              </div>
              <div className="mt-1 hidden items-center gap-1.5 lg:flex">
                <PresetBadge />
                <CapabilityBadge track={current} mode={mode} />
              </div>
            </div>
            <LikeButton track={current} />
          </>
        ) : (
          <p className="text-sm text-muted">Pick something to play</p>
        )}
      </div>
      <div className="flex flex-col items-center gap-1">
        <TransportButtons />
        <SeekBar className="max-w-2xl" />
      </div>
      <div className="flex items-center justify-end gap-1">
        <LoopMenu />
        <SleepMenu />
        <Link
          to="/lab"
          aria-label="Open Sound Lab"
          title="Sound Lab"
          className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-hover hover:text-fg"
        >
          <SlidersHorizontal size={17} />
        </Link>
        <IconButton
          label="Lyrics"
          size="sm"
          onClick={() => setUi({ nowPanelOpen: true, nowTab: 'lyrics' })}
        >
          <MicVocal size={17} />
        </IconButton>
        <IconButton
          label="Queue"
          size="sm"
          onClick={() => setUi({ nowPanelOpen: true, nowTab: 'queue' })}
        >
          <ListMusic size={17} />
        </IconButton>
        <IconButton
          label={panelOpen ? 'Hide now-playing panel' : 'Show now-playing panel'}
          size="sm"
          active={panelOpen}
          className="hidden xl:inline-flex"
          onClick={() => setUi({ nowPanelOpen: !panelOpen })}
        >
          <PanelRight size={17} />
        </IconButton>
        <VolumeControl className="hidden md:flex" />
        <IconButton label="Full screen" size="sm" onClick={() => setUi({ fullPlayer: true })}>
          <Maximize2 size={16} />
        </IconButton>
      </div>
    </footer>
  );
}
