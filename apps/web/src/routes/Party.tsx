import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Copy, Crown, LogOut, PartyPopper, Send, User } from 'lucide-react';
import { Badge, Button, cn } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Artwork, EmptyState, PageHeader, SectionHeader } from '../components/common';
import { AccountPanel } from '../components/social/Account';
import { PlayPauseButton, SeekBar } from '../components/player/PlayerControls';
import { useAuth } from '../state/auth';
import { usePlayer } from '../state/player';
import {
  createParty,
  isController,
  joinParty,
  leaveParty,
  passControl,
  sendChat,
  sendReaction,
  useParty,
} from '../lib/party';
import { publicSiteUrl } from '../env';

const EMOJI = ['🔥', '😍', '💃', '🤯', '😂', '👏'];

export function Party() {
  const { code: routeCode } = useParams();
  const nav = useNavigate();
  const status = useAuth((s) => s.status);
  const uid = useAuth((s) => s.session?.user.id);
  const party = useParty();
  const current = usePlayer((s) => s.current);
  const [joinCode, setJoinCode] = useState(routeCode ?? '');
  const [name, setName] = useState('Listening party');
  const [text, setText] = useState('');
  const chatRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    if (
      status === 'signed-in' &&
      routeCode &&
      party.code !== routeCode &&
      party.status === 'idle'
    ) {
      void joinParty(routeCode).catch((e: unknown) =>
        toast.error(e instanceof Error ? e.message : 'Could not join'),
      );
    }
  }, [status, routeCode, party.code, party.status]);
  useEffect(
    () => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }),
    [party.chat.length],
  );
  if (status !== 'signed-in') {
    return (
      <div>
        <PageHeader
          title="Listening party"
          subtitle="Play the same song in sync with friends — chat and react live."
        />
        <AccountPanel />
      </div>
    );
  }
  if (!party.code || party.status === 'idle') {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader
          title="Listening party"
          subtitle="Only Audius and Jamendo songs can be played in a party (local files stay on your device)."
        />
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <SectionHeader title="Host a party" />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Party name"
            className="h-10 w-full rounded-ctl border border-line bg-bg px-3 text-sm"
          />
          <Button
            variant="primary"
            icon={<PartyPopper size={16} />}
            onClick={() =>
              void createParty(name)
                .then((c) => nav(`/party/${c}`, { replace: true }))
                .catch((e: unknown) =>
                  toast.error(e instanceof Error ? e.message : 'Could not create party'),
                )
            }
          >
            Start party
          </Button>
        </section>
        <section className="space-y-3 rounded-card border border-line bg-surface p-4">
          <SectionHeader title="Join with a code" />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void joinParty(joinCode)
                .then(() => nav(`/party/${joinCode.trim().toLowerCase()}`, { replace: true }))
                .catch((err: unknown) =>
                  toast.error(err instanceof Error ? err.message : 'Could not join'),
                );
            }}
          >
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="party code"
              aria-label="Party code"
              className="h-10 flex-1 rounded-ctl border border-line bg-bg px-3 font-mono text-sm"
            />
            <Button type="submit" disabled={joinCode.trim().length < 6}>
              Join
            </Button>
          </form>
        </section>
      </div>
    );
  }
  const control = isController();
  const shareUrl = `${publicSiteUrl()}party/${party.code}`;
  const remoteTrack = party.remote?.track;
  return (
    <div className="space-y-6">
      <PageHeader
        title={party.name}
        subtitle={
          <span>
            Code <span className="font-mono font-bold text-fg">{party.code}</span> ·{' '}
            {party.members.length} listening
          </span>
        }
      >
        <Button
          icon={<Copy size={15} />}
          onClick={() =>
            void navigator.clipboard
              .writeText(shareUrl)
              .then(() => toast.success('Invite link copied'))
          }
        >
          Invite
        </Button>
        <Button
          variant="ghost"
          icon={<LogOut size={15} />}
          onClick={() => {
            void leaveParty();
            void nav('/party', { replace: true });
          }}
        >
          Leave
        </Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="relative space-y-4 overflow-hidden rounded-card border border-line bg-surface p-5">
          <div className="flex items-center gap-4">
            <Artwork
              art={(control ? current : remoteTrack)?.artwork}
              alt=""
              size="large"
              className="h-28 w-28"
              seed={(control ? current : remoteTrack)?.title}
            />
            <div className="min-w-0">
              <Badge tone={control ? 'accent' : 'muted'}>
                {control ? 'You control playback' : 'Following the host'}
              </Badge>
              <div className="mt-1 truncate font-display text-2xl font-extrabold">
                {(control ? current : remoteTrack)?.title ?? 'Nothing yet'}
              </div>
              <div className="truncate text-muted">{(control ? current : remoteTrack)?.artist}</div>
              {!control && (
                <div className="mt-1 text-xs text-muted">
                  Sync:{' '}
                  {Math.abs(party.driftMs) <= 300
                    ? 'in sync'
                    : `${party.driftMs > 0 ? 'ahead' : 'behind'} by ${(Math.abs(party.driftMs) / 1000).toFixed(1)} s — catching up`}
                </div>
              )}
            </div>
          </div>
          {control ? (
            <>
              <SeekBar />
              <div className="flex items-center gap-3">
                <PlayPauseButton />
                <p className="text-sm text-muted">
                  Play any Audius or Jamendo song — everyone follows. Use “Add to queue” on songs to
                  line them up.
                </p>
              </div>
              {current && current.source === 'local' && (
                <p className="text-sm text-amber-300">
                  Local files aren't shared with the party — pick an Audius/Jamendo song.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">
              Playback follows{' '}
              {party.members.find((m) => m.userId === party.controller)?.name ?? 'the host'}.
            </p>
          )}
          <div className="flex flex-wrap gap-2" role="group" aria-label="React">
            {EMOJI.map((e) => (
              <button
                key={e}
                type="button"
                className="rounded-full bg-surface-hover px-3 py-1.5 text-xl transition hover:scale-110"
                onClick={() => sendReaction(e)}
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div aria-live="polite" className="pointer-events-none absolute inset-x-0 bottom-0 h-40">
            {party.reactions.map((r, i) => (
              <span
                key={r.id}
                className="absolute bottom-2 animate-bounce text-4xl"
                style={{ left: `${10 + ((i * 17) % 80)}%` }}
                title={r.from}
              >
                {r.emoji}
              </span>
            ))}
          </div>
        </section>
        <aside className="flex flex-col gap-4">
          <section className="rounded-card border border-line bg-surface p-4">
            <SectionHeader title="People" />
            <ul className="space-y-2">
              {party.members.map((m) => (
                <li key={m.userId} className="flex items-center gap-2 text-sm">
                  <span className="grid h-8 w-8 place-items-center overflow-hidden rounded-full bg-surface-hover">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User size={14} />
                    )}
                  </span>
                  <span className="flex-1 truncate">
                    {m.name}
                    {m.userId === uid && ' (you)'}
                  </span>
                  {m.userId === party.controller ? (
                    <Crown size={15} className="text-amber-300" aria-label="In control" />
                  ) : (
                    control && (
                      <Button size="sm" variant="ghost" onClick={() => passControl(m.userId)}>
                        Pass control
                      </Button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
          <section className="flex min-h-[300px] flex-1 flex-col rounded-card border border-line bg-surface p-4">
            <SectionHeader title="Chat" />
            <ol
              ref={chatRef}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto text-sm"
              aria-live="polite"
            >
              {party.chat.length === 0 && <li className="text-muted">Say hi 👋</li>}
              {party.chat.map((m) => (
                <li key={m.id} className={cn(m.from === uid && 'text-right')}>
                  <span className="text-xs font-semibold text-muted">{m.name}</span>
                  <p className="break-words">{m.text}</p>
                </li>
              ))}
            </ol>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                sendChat(text);
                setText('');
              }}
            >
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={300}
                placeholder="Message"
                aria-label="Chat message"
                className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-3 text-sm"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!text.trim()}
                aria-label="Send message"
                icon={<Send size={15} />}
              />
            </form>
          </section>
        </aside>
      </div>
      {!remoteTrack && !control && <EmptyState title="Waiting for the host to play something" />}
    </div>
  );
}
