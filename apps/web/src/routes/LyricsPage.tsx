import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '@tuneshift/ui';
import { LyricsUnavailable, LyricsView } from '../components/player/LyricsView';
import { SeekBar, TransportButtons } from '../components/player/PlayerControls';
import { usePlayer } from '../state/player';

/** Full-screen lyrics mode (spec §7). */
export function LyricsPage() {
  const current = usePlayer((s) => s.current);
  const nav = useNavigate();
  return (
    <div className="flex h-[calc(100vh-14rem)] min-h-[420px] flex-col gap-4 md:h-[calc(100vh-11rem)]">
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={() => void nav(-1)}>
          <ChevronLeft />
        </IconButton>
        <div className="min-w-0">
          <h1 className="truncate font-display text-xl font-bold">{current?.title ?? 'Lyrics'}</h1>
          <p className="truncate text-sm text-muted">{current?.artist}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        {current ? <LyricsView track={current} big /> : <LyricsUnavailable />}
      </div>
      <div className="space-y-2 md:hidden">
        <SeekBar />
        <TransportButtons />
      </div>
    </div>
  );
}
