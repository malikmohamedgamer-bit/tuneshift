import { useEffect, useRef } from 'react';
import { Visualizer, type VisualizerMode } from '@tuneshift/audio';
import { cn } from '@tuneshift/ui';
import { player } from '../../player/controller';
import { prefersReducedMotion } from '../../state/settings';

/** Canvas visualizer bound to the player's analyser (spec §4.7). */
export function VisualizerCanvas({
  mode,
  className,
  glowTarget,
}: {
  mode: VisualizerMode;
  className?: string;
  glowTarget?: HTMLElement | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viz = useRef<Visualizer | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const v = new Visualizer(c, {
      getAnalyser: () =>
        player.engine.outputMode === 'fx' ? (player.engine.chain?.analyser ?? null) : null,
      mode,
      colors: () => {
        const s = getComputedStyle(document.documentElement);
        return [
          s.getPropertyValue('--accent').trim() || '#8b5cf6',
          s.getPropertyValue('--accent-2').trim() || '#ec4899',
        ];
      },
      glowTarget: glowTarget ?? document.documentElement,
      reducedMotion: prefersReducedMotion,
    });
    viz.current = v;
    v.start();
    return () => {
      v.dispose();
      viz.current = null;
    };
  }, [glowTarget, mode]);
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn('pointer-events-none h-full w-full', className)}
    />
  );
}
