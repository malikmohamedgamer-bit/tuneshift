import { z } from 'zod';

export const BACKUP_APP = 'tuneshift';
export const BACKUP_VERSION = 1;

/** Table names included in a backup (all Dexie tables except caches and file handles). */
export const BACKUP_TABLES = [
  'tracks',
  'likes',
  'playlists',
  'folders',
  'smartPlaylists',
  'history',
  'sounds',
  'themes',
  'assignments',
  'settings',
  'lyricsOffsets',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export const BackupSchema = z.object({
  app: z.literal(BACKUP_APP),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number(),
  data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});

export type BackupFile = z.infer<typeof BackupSchema>;

export function makeBackup(
  data: Partial<Record<BackupTable, unknown[]>>,
  now = Date.now(),
): BackupFile {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const t of BACKUP_TABLES) out[t] = (data[t] ?? []) as Record<string, unknown>[];
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now, data: out };
}

export function parseBackup(json: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const r = BackupSchema.safeParse(raw);
  if (!r.success) throw new Error('That file is not a Tuneshift backup.');
  const unknown = Object.keys(r.data.data).filter(
    (k) => !(BACKUP_TABLES as readonly string[]).includes(k),
  );
  for (const k of unknown) delete r.data.data[k];
  return r.data;
}
