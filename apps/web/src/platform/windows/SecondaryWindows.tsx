import { useEffect, useRef, useState } from 'react';
import { DropdownMenu } from 'radix-ui';
import {
  ChevronsDown,
  ChevronsUp,
  Heart,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  X,
} from 'lucide-react';
import { builtInTheme, defaultTheme, formatDuration, SOUND_PRESETS } from '@tuneshift/core';
import { applyTheme, cn } from '@tuneshift/ui';
import {
  COMMAND_EVENT,
  STATE_EVENT,
  type DesktopCommand,
  type DesktopState,
} from '../desktopState';
import { tauriInvoke } from '../tauriBridge';

/** Shared: subscribe to the main window's state broadcast. */
function useDesktopState(): DesktopState | null {
  const [state, setState] = useState<DesktopState | null>(null);
  useEffect(() => {
    let off: (() => void) | undefined;
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      off = await listen<DesktopState>(STATE_EVENT, (e) => setState(e.payload));
    });
    return () => off?.();
  }, []);
  useEffect(() => {
    if (state) applyTheme(builtInTheme(state.settings.themeId) ?? defaultTheme());
  }, [state?.settings.themeId]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

function send(action: DesktopCommand) {
  void import('@tauri-apps/api/event').then(({ emitTo }) =>
    emitTo('main', COMMAND_EVENT, { action }),
  );
}

function transparentPage() {
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
}

const btn =
  'grid h-8 w-8 place-items-center rounded-full text-white/80 hover:bg-white/10 hover:text-white';

/** Always-on-top mini player (frameless, rounded, draggable; compact ↔ expanded with the queue). */
export function MiniPlayerWindow() {
  const s = useDesktopState();
  const [expanded, setExpanded] = useState(false);
  useEffect(transparentPage, []);
  const toggleExpand = async () => {
    const { getCurrentWindow, LogicalSize } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setSize(new LogicalSize(340, expanded ? 110 : 300));
    setExpanded(!expanded);
  };
  // Show the other app's track while Boost mode is on.
  const other = s?.boostOn && s.smtc ? s.smtc : null;
  const title = other ? other.title : (s?.title ?? 'Nothing playing');
  const artist = other ? `${other.artist} · ${other.app}` : (s?.artist ?? 'Tuneshift');
  const art = other ? other.thumbnail : s?.artwork;
  const playing = other ? other.playing : Boolean(s?.playing);
  const pct = s && s.duration ? (s.position / s.duration) * 100 : 0;
  return (
    <div className="h-screen w-screen p-1" style={{ opacity: s?.settings.miniOpacity ?? 0.96 }}>
      <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#0d0b14]/95 text-white shadow-2xl">
        <div className="flex items-center gap-2 p-2" data-tauri-drag-region>
          {art ? (
            <img
              src={art}
              alt=""
              className="pointer-events-none h-14 w-14 rounded-xl object-cover"
            />
          ) : (
            <div className="h-14 w-14 rounded-xl bg-hero" data-tauri-drag-region />
          )}
          <div className="min-w-0 flex-1" data-tauri-drag-region>
            <div className="truncate text-sm font-bold" data-tauri-drag-region>
              {title}
            </div>
            <div className="truncate text-xs text-white/70" data-tauri-drag-region>
              {artist}
            </div>
            {!other && s?.preset && (
              <span className="mt-0.5 inline-block rounded-full bg-hero px-2 text-[10px] font-bold">
                {s.preset}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5">
            <button
              type="button"
              className={btn}
              aria-label="Hide mini player"
              onClick={() =>
                void tauriInvoke('set_window_visible', { label: 'mini', visible: false })
              }
            >
              <X size={14} />
            </button>
            <button
              type="button"
              className={btn}
              aria-label="Open Tuneshift"
              onClick={() => send('show-main')}
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
        {!other && (
          <div
            className="mx-2 h-1 overflow-hidden rounded-full bg-white/15"
            title={s ? `${formatDuration(s.position)} / ${formatDuration(s.duration)}` : ''}
          >
            <div className="h-full bg-hero" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="flex items-center justify-between px-1.5 py-1">
          {!other && (
            <button
              type="button"
              className={btn}
              aria-label={s?.liked ? 'Unlike' : 'Like'}
              onClick={() => send('like')}
            >
              <Heart size={15} fill={s?.liked ? 'currentColor' : 'none'} />
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              className={btn}
              aria-label="Previous"
              onClick={() => send(other ? 'smtc:previous' : 'prev')}
            >
              <SkipBack size={16} fill="currentColor" />
            </button>
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-black"
              aria-label={playing ? 'Pause' : 'Play'}
              onClick={() => send(other ? 'smtc:toggle' : 'play')}
            >
              {playing ? (
                <Pause size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className={btn}
              aria-label="Next"
              onClick={() => send(other ? 'smtc:next' : 'next')}
            >
              <SkipForward size={16} fill="currentColor" />
            </button>
          </div>
          <div className="flex items-center">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" className={btn} aria-label="Sound preset">
                  <Sparkles size={15} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="z-50 rounded-xl border border-white/10 bg-[#15121f] p-1 text-sm text-white shadow-xl"
                  sideOffset={4}
                >
                  {SOUND_PRESETS.slice(0, 8).map((p) => (
                    <DropdownMenu.Item
                      key={p.id}
                      className={cn(
                        'cursor-pointer rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-white/10',
                        s?.preset === p.name && 'font-bold',
                      )}
                      onSelect={() => send(`preset:${p.id}`)}
                    >
                      {p.name}
                    </DropdownMenu.Item>
                  ))}
                  <DropdownMenu.Separator className="my-1 h-px bg-white/10" />
                  {(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const).map((c) => (
                    <DropdownMenu.Item
                      key={c}
                      className="cursor-pointer rounded-lg px-2.5 py-1.5 outline-none data-[highlighted]:bg-white/10"
                      onSelect={() => void tauriInvoke('mini_snap', { corner: c })}
                    >
                      Snap {c.replace('-', ' ')}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              type="button"
              className={btn}
              aria-label={expanded ? 'Collapse' : 'Show queue'}
              onClick={() => void toggleExpand()}
            >
              {expanded ? <ChevronsUp size={15} /> : <ChevronsDown size={15} />}
            </button>
          </div>
        </div>
        {expanded && (
          <ol className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-2 text-xs">
            <li className="text-[10px] font-bold uppercase text-white/50">Up next</li>
            {s?.upNext.length ? (
              s.upNext.map((t, i) => (
                <li key={i} className="truncate">
                  <span className="font-semibold">{t.title}</span>{' '}
                  <span className="text-white/60">· {t.artist}</span>
                </li>
              ))
            ) : (
              <li className="text-white/60">Nothing queued</li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}

/**
 * Game overlay pill (click-through, never focused). Visibility is done with CSS only — the
 * window itself stays shown so Windows never moves focus to it (spec §11.2).
 */
export function OverlayWindow() {
  const s = useDesktopState();
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(transparentPage, []);
  const other = s?.boostOn && s.smtc ? s.smtc : null;
  const key = other ? `${other.app}|${other.title}` : (s?.trackKey ?? '') + (s?.preset ?? '');
  useEffect(() => {
    if (!s) return;
    const mode = s.settings.overlayMode;
    if (mode === 'off' || (!s.title && !other)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    if (mode === 'change')
      timer.current = setTimeout(() => setVisible(false), s.settings.overlaySeconds * 1000);
  }, [key, s?.settings.overlayMode, s?.settings.overlaySeconds]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = other ? other.title : s?.title;
  const artist = other ? other.artist : s?.artist;
  const art = other ? other.thumbnail : s?.artwork;
  return (
    <div className="flex h-screen w-screen items-start justify-center p-2">
      <div
        className={cn(
          'flex max-w-full items-center gap-3 rounded-full border border-white/15 bg-black/70 py-1.5 pl-1.5 pr-4 text-white shadow-2xl backdrop-blur-md transition-all duration-500',
          visible ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0',
        )}
      >
        {art ? (
          <img src={art} alt="" className="h-11 w-11 rounded-full object-cover" />
        ) : (
          <div className="h-11 w-11 rounded-full bg-hero" />
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{title}</div>
          <div className="flex items-center gap-1.5 truncate text-xs text-white/75">
            <span className="truncate">{artist}</span>
            <span className="text-white/40">·</span>
            <span className="font-semibold text-white/90">
              {other ? `${other.app} + Boost` : 'Tuneshift'}
            </span>
          </div>
        </div>
        {s?.preset && (
          <span className="shrink-0 rounded-full bg-hero px-2.5 py-0.5 text-[11px] font-bold">
            {s.preset}
          </span>
        )}
      </div>
    </div>
  );
}
