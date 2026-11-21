import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getKeys, publicSiteUrl, subscribeKeys } from '../env';
import { isTauri } from '../platform/detect';

/**
 * Optional Supabase backend (spec §8). The app is local-first: with no URL/anon key configured,
 * friends features show "Sign-in not configured yet" and everything else keeps working.
 * Only the anon/publishable key is ever used (env.ts rejects service-role keys).
 */

let client: SupabaseClient | null = null;
let clientFor = '';

export function isSupabaseConfigured(): boolean {
  const k = getKeys();
  return Boolean(k.supabaseUrl && k.supabaseAnonKey);
}

export function getSupabase(): SupabaseClient | null {
  const k = getKeys();
  if (!k.supabaseUrl || !k.supabaseAnonKey) return null;
  const id = `${k.supabaseUrl}|${k.supabaseAnonKey}`;
  if (client && clientFor === id) return client;
  client = createClient(k.supabaseUrl, k.supabaseAnonKey, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'tuneshift-auth',
    },
    realtime: { params: { eventsPerSecond: 10 } },
  });
  clientFor = id;
  return client;
}

/** Throws a friendly error when the backend isn't set up. */
export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c)
    throw new Error(
      'Sign-in not configured yet — add a Supabase URL and anon key in Settings → Account.',
    );
  return c;
}

subscribeKeys(() => {
  // Keys changed at runtime: the next getSupabase() call builds a fresh client.
  client = null;
  clientFor = '';
});

/** Where magic links / OAuth land: the web callback route, or the desktop deep link. */
export function authRedirectUrl(): string {
  return isTauri() ? 'tuneshift://auth' : `${publicSiteUrl()}auth/callback`;
}
