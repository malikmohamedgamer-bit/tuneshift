import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Check, PartyPopper, Search, User, UserMinus, UserPlus, X } from 'lucide-react';
import { Button, IconButton } from '@tuneshift/ui';
import { toast } from 'sonner';
import { EmptyState, PageHeader, SectionHeader } from '../components/common';
import { AccountPanel } from '../components/social/Account';
import { ActivityCard } from '../components/social/FriendsShelf';
import { useAuth } from '../state/auth';
import { refreshFriends, useActivity } from '../lib/activity';
import { answerFriendRequest, removeFriend, searchUsers, sendFriendRequest } from '../lib/social';

function Avatar({ url }: { url: string | null }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-surface-hover">
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User size={18} />}
    </span>
  );
}

export function Friends() {
  const status = useAuth((s) => s.status);
  const friends = useActivity((s) => s.friends);
  const activity = useActivity((s) => s.activity);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ['user-search', debounced],
    queryFn: () => searchUsers(debounced),
    enabled: status === 'signed-in' && debounced.trim().length >= 2,
  });
  useEffect(() => {
    if (status === 'signed-in') void refreshFriends();
  }, [status]);
  const act = (fn: () => Promise<void>, ok: string) =>
    void fn()
      .then(() => toast.success(ok))
      .then(() => refreshFriends())
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Something went wrong'));
  if (status !== 'signed-in') {
    return (
      <div>
        <PageHeader
          title="Friends"
          subtitle="See what friends are playing, copy their sound, and throw listening parties."
        />
        <AccountPanel />
      </div>
    );
  }
  const accepted = friends.filter((f) => f.status === 'accepted');
  const incoming = friends.filter((f) => f.status === 'pending' && f.direction === 'incoming');
  const outgoing = friends.filter((f) => f.status === 'pending' && f.direction === 'outgoing');
  const live = Object.values(activity);
  return (
    <div className="space-y-8">
      <PageHeader title="Friends">
        <Link
          to="/party"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-hero px-4 text-sm font-bold text-white"
        >
          <PartyPopper size={16} /> Listening party
        </Link>
      </PageHeader>
      {live.length > 0 && (
        <section>
          <SectionHeader title="Friends are listening" />
          <div role="list" className="flex flex-wrap gap-3">
            {live.map((a) => (
              <ActivityCard key={a.userId} a={a} />
            ))}
          </div>
        </section>
      )}
      <section>
        <SectionHeader title="Find friends" />
        <label className="flex items-center gap-2 rounded-full border border-line bg-surface px-4">
          <Search size={16} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by username"
            aria-label="Search users by username"
            className="h-11 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        {results.data && (
          <ul className="mt-2 space-y-1">
            {results.data.length === 0 && <li className="text-sm text-muted">No users found.</li>}
            {results.data.map((p) => {
              const existing = friends.find((f) => f.profile.id === p.id);
              return (
                <li key={p.id} className="flex items-center gap-3 rounded-ctl bg-surface px-3 py-2">
                  <Avatar url={p.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.display_name || p.username}</div>
                    <div className="text-xs text-muted">@{p.username}</div>
                  </div>
                  {existing ? (
                    <span className="text-xs text-muted">
                      {existing.status === 'accepted' ? 'Friends' : 'Requested'}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      icon={<UserPlus size={14} />}
                      onClick={() => act(() => sendFriendRequest(p.id), 'Request sent')}
                    >
                      Add
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {incoming.length > 0 && (
        <section>
          <SectionHeader title="Requests" />
          <ul className="space-y-1">
            {incoming.map((f) => (
              <li
                key={f.friendshipId}
                className="flex items-center gap-3 rounded-ctl bg-surface px-3 py-2"
              >
                <Avatar url={f.profile.avatar_url} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {f.profile.display_name || f.profile.username}
                </span>
                <IconButton
                  label={`Accept ${f.profile.username}`}
                  onClick={() =>
                    act(() => answerFriendRequest(f.friendshipId, true), 'Friend added')
                  }
                >
                  <Check size={18} />
                </IconButton>
                <IconButton
                  label={`Decline ${f.profile.username}`}
                  onClick={() =>
                    act(() => answerFriendRequest(f.friendshipId, false), 'Request declined')
                  }
                >
                  <X size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <SectionHeader title={`Your friends (${accepted.length})`} />
        {accepted.length ? (
          <ul className="space-y-1">
            {accepted.map((f) => (
              <li
                key={f.friendshipId}
                className="flex items-center gap-3 rounded-ctl bg-surface px-3 py-2"
              >
                <Avatar url={f.profile.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {f.profile.display_name || f.profile.username}
                  </div>
                  <div className="text-xs text-muted">
                    @{f.profile.username}
                    {activity[f.profile.id]?.track
                      ? ` · listening to ${activity[f.profile.id]?.track?.title}`
                      : ''}
                  </div>
                </div>
                <IconButton
                  label={`Remove ${f.profile.username}`}
                  onClick={() => act(() => removeFriend(f.friendshipId), 'Friend removed')}
                >
                  <UserMinus size={17} />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<UserPlus />}
            title="No friends yet"
            body="Search for a username above and send a request."
          />
        )}
        {outgoing.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            Waiting on: {outgoing.map((f) => `@${f.profile.username}`).join(', ')}
          </p>
        )}
      </section>
      <section>
        <SectionHeader title="Account & privacy" />
        <AccountPanel />
      </section>
    </div>
  );
}
