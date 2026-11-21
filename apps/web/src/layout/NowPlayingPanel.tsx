import { lazy, Suspense } from 'react';
import { Tabs } from 'radix-ui';
import { Link, useNavigate } from 'react-router';
import { Maximize2, SlidersHorizontal, WandSparkles, X } from 'lucide-react';
import { Button, IconButton } from '@tuneshift/ui';
import {
  Artwork,
  Attribution,
  CapabilityBadge,
  EmptyState,
  SourceBadge,
} from '../components/common';
import { LikeButton } from '../components/LikeButton';
import { PresetBadge, PresetChips } from '../components/player/PlayerControls';
import { VisualizerCanvas } from '../components/player/VisualizerCanvas';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { useUi, type NowTab } from '../state/ui';

const QueueView = lazy(async () => ({
  default: (await import('../components/player/QueueView')).QueueView,
}));

const LyricsView = lazy(async () => ({
  default: (await import('../components/player/LyricsView')).LyricsView,
}));

const tabCls =
  'flex-1 rounded-full px-3 py-1.5 text-xs font-semibold text-muted transition data-[state=active]:bg-surface-hover data-[state=active]:text-fg';

/** Right-hand now-playing panel (desktop widths, spec §7). */
export function NowPlayingPanel() {
  const current = usePlayer((s) => s.current);
  const mode = usePlayer((s) => s.mode);
  const tab = useUi((s) => s.nowTab);
  const setUi = useUi((s) => s.set);
  const showViz = useSettings((s) => s.showVisualizer);
  const vizMode = useSettings((s) => s.visualizer);
  const nav = useNavigate();
  return (
    <aside
      aria-label="Now playing"
      className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-panel bg-bg-elevated p-4"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">Now playing</h2>
        <div className="flex gap-1">
          <IconButton
            label="Open full-screen player"
            size="sm"
            onClick={() => setUi({ fullPlayer: true })}
          >
            <Maximize2 size={16} />
          </IconButton>
          <IconButton
            label="Hide now-playing panel"
            size="sm"
            onClick={() => setUi({ nowPanelOpen: false })}
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>
      {current ? (
        <>
          <div className="relative overflow-hidden rounded-card">
            <Artwork
              art={current.artwork}
              alt={`${current.title} cover art`}
              size="large"
              className="aspect-square w-full"
              rounded="rounded-card"
              seed={current.title}
            />
            {showViz && mode === 'fx' && vizMode !== 'glow' && (
              <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent">
                <VisualizerCanvas mode={vizMode === 'radial' ? 'bars' : vizMode} />
              </div>
            )}
          </div>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg font-bold">{current.title}</div>
              <div className="flex items-center gap-1.5 text-sm text-muted">
                <SourceBadge source={current.source} />
                {current.artistId && current.source !== 'local' ? (
                  <Link
                    className="truncate hover:text-fg hover:underline"
                    to={`/artist/${current.source}/${encodeURIComponent(current.artistId)}`}
                  >
                    {current.artist}
                  </Link>
                ) : (
                  <span className="truncate">{current.artist}</span>
                )}
              </div>
            </div>
            <LikeButton track={current} size="md" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PresetBadge />
            <CapabilityBadge track={current} mode={mode} />
          </div>
          <PresetChips />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={<SlidersHorizontal size={14} />}
              onClick={() => void nav('/lab')}
              className="flex-1"
            >
              Open Sound Lab
            </Button>
            <Button
              size="sm"
              variant="outline"
              icon={<WandSparkles size={14} />}
              onClick={() => setUi({ versionsFor: current })}
            >
              Versions
            </Button>
          </div>
          <Tabs.Root
            value={tab}
            onValueChange={(v) => setUi({ nowTab: v as NowTab })}
            className="flex min-h-0 flex-1 flex-col"
          >
            <Tabs.List
              aria-label="Now playing details"
              className="flex gap-1 rounded-full bg-surface p-1"
            >
              <Tabs.Trigger value="queue" className={tabCls}>
                Queue
              </Tabs.Trigger>
              <Tabs.Trigger value="lyrics" className={tabCls}>
                Lyrics
              </Tabs.Trigger>
              <Tabs.Trigger value="info" className={tabCls}>
                Info
              </Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="queue" className="min-h-0 flex-1 overflow-y-auto pt-2">
              <Suspense fallback={<p className="text-sm text-muted">Loading queue…</p>}>
                <QueueView />
              </Suspense>
            </Tabs.Content>
            <Tabs.Content value="lyrics" className="min-h-0 flex-1 overflow-hidden pt-2">
              <Suspense fallback={<p className="text-sm text-muted">Loading lyrics…</p>}>
                <LyricsView track={current} />
              </Suspense>
            </Tabs.Content>
            <Tabs.Content value="info" className="min-h-0 flex-1 overflow-y-auto pt-2 text-sm">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                {current.album && (
                  <>
                    <dt className="text-muted">Album</dt>
                    <dd className="truncate">{current.album}</dd>
                  </>
                )}
                {current.genre && (
                  <>
                    <dt className="text-muted">Genre</dt>
                    <dd>{current.genre}</dd>
                  </>
                )}
                {current.mood && (
                  <>
                    <dt className="text-muted">Mood</dt>
                    <dd>{current.mood}</dd>
                  </>
                )}
                <dt className="text-muted">Source</dt>
                <dd>
                  <Attribution track={current} />
                </dd>
              </dl>
            </Tabs.Content>
          </Tabs.Root>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            title="Nothing playing yet"
            body="Pick a demo loop on Home or search Audius. Your queue, lyrics and track info show up here."
          />
        </div>
      )}
    </aside>
  );
}
