import { z } from 'zod';

/**
 * Public configuration. Every key is optional: build-time `VITE_*` env vars are validated with
 * zod, and the user can paste keys at runtime (Settings → Sources → API keys), stored locally.
 * Only PUBLIC keys are allowed here — never a Supabase service-role key.
 */

const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined),
  z.string().optional(),
);

const EnvSchema = z.object({
  VITE_AUDIUS_API_KEY: optionalString,
  VITE_JAMENDO_CLIENT_ID: optionalString.pipe(
    z
      .string()
      .regex(/^[A-Za-z0-9]{6,64}$/, 'should be letters and digits only')
      .optional(),
  ),
  VITE_SUPABASE_URL: optionalString.pipe(z.string().url('should be a https:// URL').optional()),
  VITE_SUPABASE_ANON_KEY: optionalString.pipe(
    z
      .string()
      .min(20, 'looks too short')
      .refine((k) => !isServiceRoleKey(k), 'is a service-role key — never put that in an app')
      .optional(),
  ),
  VITE_PUBLIC_SITE_URL: optionalString.pipe(z.string().url().optional()),
});

export type KeyName = 'audiusApiKey' | 'jamendoClientId' | 'supabaseUrl' | 'supabaseAnonKey';

export interface PublicKeys {
  audiusApiKey?: string;
  jamendoClientId?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface EnvIssue {
  variable: string;
  message: string;
}

/** Decodes a JWT payload and checks for the service_role claim (also catches `sb_secret_` keys). */
export function isServiceRoleKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  const part = key.split('.')[1];
  if (!part) return false;
  try {
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
    return /"role"\s*:\s*"service_role"/.test(json);
  } catch {
    return false;
  }
}

function readBuildEnv(): { keys: PublicKeys; issues: EnvIssue[]; siteUrl?: string } {
  const raw = {
    VITE_AUDIUS_API_KEY: import.meta.env.VITE_AUDIUS_API_KEY,
    VITE_JAMENDO_CLIENT_ID: import.meta.env.VITE_JAMENDO_CLIENT_ID,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
    VITE_PUBLIC_SITE_URL: import.meta.env.VITE_PUBLIC_SITE_URL,
  };
  const issues: EnvIssue[] = [];
  // Validate each variable on its own so one bad value doesn't hide the others.
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = EnvSchema.shape[k as keyof typeof EnvSchema.shape];
    const r = field.safeParse(v);
    if (r.success) out[k] = r.data;
    else issues.push({ variable: k, message: r.error.issues[0]?.message ?? 'invalid value' });
  }
  return {
    keys: {
      audiusApiKey: out.VITE_AUDIUS_API_KEY,
      jamendoClientId: out.VITE_JAMENDO_CLIENT_ID,
      supabaseUrl: out.VITE_SUPABASE_URL,
      supabaseAnonKey: out.VITE_SUPABASE_ANON_KEY,
    },
    issues,
    siteUrl: out.VITE_PUBLIC_SITE_URL,
  };
}

const build = readBuildEnv();
export const envIssues: readonly EnvIssue[] = build.issues;

const STORAGE_KEY = 'tuneshift:keys';
const listeners = new Set<() => void>();

function readRuntime(): PublicKeys {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: PublicKeys = {};
    for (const k of [
      'audiusApiKey',
      'jamendoClientId',
      'supabaseUrl',
      'supabaseAnonKey',
    ] as const) {
      const v = parsed[k];
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

let runtime = readRuntime();
let snapshot: PublicKeys = { ...build.keys, ...runtime };

/** Effective keys: runtime (Settings) overrides build-time env. */
export function getKeys(): PublicKeys {
  return snapshot;
}

export function keySource(name: KeyName): 'runtime' | 'env' | 'missing' {
  if (runtime[name]) return 'runtime';
  if (build.keys[name]) return 'env';
  return 'missing';
}

export function setRuntimeKey(name: KeyName, value: string | undefined): void {
  const next = { ...runtime };
  if (value?.trim()) next[name] = value.trim();
  else delete next[name];
  if (name === 'supabaseAnonKey' && next[name] && isServiceRoleKey(next[name])) {
    throw new Error('That is a service-role key. Only the anon/publishable key is allowed.');
  }
  runtime = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime));
  } catch {
    // Private mode / storage full: keys still work for this session.
  }
  snapshot = { ...build.keys, ...runtime };
  listeners.forEach((l) => l());
}

export function subscribeKeys(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Base URL the app is served from (`/tuneshift/` on Pages, `/` in dev and desktop). */
export const BASE_URL = import.meta.env.BASE_URL;

/** Public site URL used in share links and auth redirects. */
export function publicSiteUrl(): string {
  if (build.siteUrl) return build.siteUrl.endsWith('/') ? build.siteUrl : `${build.siteUrl}/`;
  return new URL(BASE_URL, window.location.origin).toString();
}
