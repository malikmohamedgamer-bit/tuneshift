import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ChevronDown, ListMusic, MicVocal, SlidersHorizontal } from 'lucide-react';
import { Button, cn, IconButton, Segmented } from '@tuneshift/ui';
import { Artwork, CapabilityBadge, SourceBadge, useArtworkUrl } from '../components/common';
import { LikeButton } from '../components/LikeButton';
import {
  PresetBadge,
  PresetChips,
  SeekBar,
  TransportButtons,
  VolumeControl,
} from '../components/player/PlayerControls';
import { QueueView } from '../components/player/QueueView';
import { LyricsView } from '../components/player/LyricsView';
import { VisualizerCanvas } from '../components/player/VisualizerCanvas';
import { LoopMenu, SleepMenu } from './TransportBar';
import { player } from '../player/controller';
import { usePlayer } from '../state/player';
import { useSettings, prefersReducedMotion } from '../state/settings';
import { useUi } from '../state/ui';

/**
 * Full-screen now playing (mobile and on demand, spec §7): blurred art background, big artwork
 * (swipe left/right to skip, down to close), preset chips, visualizer, queue and lyrics.
 */
export function FullPlayer() {
  const open = useUi((s) => s.fullPlayer);
  const setUi = useUi((s) => s.set);
  const current = usePlayer((s) => s.current);
  const mode = usePlayer((s) => s.mode);
  const vizMode = useSettings((s) => s.visualizer);
  const showViz = useSettings((s) => s.showVisualizer);
  const [pane, setPane] = useState<'art' | 'lyrics' | 'queue'>('art');
  const bg = useArtworkUrl(current?.artwork, 'large');
  const nav = useNavigate();
  const close = () => setUi({ fullPlayer: false });
  let touch = { x: 0, y: 0 };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Full-screen player"
          className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-bg"
          initial={prefersReducedMotion() ? false : { y: '100%' }}
          animate={{ y: 0 }}
          exit={prefersReducedMotion() ? { opacity: 0 } : { y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 260 }}
          onKeyDown={(e) => e.key === 'Escape' && close()}
        >
          {bg && (
            <img
              src={bg}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl"
            />
          )}
          <div
            className="absolute inset-0 bg-gradient-to-b from-black/20 via-bg/70 to-bg"
            aria-hidden="true"
          />
          {showViz && vizMode === 'glow' && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-hero opacity-[calc(0.08+var(--ambient)*0.35)] mix-blend-screen"
            />
          )}
          <div className="safe-top relative flex items-center justify-between px-4 py-3">
            <IconButton label="Close full-screen player" onClick={close} autoFocus>
              <ChevronDown size={24} />
            </IconButton>
            <Segmented
              label="View"
              size="sm"
              value={pane}
              onChange={setPane}
              options={[
                { value: 'art', label: 'Player' },
                { value: 'lyrics', label: 'Lyrics' },
                { value: 'queue', label: 'Queue' },
              ]}
            />
            <IconButton
              label="Open Sound Lab"
              onClick={() => {
                close();
                void nav('/lab');
              }}
            >
              <SlidersHorizontal size={20} />
            </IconButton>
          </div>
          {!current ? (
            <p className="relative m-auto text-muted">Nothing is playing.</p>
          ) : (
            <div className="relative mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-4 px-6 pb-6">
              {pane === 'art' && (
                <div
                  className="relative mx-auto aspect-square w-full max-w-[min(70vh,28rem)]"
                  onTouchStart={(e) =>
                    (touch = { x: e.touches[0]?.clientX ?? 0, y: e.touches[0]?.clientY ?? 0 })
                  }
                  onTouchEnd={(e) => {
                    const dx = (e.changedTouches[0]?.clientX ?? 0) - touch.x;
                    const dy = (e.changedTouches[0]?.clientY ?? 0) - touch.y;
                    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy))
                      void (dx < 0 ? player.next() : player.prev());
                    else if (dy > 80) close();
                  }}
                >
                  <Artwork
                    art={current.artwork}
                    alt={`${current.title} cover art`}
                    size="large"
                    className="h-full w-full shadow-2xl"
                    rounded="rounded-panel"
                    seed={current.title}
                  />
                  {showViz && mode === 'fx' && vizMode === 'radial' && (
                    <div className="absolute -inset-[12%]">
                      <VisualizerCanvas mode="radial" />
                    </div>
                  )}
                </div>
              )}
              {pane === 'lyrics' && (
                <div className="min-h-0 flex-1">
                  <LyricsView track={current} big />
                </div>
              )}
              {pane === 'queue' && (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <QueueView />
                </div>
              )}
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-2xl font-extrabold">
                    {current.title}
                  </div>
                  <div className="flex items-center gap-2 text-muted">
                    <SourceBadge source={current.source} />
                    <span className="truncate">{current.artist}</span>
                  </div>
                </div>
                <LikeButton track={current} size="lg" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PresetBadge />
                <CapabilityBadge track={current} mode={mode} />
              </div>
              {showViz &&
                mode === 'fx' &&
                (vizMode === 'bars' || vizMode === 'wave') &&
                pane === 'art' && (
                  <div className="h-12">
                    <VisualizerCanvas mode={vizMode} />
                  </div>
                )}
              <SeekBar />
              <TransportButtons size="xl" />
              <PresetChips />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <LoopMenu />
                  <SleepMenu />
                </div>
                <VolumeControl className="hidden sm:flex" />
                <div className={cn('flex gap-1')}>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<MicVocal size={15} />}
                    onClick={() => setPane(pane === 'lyrics' ? 'art' : 'lyrics')}
                  >
                    Lyrics
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ListMusic size={15} />}
                    onClick={() => setPane(pane === 'queue' ? 'art' : 'queue')}
                  >
                    Queue
                  </Button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
