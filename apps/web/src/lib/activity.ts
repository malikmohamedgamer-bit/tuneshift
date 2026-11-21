import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { migrateSound, type SoundSettings, type Track } from '@tuneshift/core';
import { getSupabase } from './supabase';
import { getAuth } from '../state/auth';
import { getSettings, useSettings } from '../state/settings';
import { getPlayer, usePlayer } from '../state/player';
import { getSound, useSound } from '../state/sound';
import { listFriendships, type FriendRow } from './social';

/**
 * "Friends are listening" (spec §8) via Supabase Realtime Presence on private channels
 * `activity:<user id>` — RLS on realtime.messages lets only accepted friends read them.
 */

export interface Activity {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  track: Pick<
    Track,
    'key' | 'source' | 'id' | 'title' | 'artist' | 'durationSec' | 'artwork' | 'permalink'
  > | null;
  preset: string;
  sound: SoundSettings | null;
  playing: boolean;
  positionSec: number;
  at: number;
}

interface ActivityState {
  friends: FriendRow[];
  activity: Record<string, Activity>;
}

export const useActivity = create<ActivityState>(() => ({ friends: [], activity: {} }));

let own: RealtimeChannel | null = null;
const friendChannels = new Map<string, RealtimeChannel>();
let unsubs: (() => void)[] = [];
let lastPayload = '';

function shareable(t: Track | null): boolean {
  return Boolean(t && (t.source === 'audius' || t.source === 'jamendo'));
}

function payload(): Activity | null {
  const a = getAuth();
  const p = getPlayer();
  if (!a.profile || !a.session) return null;
  const t = p.current;
  return {
    userId: a.session.user.id,
    username: a.profile.username,
    displayName: a.profile.display_name,
    avatarUrl: a.profile.avatar_url,
    track:
      t && shareable(t)
        ? {
            key: t.key,
            source: t.source,
            id: t.id,
            title: t.title,
            artist: t.artist,
            durationSec: t.durationSec,
            artwork: t.artwork,
            permalink: t.permalink,
          }
        : t
          ? {
              key: 'local',
              source: 'local',
              id: 'local',
              title: 'A local file',
              artist: '',
              durationSec: 0,
            }
          : null,
    preset: getSound().label,
    sound: getSound().settings,
    playing: p.status === 'playing',
    positionSec: p.position,
    at: Date.now(),
  };
}

async function publish(): Promise<void> {
  if (!own) return;
  const s = getSettings();
  if (!s.shareActivity || s.privateSession) {
    if (lastPayload) {
      lastPayload = '';
      await own.untrack();
    }
    return;
  }
  const p = payload();
  if (!p) return;
  const key = JSON.stringify({ ...p, positionSec: Math.round(p.positionSec / 15), at: 0 });
  if (key === lastPayload) return;
  lastPayload = key;
  await own.track(p as unknown as Record<string, unknown>);
}

function watchFriend(f: FriendRow): void {
  const sb = getSupabase();
  if (!sb || friendChannels.has(f.profile.id)) return;
  const ch = sb.channel(`activity:${f.profile.id}`, { config: { private: true } });
  const sync = () => {
    const state = ch.presenceState<Activity>();
    const latest = Object.values(state)
      .flat()
      .sort((a, b) => b.at - a.at)[0];
    useActivity.setState((s) => {
      const activity = { ...s.activity };
      if (latest)
        activity[f.profile.id] = {
          ...latest,
          sound: latest.sound ? migrateSound(latest.sound) : null,
        };
      else delete activity[f.profile.id];
      return { activity };
    });
  };
  ch.on('presence', { event: 'sync' }, sync).subscribe();
  friendChannels.set(f.profile.id, ch);
}

/** Start publishing my activity and watching my friends'. */
export async function startActivity(): Promise<void> {
  const sb = getSupabase();
  const uid = getAuth().session?.user.id;
  if (!sb || !uid) return;
  await sb.realtime.setAuth();
  if (!own) {
    own = sb.channel(`activity:${uid}`, { config: { private: true, presence: { key: uid } } });
    own.subscribe((status) => {
      if (status === 'SUBSCRIBED') void publish();
    });
    unsubs = [
      usePlayer.subscribe((s, p) => {
        if (s.current?.key !== p.current?.key || s.status !== p.status) void publish();
      }),
      useSound.subscribe((s, p) => s.label !== p.label && void publish()),
      useSettings.subscribe(
        (s, p) =>
          (s.shareActivity !== p.shareActivity || s.privateSession !== p.privateSession) &&
          void publish(),
      ),
    ];
  }
  await refreshFriends();
}

export async function refreshFriends(): Promise<FriendRow[]> {
  const rows = await listFriendships().catch(() => [] as FriendRow[]);
  useActivity.setState({ friends: rows });
  for (const f of rows) if (f.status === 'accepted') watchFriend(f);
  for (const [id, ch] of friendChannels) {
    if (!rows.some((r) => r.profile.id === id && r.status === 'accepted')) {
      void ch.unsubscribe();
      friendChannels.delete(id);
    }
  }
  return rows;
}

export async function stopActivity(): Promise<void> {
  unsubs.forEach((u) => u());
  unsubs = [];
  for (const ch of friendChannels.values()) await ch.unsubscribe();
  friendChannels.clear();
  if (own) await own.unsubscribe();
  own = null;
  lastPayload = '';
  useActivity.setState({ friends: [], activity: {} });
}
