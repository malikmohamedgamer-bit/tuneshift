import { Reorder } from 'motion/react';
import { GripVertical, ListX, Save, X } from 'lucide-react';
import { upcomingContext, type QueueItem, type QueueSection, type Track } from '@tuneshift/core';
import { Button, IconButton } from '@tuneshift/ui';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Artwork, EmptyState, SourceBadge } from '../common';
import { player } from '../../player/controller';
import { usePlayer } from '../../state/player';
import { createPlaylist } from '../../db/library';

function QueueRow({
  item,
  track,
  index,
  section,
  total,
}: {
  item: QueueItem;
  track?: Track;
  index: number;
  section: QueueSection;
  total: number;
}) {
  const title = track?.title ?? 'Unavailable song';
  return (
    <Reorder.Item
      value={item}
      id={item.uid}
      className="group flex items-center gap-2 rounded-ctl bg-transparent px-1 py-1 hover:bg-surface-hover"
      data-testid={`queue-${section}-item`}
      onKeyDown={(e) => {
        // Keyboard reordering: Alt+↑/↓.
        if (e.altKey && e.key === 'ArrowUp' && index > 0)
          player.moveInQueue(section, index, index - 1);
        if (e.altKey && e.key === 'ArrowDown' && index < total - 1)
          player.moveInQueue(section, index, index + 1);
      }}
      tabIndex={0}
      aria-label={`${title}, position ${index + 1} of ${total}. Alt plus arrow keys to move.`}
    >
      <GripVertical size={14} className="shrink-0 cursor-grab text-muted" aria-hidden="true" />
      <Artwork art={track?.artwork} alt="" size="small" className="h-9 w-9" seed={title} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="flex items-center gap-1 truncate text-xs text-muted">
          {track && <SourceBadge source={track.source} />}
          <span className="truncate">{track?.artist}</span>
        </div>
      </div>
      <IconButton
        label={`Remove ${title} from queue`}
        size="sm"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        onClick={() => player.removeFromQueue(item.uid)}
      >
        <X size={15} />
      </IconButton>
    </Reorder.Item>
  );
}

function Section({
  title,
  items,
  section,
  onClear,
}: {
  title: string;
  items: QueueItem[];
  section: QueueSection;
  onClear?: () => void;
}) {
  const tracks = usePlayer((s) => s.tracks);
  if (!items.length) return null;
  return (
    <section className="mt-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{title}</h3>
        {onClear && (
          <button type="button" className="text-xs text-muted hover:text-fg" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <Reorder.Group
        axis="y"
        values={items}
        onReorder={(next: QueueItem[]) =>
          player.reorderSection(
            section,
            next.map((i) => i.uid),
          )
        }
        className="flex flex-col"
      >
        {items.map((it, i) => (
          <QueueRow
            key={it.uid}
            item={it}
            track={tracks[it.trackKey]}
            index={i}
            section={section}
            total={items.length}
          />
        ))}
      </Reorder.Group>
    </section>
  );
}

export function QueueView() {
  const queue = usePlayer((s) => s.queue);
  const tracks = usePlayer((s) => s.tracks);
  const current = usePlayer((s) => s.current);
  const nav = useNavigate();
  const upcoming = upcomingContext(queue);
  const empty = !current && !queue.manual.length && !upcoming.length;
  const save = async () => {
    const keys = [
      current?.key,
      ...queue.manual.map((i) => i.trackKey),
      ...upcoming.map((i) => i.trackKey),
      ...queue.autoplay.map((i) => i.trackKey),
    ].filter((k): k is string => Boolean(k));
    const p = await createPlaylist(queue.meta.name ? `${queue.meta.name} (queue)` : 'Saved queue', [
      ...new Set(keys),
    ]);
    toast.success(`Saved the queue as “${p.name}”`, {
      action: { label: 'Open', onClick: () => void nav(`/playlist/${p.id}`) },
    });
  };
  if (empty) {
    return (
      <EmptyState
        title="Your queue is empty"
        body="Play something, or use “Add to queue” on any song."
      />
    );
  }
  return (
    <div data-testid="queue-view">
      {current && (
        <section>
          <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted">
            Now playing
          </h3>
          <div className="flex items-center gap-2 rounded-ctl bg-accent-soft p-2">
            <Artwork
              art={current.artwork}
              alt=""
              size="small"
              className="h-10 w-10"
              seed={current.title}
            />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-accent-text">{current.title}</div>
              <div className="truncate text-xs text-muted">{current.artist}</div>
            </div>
          </div>
        </section>
      )}
      <Section
        title="Next up"
        items={queue.manual}
        section="manual"
        onClear={() => player.clearQueue('manual')}
      />
      <Section
        title={queue.meta.name ? `Next from: ${queue.meta.name}` : 'Next'}
        items={upcoming}
        section="context"
        onClear={() => player.clearQueue('context')}
      />
      <Section
        title="Autoplay — similar songs"
        items={queue.autoplay}
        section="autoplay"
        onClear={() => player.clearQueue('autoplay')}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" icon={<Save size={14} />} onClick={() => void save()}>
          Save as playlist
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<ListX size={14} />}
          onClick={() => player.clearQueue()}
        >
          Clear queue
        </Button>
      </div>
      <p className="sr-only">{Object.keys(tracks).length} songs loaded</p>
    </div>
  );
}
