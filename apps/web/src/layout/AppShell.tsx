import { useEffect, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { Toaster, toast } from 'sonner';
import { FolderOpen, Minimize2 } from 'lucide-react';
import { applyTheme, Button, cn, extractAccent, Petals, TooltipProvider } from '@tuneshift/ui';
import { useArtworkUrl } from '../components/common';
import { Sidebar, MobileNav, MiniBar } from './Navigation';
import { TransportBar } from './TransportBar';
import { NowPlayingPanel } from './NowPlayingPanel';
import { FullPlayer } from './FullPlayer';
import { GlobalKeys } from './GlobalKeys';
import { GlobalDialogs } from './GlobalDialogs';
import { Artwork } from '../components/common';
import { PresetChips, SeekBar, TransportButtons } from '../components/player/PlayerControls';
import { VisualizerCanvas } from '../components/player/VisualizerCanvas';
import { player } from '../player/controller';
import { usePlayer } from '../state/player';
import { prefersReducedMotion, useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { useActiveTheme } from '../state/theme';
import { importItems, type ImportItem } from '../lib/localFiles';
import { db } from '../db/db';
import { AskHost } from '../components/Ask';
import { onPlayerEvent } from '../player/events';

/** Applies the active theme (+ adaptive accent, text scale, motion) whenever inputs change. */
function ThemeController() {
  const playlistTheme = usePlayer((s) =>
    s.queue.meta.kind === 'playlist' ? s.queue.meta.id : undefined,
  );
  const [plThemeId, setPlThemeId] = useState<string | null>(null);
  useEffect(() => {
    if (!playlistTheme) return setPlThemeId(null);
    void db.playlists.get(playlistTheme).then((p) => setPlThemeId(p?.themeId ?? null));
  }, [playlistTheme]);
  const theme = useActiveTheme(plThemeId);
  const textScale = useSettings((s) => s.textScale);
  const motion = useSettings((s) => s.motion);
  const current = usePlayer((s) => s.current);
  const art = useArtworkUrl(current?.artwork, 'small');
  const [accent, setAccent] = useState<string | undefined>();
  useEffect(() => {
    if (!theme.adaptiveAccent || !art) return setAccent(undefined);
    let live = true;
    void extractAccent(art, theme.tokens.bg).then((a) => live && setAccent(a ?? undefined));
    return () => {
      live = false;
    };
  }, [art, theme.adaptiveAccent, theme.tokens.bg]);
  useEffect(() => {
    applyTheme(theme, { accentOverride: accent, textScale, reducedMotion: prefersReducedMotion() });
  }, [theme, accent, textScale, motion]);
  return theme.petals && !prefersReducedMotion() ? <Petals /> : null;
}

/** Live region for screen-reader announcements (track changes). */
function Announcer() {
  const text = usePlayer((s) => s.announcement);
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

function TapToStart() {
  const needs = usePlayer((s) => s.needsGesture);
  if (!needs) return null;
  return (
    <div className="fixed inset-x-0 bottom-28 z-40 flex justify-center px-4 md:bottom-24">
      <Button
        variant="primary"
        size="lg"
        onClick={() => void player.unlockFromGesture().then(() => player.play())}
        data-testid="tap-to-start"
      >
        Tap to start audio
      </Button>
    </div>
  );
}

/** Drop audio files or folders anywhere to add them (handles kept where the browser allows). */
function DropZone() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const dt = e.dataTransfer;
      if (!dt) return;
      const items: ImportItem[] = [];
      const entries = Array.from(dt.items);
      for (const it of entries) {
        const withHandle = it as DataTransferItem & {
          getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
        };
        const file = it.getAsFile();
        if (!file) continue;
        let handle: FileSystemFileHandle | undefined;
        try {
          const h = await withHandle.getAsFileSystemHandle?.();
          if (h?.kind === 'file') handle = h as FileSystemFileHandle;
        } catch {
          // not supported → OPFS copy
        }
        items.push({ file, handle });
      }
      if (!items.length) return;
      const id = toast.loading(`Adding ${items.length} file${items.length > 1 ? 's' : ''}…`);
      const res = await importItems(items, (d, t) =>
        toast.loading(`Adding files… ${d}/${t}`, { id }),
      );
      toast.success(
        `Added ${res.added.length} song${res.added.length === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} already in library)` : ''}`,
        {
          id,
          description: res.failed.length ? `${res.failed.length} couldn't be read` : undefined,
          action: res.added.length
            ? {
                label: 'Play',
                onClick: () =>
                  void player.playTracks(res.added, 0, { name: 'Just added', kind: 'local' }),
              }
            : undefined,
        },
      );
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', overFn);
    const dropFn = (e: DragEvent) => void drop(e);
    window.addEventListener('drop', dropFn);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', overFn);
      window.removeEventListener('drop', dropFn);
    };
  }, []);
  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-panel border-2 border-dashed border-accent bg-bg-elevated px-10 py-8 text-center">
        <FolderOpen size={40} className="text-accent-text" />
        <p className="font-display text-xl font-bold">Drop to add to your library</p>
        <p className="text-sm text-muted">MP3, M4A, AAC, FLAC, WAV, OGG, Opus</p>
      </div>
    </div>
  );
}

function FocusLayout() {
  const current = usePlayer((s) => s.current);
  const setSettings = useSettings((s) => s.set);
  const vizMode = useSettings((s) => s.visualizer);
  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 overflow-hidden p-6">
      <Button
        className="absolute right-4 top-4"
        size="sm"
        variant="ghost"
        icon={<Minimize2 size={14} />}
        onClick={() => setSettings({ layout: 'classic' })}
      >
        Exit focus
      </Button>
      <div className="relative w-full max-w-md">
        <Artwork
          art={current?.artwork}
          alt={current ? `${current.title} cover art` : 'Nothing playing'}
          size="large"
          className="aspect-square w-full shadow-2xl"
          rounded="rounded-panel"
          seed={current?.title}
        />
        <div className="absolute -inset-[10%]">
          <VisualizerCanvas mode={vizMode === 'glow' || vizMode === 'bars' ? 'radial' : vizMode} />
        </div>
      </div>
      <div className="text-center">
        <div className="font-display text-3xl font-extrabold">
          {current?.title ?? 'Nothing playing'}
        </div>
        <div className="text-muted">{current?.artist}</div>
      </div>
      <div className="w-full max-w-xl space-y-3">
        <SeekBar />
        <TransportButtons size="lg" />
        <PresetChips className="justify-center" />
      </div>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const layout = useSettings((s) => s.layout);
  const panelOpen = useUi((s) => s.nowPanelOpen);
  const location = useLocation();
  const hideFrame = location.pathname.startsWith('/onboarding');
  if (hideFrame) return <main className="h-full overflow-y-auto">{children}</main>;
  if (layout === 'focus') return <FocusLayout />;
  const compact = layout === 'compact';
  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2 p-0 md:p-2">
        <div className="hidden md:flex">
          <Sidebar compact={compact} />
        </div>
        <main
          id="main-scroll"
          tabIndex={-1}
          className="relative min-w-0 flex-1 overflow-y-auto bg-bg-elevated/60 md:rounded-panel"
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-hero opacity-[calc(0.18+var(--ambient)*0.25)]"
            aria-hidden="true"
            style={{ maskImage: 'linear-gradient(to bottom, black, transparent)' }}
          />
          <div
            className={cn(
              'relative mx-auto px-4 pb-40 pt-5 md:px-6 md:pb-10',
              compact ? 'max-w-6xl' : 'max-w-7xl',
            )}
          >
            {children}
          </div>
        </main>
        {panelOpen && !compact && (
          <div className="hidden w-[330px] shrink-0 xl:flex">
            <NowPlayingPanel />
          </div>
        )}
      </div>
      <div className="hidden md:block">
        <TransportBar />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 md:hidden">
        <MiniBar />
        <MobileNav />
      </div>
    </div>
  );
}

export function AppShell() {
  const nav = useNavigate();
  const onboarded = useSettings((s) => s.onboarded);
  const location = useLocation();
  useEffect(() => {
    if (
      !onboarded &&
      !location.pathname.startsWith('/onboarding') &&
      !location.pathname.startsWith('/s/')
    )
      void nav('/onboarding', { replace: true });
  }, [onboarded, location.pathname, nav]);
  useEffect(() => {
    document.getElementById('main-scroll')?.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(
    () =>
      onPlayerEvent('track', () => {
        if (useSettings.getState().lyricsAutoOpen)
          useUi.getState().set({ nowPanelOpen: true, nowTab: 'lyrics' });
      }),
    [],
  );
  return (
    <TooltipProvider>
      <ThemeController />
      <a
        href="#main-scroll"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-ctl focus:bg-bg-elevated focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Frame>
        <Outlet />
      </Frame>
      <FullPlayer />
      <GlobalKeys />
      <GlobalDialogs />
      <DropZone />
      <TapToStart />
      <Announcer />
      <AskHost />
      <Toaster
        theme="dark"
        position="top-center"
        richColors
        closeButton
        toastOptions={{ className: 'font-body' }}
      />
    </TooltipProvider>
  );
}
