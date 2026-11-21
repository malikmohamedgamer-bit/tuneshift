import { generateShortCode, validateSharePayload, type SharePayload } from '@tuneshift/core';
import { z } from 'zod';
import {
  getSupabase,
  loadSupabase,
  requireSupabase,
  authRedirectUrl,
  isSupabaseConfigured,
} from './supabase';
import { getAuth, setAuth, type Profile } from '../state/auth';
import { resizeImage } from './images';
import { useSettings } from '../state/settings';

// ---------------------------------------------------------------- auth

let started = false;

/** Wire Supabase auth into the app state (safe to call when Supabase isn't configured). */
export async function initAuth(onSignedIn: () => void, onSignedOut: () => void): Promise<void> {
  const sb = await loadSupabase();
  if (!sb) {
    setAuth({ status: 'unconfigured', session: null, profile: null });
    return;
  }
  if (started) return;
  started = true;
  const apply = async (
    session: Awaited<ReturnType<typeof sb.auth.getSession>>['data']['session'],
  ) => {
    if (!session) {
      setAuth({ status: 'signed-out', session: null, profile: null });
      onSignedOut();
      return;
    }
    setAuth({ session, status: 'loading' });
    const profile = await loadProfile(session.user.id).catch(() => null);
    setAuth({ profile, status: profile ? 'signed-in' : 'needs-profile' });
    if (profile) onSignedIn();
  };
  const { data } = await sb.auth.getSession();
  await apply(data.session);
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED')
      void apply(session);
    else if (event === 'TOKEN_REFRESHED') setAuth({ session });
  });
}

export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await requireSupabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
  if (error) throw error;
  return { needsConfirmation: !data.session };
}

/** PKCE callback: `?code=` from a magic link (web, PWA) or the desktop deep link. */
export async function completeAuthFromUrl(url: string): Promise<void> {
  const u = new URL(url);
  const code = u.searchParams.get('code');
  const err =
    u.searchParams.get('error_description') ?? u.hash.match(/error_description=([^&]+)/)?.[1];
  if (err) throw new Error(decodeURIComponent(err.replace(/\+/g, ' ')));
  if (!code) return;
  const { error } = await requireSupabase().auth.exchangeCodeForSession(code);
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await getSupabase()?.auth.signOut();
}

// ---------------------------------------------------------------- profile

const ProfileSchema = z.object({
  id: z.string(),
  username: z.string(),
  display_name: z.string(),
  avatar_url: z.string().nullable(),
  share_activity: z.boolean(),
});

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, username, display_name, avatar_url, share_activity')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data ? ProfileSchema.parse(data) : null;
}

export const USERNAME_RE = /^[a-z0-9_]{3,24}$/;

export async function saveProfile(p: { username: string; display_name: string }): Promise<Profile> {
  const uid = getAuth().session?.user.id;
  if (!uid) throw new Error('Sign in first');
  const username = p.username.trim().toLowerCase();
  if (!USERNAME_RE.test(username)) throw new Error('Usernames are 3–24 characters: a–z, 0–9 and _');
  const { data, error } = await requireSupabase()
    .from('profiles')
    .upsert({
      id: uid,
      username,
      display_name: p.display_name.trim().slice(0, 60),
      updated_at: new Date().toISOString(),
    })
    .select('id, username, display_name, avatar_url, share_activity')
    .single();
  if (error) throw new Error(error.code === '23505' ? 'That username is taken' : error.message);
  const profile = ProfileSchema.parse(data);
  setAuth({ profile, status: 'signed-in' });
  return profile;
}

/** Avatar: resized client-side, ≤ 2 MB, stored under avatars/<uid>/. */
export async function uploadAvatar(file: File): Promise<string> {
  const uid = getAuth().session?.user.id;
  if (!uid) throw new Error('Sign in first');
  const img = await resizeImage(file, 256, 'image/webp', 0.86);
  if (img.size > 2 * 1024 * 1024) throw new Error('Image is too large (max 2 MB)');
  const sb = requireSupabase();
  const path = `${uid}/avatar-${Date.now()}.webp`;
  const { error } = await sb.storage
    .from('avatars')
    .upload(path, img, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await sb
    .from('profiles')
    .update({ avatar_url: url, updated_at: new Date().toISOString() })
    .eq('id', uid);
  if (e2) throw e2;
  const cur = getAuth().profile;
  if (cur) setAuth({ profile: { ...cur, avatar_url: url } });
  return url;
}

export async function setShareActivity(on: boolean): Promise<void> {
  useSettings.getState().set({ shareActivity: on });
  const uid = getAuth().session?.user.id;
  if (!uid) return;
  await requireSupabase().from('profiles').update({ share_activity: on }).eq('id', uid);
  const cur = getAuth().profile;
  if (cur) setAuth({ profile: { ...cur, share_activity: on } });
}

// ---------------------------------------------------------------- friends

export interface FriendRow {
  friendshipId: string;
  status: 'pending' | 'accepted' | 'declined';
  direction: 'incoming' | 'outgoing';
  profile: Profile;
}

export async function searchUsers(q: string): Promise<Profile[]> {
  const term = q
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');
  if (term.length < 2) return [];
  const me = getAuth().session?.user.id;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, username, display_name, avatar_url, share_activity')
    .ilike('username', `${term}%`)
    .limit(20);
  if (error) throw error;
  return z
    .array(ProfileSchema)
    .parse(data)
    .filter((p) => p.id !== me);
}

export async function listFriendships(): Promise<FriendRow[]> {
  const me = getAuth().session?.user.id;
  if (!me) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('friendships')
    .select('id, requester, addressee, status')
    .or(`requester.eq.${me},addressee.eq.${me}`);
  if (error) throw error;
  const rows = z
    .array(
      z.object({
        id: z.string(),
        requester: z.string(),
        addressee: z.string(),
        status: z.enum(['pending', 'accepted', 'declined']),
      }),
    )
    .parse(data);
  const ids = [...new Set(rows.map((r) => (r.requester === me ? r.addressee : r.requester)))];
  if (!ids.length) return [];
  const { data: profs, error: e2 } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, share_activity')
    .in('id', ids);
  if (e2) throw e2;
  const byId = new Map(
    z
      .array(ProfileSchema)
      .parse(profs)
      .map((p) => [p.id, p]),
  );
  return rows
    .map((r) => {
      const other = r.requester === me ? r.addressee : r.requester;
      const profile = byId.get(other);
      return profile
        ? {
            friendshipId: r.id,
            status: r.status,
            direction: r.requester === me ? ('outgoing' as const) : ('incoming' as const),
            profile,
          }
        : null;
    })
    .filter((x): x is FriendRow => x !== null);
}

export async function sendFriendRequest(userId: string): Promise<void> {
  const me = getAuth().session?.user.id;
  if (!me) throw new Error('Sign in first');
  const { error } = await requireSupabase()
    .from('friendships')
    .insert({ requester: me, addressee: userId, status: 'pending' });
  if (error) throw new Error(error.code === '23505' ? 'You already sent a request' : error.message);
}

export async function answerFriendRequest(friendshipId: string, accept: boolean): Promise<void> {
  const { error } = await requireSupabase()
    .from('friendships')
    .update({ status: accept ? 'accepted' : 'declined', updated_at: new Date().toISOString() })
    .eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await requireSupabase().from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

// ---------------------------------------------------------------- short share codes

export async function createShortShare(p: SharePayload): Promise<string> {
  const uid = getAuth().session?.user.id;
  if (!uid)
    throw new Error(
      'Sign in to create short links (or share the long code, which works without an account)',
    );
  const sb = requireSupabase();
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = generateShortCode(8);
    const { error } = await sb
      .from('shares')
      .insert({ code, owner: uid, kind: p.kind, payload: p.data });
    if (!error) return code;
    if (error.code !== '23505') throw error;
  }
  throw new Error('Could not create a share code — try again');
}

/** Resolve a short code via the get_share RPC (works signed out). */
export async function fetchShortShare(code: string): Promise<SharePayload> {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'This short link needs the Tuneshift server, which isn’t configured in this app yet. Ask your friend for the long share code instead.',
    );
  }
  const { data, error } = await requireSupabase().rpc('get_share', {
    share_code: code.toLowerCase(),
  });
  if (error) throw error;
  const row = z
    .array(z.object({ kind: z.enum(['sound', 'playlist', 'theme']), payload: z.unknown() }))
    .parse(data)[0];
  if (!row) throw new Error('This share link has expired or never existed');
  return validateSharePayload(row.kind, row.payload);
}
