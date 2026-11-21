import { Headphones, Sparkles, User } from 'lucide-react';
import type { Track } from '@tuneshift/core';
import { Badge, Button } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Artwork, SectionHeader } from '../common';
import { useActivity, type Activity } from '../../lib/activity';
import { useAuth } from '../../state/auth';
import { player } from '../../player/controller';

export function listenAlong(a: Activity): void {
  if (!a.track || (a.track.source !== 'audius' && a.track.source !== 'jamendo')) {
    toast.error(`${a.displayName || a.username} is playing a local file — that can't be shared.`);
    return;
  }
  const t = a.track as Track;
  const behind = a.playing ? (Date.now() - a.at) / 1000 : 0;
  void player
    .playTracks([t], 0, {
      name: `Listening along with ${a.displayName || a.username}`,
      kind: 'friend',
    })
    .then(() => {
      const pos = a.positionSec + behind * (a.sound?.speed ?? 1);
      if (pos > 2) player.seek(pos);
    });
}

export function copySound(a: Activity): void {
  if (!a.sound) return;
  player.applySound(a.sound, null, `${a.displayName || a.username}'s sound`);
  toast.success(`Using ${a.displayName || a.username}'s sound: ${a.preset}`);
}

export function ActivityCard({ a }: { a: Activity }) {
  const fresh = Date.now() - a.at < 10 * 60_000;
  return (
    <div
      role="listitem"
      className="flex w-72 shrink-0 flex-col gap-3 rounded-card border border-line bg-surface p-3"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-surface-hover">
          {a.avatarUrl ? (
            <img src={a.avatarUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <User size={16} />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {a.displayName || a.username}
        </span>
        {a.playing && fresh && <Badge tone="ok">Live</Badge>}
      </div>
      {a.track ? (
        <div className="flex items-center gap-2">
          <Artwork
            art={a.track.artwork}
            alt=""
            size="small"
            className="h-12 w-12"
            seed={a.track.title}
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{a.track.title}</div>
            <div className="truncate text-xs text-muted">{a.track.artist}</div>
            <Badge tone="accent" className="mt-1">
              {a.preset}
            </Badge>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Not playing anything</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          icon={<Headphones size={14} />}
          disabled={!a.track}
          onClick={() => listenAlong(a)}
        >
          Listen along
        </Button>
        <Button
          size="sm"
          icon={<Sparkles size={14} />}
          disabled={!a.sound}
          onClick={() => copySound(a)}
        >
          Copy sound
        </Button>
      </div>
    </div>
  );
}

/** Home section "Friends are listening" — only when signed in with friends online. */
export function FriendsShelf() {
  const status = useAuth((s) => s.status);
  const activity = useActivity((s) => s.activity);
  const list = Object.values(activity).sort((a, b) => b.at - a.at);
  if (status !== 'signed-in' || !list.length) return null;
  return (
    <section>
      <SectionHeader title="Friends are listening" />
      <div
        role="list"
        className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 md:-mx-6 md:px-6"
      >
        {list.map((a) => (
          <ActivityCard key={a.userId} a={a} />
        ))}
      </div>
    </section>
  );
}
