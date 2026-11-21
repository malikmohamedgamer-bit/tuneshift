import { deflateSync, inflateSync } from 'fflate';
import { z } from 'zod';
import { base64UrlToBytes, bytesToBase64Url, fnv1a, utf8Decode, utf8Encode } from './base64';
import { SoundSettingsSchema, migrateSound, type SoundSettings } from './sound';
import { ThemeSchema, type Theme } from './theme';
import { defaultRng, type Rng } from './random';

export type ShareKind = 'sound' | 'theme' | 'playlist';

export interface SharedTrack {
  key: string;
  source: 'audius' | 'jamendo';
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  artwork?: string;
  permalink?: string;
}

export interface SharedSound {
  name: string;
  settings: SoundSettings;
}

export interface SharedPlaylist {
  name: string;
  description?: string;
  tracks: SharedTrack[];
}

export type SharePayload =
  | { kind: 'sound'; data: SharedSound }
  | { kind: 'theme'; data: Theme }
  | { kind: 'playlist'; data: SharedPlaylist };

const KIND_CHAR: Record<ShareKind, string> = { sound: 's', theme: 't', playlist: 'p' };
const CHAR_KIND: Record<string, ShareKind> = { s: 'sound', t: 'theme', p: 'playlist' };
export const SHARE_PREFIX = 'ts1';

const SharedSoundSchema = z.object({
  name: z.string().min(1).max(60),
  settings: SoundSettingsSchema,
});
const SharedTrackSchema = z.object({
  key: z.string(),
  source: z.enum(['audius', 'jamendo']),
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  durationSec: z.number().min(0),
  artwork: z.string().url().optional(),
  permalink: z.string().url().optional(),
});
const SharedPlaylistSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tracks: z.array(SharedTrackSchema).max(500),
});

function checksum(body: string): string {
  return fnv1a(body).toString(36).padStart(7, '0').slice(-4);
}

/** Offline share code: `ts1.<k>.<base64url(deflate(json))>.<checksum>`. Works without a server. */
export function encodeShareCode(p: SharePayload): string {
  const json = JSON.stringify(p.data);
  const packed = bytesToBase64Url(deflateSync(utf8Encode(json), { level: 9 }));
  const body = `${SHARE_PREFIX}.${KIND_CHAR[p.kind]}.${packed}`;
  return `${body}.${checksum(body)}`;
}

/** Pull a code out of a pasted link (`…/s/<code>`, `?code=…`) or return the trimmed input. */
export function extractCode(input: string): string {
  const s = input.trim();
  const m = /\/s\/([A-Za-z0-9._-]+)/.exec(s) ?? /[?&#]code=([A-Za-z0-9._-]+)/.exec(s);
  return m ? (m[1] as string) : s;
}

export class ShareCodeError extends Error {}

export function decodeShareCode(input: string): SharePayload {
  const code = extractCode(input);
  const parts = code.split('.');
  if (parts.length !== 4 || parts[0] !== SHARE_PREFIX)
    throw new ShareCodeError('Not a Tuneshift share code');
  const [, k, packed, sum] = parts as [string, string, string, string];
  const kind = CHAR_KIND[k];
  if (!kind) throw new ShareCodeError('Unknown share type');
  if (checksum(`${SHARE_PREFIX}.${k}.${packed}`) !== sum)
    throw new ShareCodeError('This code looks damaged (checksum mismatch)');
  let raw: unknown;
  try {
    raw = JSON.parse(utf8Decode(inflateSync(base64UrlToBytes(packed))));
  } catch {
    throw new ShareCodeError('This code looks damaged (could not unpack)');
  }
  return validateSharePayload(kind, raw);
}

/** Validate an untrusted payload of a given kind (offline codes and server-side short codes). */
export function validateSharePayload(kind: ShareKind, raw: unknown): SharePayload {
  if (kind === 'sound') {
    const obj = raw as { name?: unknown; settings?: unknown };
    const parsed = SharedSoundSchema.safeParse({
      name: obj?.name,
      settings: obj?.settings ? migrateSound(obj.settings) : undefined,
    });
    if (!parsed.success) throw new ShareCodeError('Invalid sound in code');
    return { kind: 'sound', data: parsed.data as SharedSound };
  }
  if (kind === 'theme') {
    const parsed = ThemeSchema.safeParse(raw);
    if (!parsed.success) throw new ShareCodeError('Invalid theme in code');
    return { kind: 'theme', data: { ...(parsed.data as Theme), builtIn: false } };
  }
  const parsed = SharedPlaylistSchema.safeParse(raw);
  if (!parsed.success) throw new ShareCodeError('Invalid playlist in code');
  return { kind: 'playlist', data: parsed.data as SharedPlaylist };
}

export function isOfflineShareCode(s: string): boolean {
  return extractCode(s).startsWith(`${SHARE_PREFIX}.`);
}

/** Short server-side codes (Supabase `shares` table): no ambiguous characters (0/o, 1/l/i). */
export const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

export function generateShortCode(length = 8, rng: Rng = defaultRng): string {
  let out = '';
  for (let i = 0; i < length; i++)
    out += SHORT_CODE_ALPHABET[Math.floor(rng() * SHORT_CODE_ALPHABET.length)];
  return out;
}

export function isShortCode(s: string): boolean {
  return new RegExp(`^[${SHORT_CODE_ALPHABET}]{6,12}$`).test(extractCode(s));
}
