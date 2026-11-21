import type { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { generateShortCode, type Track } from '@tuneshift/core';
import { z } from 'zod';
import { requireSupabase } from './supabase';
import { getAuth } from '../state/auth';
import { getPlayer, usePlayer } from '../state/player';
import { getSound } from '../state/sound';
import { player } from '../player/controller';
import { rememberTracks } from './sources';

/**
 * Listening parties (spec §8): the controller broadcasts playback state on the private channel
 * `party:<code>`; guests follow it, correcting drift > 300 ms with small rate nudges (< 2 s) or
 * seeks. Chat, emoji reactions and "pass control" ride the same channel.
 */

export interface PartyState {
  trackKey: string | null;
  track: PartyTrack | null;
  positionMs: number;
  playing: boolean;
  speed: number;
  serverTime: number;
  queue: PartyTrack[];
}

export type PartyTrack = Pick<
  Track,
  'key' | 'source' | 'id' | 'title' | 'artist' | 'durationSec' | 'artwork' | 'permalink'
>;

export interface ChatMsg {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
}

export interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface PartyStore {
  code: string | null;
  name: string;
  host: string | null;
  controller: string | null;
  members: Member[];
  chat: ChatMsg[];
  reactions: { id: string; emoji: string; from: string }[];
  remote: PartyState | null;
  driftMs: number;
  status: 'idle' | 'joining' | 'live' | 'error';
  error: string | null;
}

export const useParty = create<PartyStore>(() => ({
  code: null,
  name: '',
  host: null,
  controller: null,
  members: [],
  chat: [],
  reactions: [],
  remote: null,
  driftMs: 0,
  status: 'idle',
  error: null,
}));

const RoomSchema = z.object({
  code: z.string(),
  host: z.string(),
  controller: z.string(),
  name: z.string(),
  ended_at: z.string().nullable(),
});

let channel: RealtimeChannel | null = null;
let broadcastTimer: ReturnType<typeof setInterval> | null = null;
let unsubPlayer: (() => void) | null = null;
let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

const me = () => getAuth().session?.user.id ?? '';
const myName = () => getAuth().profile?.display_name || getAuth().profile?.username || 'Someone';
export const isController = () => useParty.getState().controller === me();

export const isShareable = (t: Pick<Track, 'source'>) =>
  t.source === 'audius' || t.source === 'jamendo';

function slim(t: Track | PartyTrack): PartyTrack {
  return {
    key: t.key,
    source: t.source,
    id: t.id,
    title: t.title,
    artist: t.artist,
    durationSec: t.durationSec,
    artwork: t.artwork,
    permalink: t.permalink,
  };
}

function localState(): PartyState {
  const p = getPlayer();
  const t = p.current && isShareable(p.current) ? slim(p.current) : null;
  return {
    trackKey: t?.key ?? null,
    track: t,
    positionMs: Math.round(player.engine.currentTime * 1000),
    playing: p.status === 'playing',
    speed: getSound().settings.speed,
    serverTime: Date.now(),
    queue: useParty.getState().remote?.queue ?? [],
  };
}

function broadcast(event: string, payload: Record<string, unknown>): void {
  void channel?.send({ type: 'broadcast', event, payload });
}

function broadcastState(): void {
  if (!isController()) return;
  const s = localState();
  useParty.setState({ remote: s });
  broadcast('state', s as unknown as Record<string, unknown>);
}

/** Guest side: follow the controller. */
async function follow(s: PartyState): Promise<void> {
  useParty.setState({ remote: s });
  if (isController() || !s.track) return;
  const p = getPlayer();
  if (p.current?.key !== s.track.key) {
    await rememberTracks([s.track as Track]);
    await player.playTracks([s.track as Track], 0, {
      name: `Party ${useParty.getState().code}`,
      kind: 'party',
    });
    return;
  }
  if (!s.playing) {
    if (p.status === 'playing') player.pause();
    return;
  }
  if (p.status !== 'playing') await player.play();
  const expected = s.positionMs + (Date.now() - s.serverTime) * s.speed;
  const actual = player.engine.currentTime * 1000;
  const drift = actual - expected;
  useParty.setState({ driftMs: Math.round(drift) });
  if (Math.abs(drift) <= 300) return;
  if (Math.abs(drift) > 2000) {
    player.seek(expected / 1000);
    return;
  }
  // Small drift: nudge the rate ±4 % for long enough to close the gap, then restore.
  const el = player.engine.activeElement;
  const base = s.speed;
  const nudge = drift > 0 ? 0.96 : 1.04;
  el.playbackRate = base * nudge;
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => (el.playbackRate = base), Math.min(4000, Math.abs(drift) / 0.04));
}

async function connect(code: string, room: z.infer<typeof RoomSchema>): Promise<void> {
  const sb = requireSupabase();
  await sb.realtime.setAuth();
  await leaveParty(false);
  const ch = sb.channel(`party:${code}`, {
    config: { private: true, broadcast: { self: false }, presence: { key: me() } },
  });
  ch.on('broadcast', { event: 'state' }, ({ payload }) => void follow(payload as PartyState))
    .on('broadcast', { event: 'chat' }, ({ payload }) =>
      useParty.setState((s) => ({ chat: [...s.chat.slice(-199), payload as ChatMsg] })),
    )
    .on('broadcast', { event: 'react' }, ({ payload }) => {
      const r = payload as { id: string; emoji: string; from: string };
      useParty.setState((s) => ({ reactions: [...s.reactions, r] }));
      setTimeout(
        () => useParty.setState((s) => ({ reactions: s.reactions.filter((x) => x.id !== r.id) })),
        2500,
      );
    })
    .on('broadcast', { event: 'control' }, ({ payload }) => {
      useParty.setState({ controller: (payload as { to: string }).to });
      if (isController()) broadcastState();
    })
    .on('broadcast', { event: 'hello' }, () => broadcastState())
    .on('presence', { event: 'sync' }, () => {
      const members = Object.values(ch.presenceState<Member>())
        .flat()
        .map((m) => ({ userId: m.userId, name: m.name, avatarUrl: m.avatarUrl }));
      useParty.setState({ members });
    });
  channel = ch;
  useParty.setState({
    code,
    name: room.name,
    host: room.host,
    controller: room.controller,
    status: 'joining',
    chat: [],
    error: null,
  });
  await new Promise<void>((resolve, reject) => {
    ch.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        void ch.track({
          userId: me(),
          name: myName(),
          avatarUrl: getAuth().profile?.avatar_url ?? null,
        });
        broadcast('hello', {});
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')
        reject(err ?? new Error('Could not connect to the party'));
    });
  });
  useParty.setState({ status: 'live' });
  broadcastTimer = setInterval(broadcastState, 2000);
  unsubPlayer = usePlayer.subscribe((s, p) => {
    if (s.current?.key !== p.current?.key || s.status !== p.status) broadcastState();
  });
}

export async function createParty(name: string): Promise<string> {
  const sb = requireSupabase();
  const uid = me();
  if (!uid) throw new Error('Sign in to host a party');
  const code = generateShortCode(8);
  const { error } = await sb
    .from('party_rooms')
    .insert({ code, host: uid, controller: uid, name: name.trim() || 'Listening party' });
  if (error) throw error;
  const { data, error: e2 } = await sb.rpc('join_party', { room: code });
  if (e2) throw e2;
  const room = RoomSchema.parse((data as unknown[])[0]);
  await connect(code, room);
  return code;
}

export async function joinParty(code: string): Promise<void> {
  const clean = code.trim().toLowerCase();
  const { data, error } = await requireSupabase().rpc('join_party', { room: clean });
  if (error)
    throw new Error(
      error.message.includes('not found') ? 'No open party with that code' : error.message,
    );
  const room = RoomSchema.parse((data as unknown[])[0]);
  await connect(clean, room);
}

export async function leaveParty(clear = true): Promise<void> {
  if (broadcastTimer) clearInterval(broadcastTimer);
  broadcastTimer = null;
  unsubPlayer?.();
  unsubPlayer = null;
  if (channel) await channel.unsubscribe();
  channel = null;
  if (clear)
    useParty.setState({
      code: null,
      members: [],
      chat: [],
      remote: null,
      status: 'idle',
      controller: null,
      host: null,
    });
}

export function sendChat(text: string): void {
  const msg: ChatMsg = {
    id: crypto.randomUUID(),
    from: me(),
    name: myName(),
    text: text.trim().slice(0, 300),
    at: Date.now(),
  };
  if (!msg.text) return;
  useParty.setState((s) => ({ chat: [...s.chat, msg] }));
  broadcast('chat', msg as unknown as Record<string, unknown>);
}

export function sendReaction(emoji: string): void {
  const r = { id: crypto.randomUUID(), emoji, from: myName() };
  useParty.setState((s) => ({ reactions: [...s.reactions, r] }));
  setTimeout(
    () => useParty.setState((s) => ({ reactions: s.reactions.filter((x) => x.id !== r.id) })),
    2500,
  );
  broadcast('react', r);
}

export function passControl(to: string): void {
  if (!isController()) return;
  useParty.setState({ controller: to });
  broadcast('control', { to });
  void requireSupabase()
    .from('party_rooms')
    .update({ controller: to })
    .eq('code', useParty.getState().code ?? '');
}

/** Controller: queue a shareable track for everyone (local files can't be shared). */
export function queueForParty(t: Track): boolean {
  if (!isShareable(t)) return false;
  player.addToQueue([t]);
  const remote = useParty.getState().remote;
  if (remote) useParty.setState({ remote: { ...remote, queue: [...remote.queue, slim(t)] } });
  broadcastState();
  return true;
}
