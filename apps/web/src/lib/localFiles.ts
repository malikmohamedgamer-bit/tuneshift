import { fnv1a, trackKey, type Track } from '@tuneshift/core';
import { isAudioFileName, metadataFromFileName } from '@tuneshift/sources';
import { db, type LocalFileRecord, type LocalFolderRecord } from '../db/db';
import { supportsFileSystemAccess, supportsOpfs } from '../platform/detect';

/**
 * Local files (spec §3.1): drag-and-drop, file picker, folder picker. With the File System Access
 * API we persist handles in IndexedDB and re-ask for permission after a reload; elsewhere files
 * are copied into the Origin Private File System so they survive reloads.
 */

const OPFS_DIR = 'tuneshift-audio';
const AUDIO_ACCEPT = {
  'audio/*': ['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus', '.oga', '.webm'],
};

export class LocalFileError extends Error {
  constructor(
    message: string,
    readonly kind: 'permission' | 'missing' | 'unsupported',
  ) {
    super(message);
  }
}

export function fileIdFor(name: string, size: number, mtime: number, folder = ''): string {
  return `f${fnv1a(`${folder}|${name}|${size}|${mtime}`).toString(36)}`;
}

async function opfsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(OPFS_DIR, { create: true });
}

interface ParsedTags {
  title: string;
  artist: string;
  album?: string;
  genre?: string;
  trackNo?: number;
  year?: number;
  durationSec: number;
  replayGainDb?: number;
  replayGainAlbumDb?: number;
  cover?: Blob;
}

async function readTags(file: File): Promise<ParsedTags> {
  const fallback = metadataFromFileName(file.name);
  try {
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(file, { duration: false, skipCovers: false });
    const c = meta.common;
    const pic = c.picture?.[0];
    return {
      title: c.title?.trim() || fallback.title,
      artist: c.artist?.trim() || c.albumartist?.trim() || fallback.artist,
      album: c.album?.trim() || undefined,
      genre: c.genre?.[0]?.trim() || undefined,
      trackNo: c.track?.no ?? fallback.trackNo,
      year: c.year,
      durationSec: meta.format.duration ?? 0,
      replayGainDb: c.replaygain_track_gain?.dB,
      replayGainAlbumDb: c.replaygain_album_gain?.dB,
      cover: pic
        ? new Blob([pic.data as Uint8Array<ArrayBuffer>], { type: pic.format })
        : undefined,
    };
  } catch {
    return { ...fallback, durationSec: 0 };
  }
}

/** Duration via the media element when tags don't have it. */
function probeDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = new Audio();
    const done = (d: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => done(el.duration);
    el.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    el.src = url;
  });
}

export interface ImportItem {
  file: File;
  handle?: FileSystemFileHandle;
  folderId?: string;
  relPath?: string;
}

export interface ImportResult {
  added: Track[];
  skipped: number;
  failed: { name: string; reason: string }[];
}

/** Import files into the library. Already-known files (same name/size/date) are skipped. */
export async function importItems(
  items: ImportItem[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const res: ImportResult = { added: [], skipped: 0, failed: [] };
  const persistViaOpfs = !items.some((i) => i.handle) && supportsOpfs();
  let done = 0;
  for (const item of items) {
    const { file } = item;
    done++;
    if (!isAudioFileName(file.name) && !file.type.startsWith('audio/')) {
      res.failed.push({ name: file.name, reason: 'Not an audio file' });
      continue;
    }
    const id = fileIdFor(file.name, file.size, file.lastModified, item.folderId);
    if (await db.localFiles.get(id)) {
      res.skipped++;
      onProgress?.(done, items.length);
      continue;
    }
    try {
      const tags = await readTags(file);
      const durationSec = tags.durationSec || (await probeDuration(file));
      const record: LocalFileRecord = {
        id,
        name: file.name,
        kind: item.handle ? 'handle' : persistViaOpfs ? 'opfs' : 'handle',
        size: file.size,
        mtime: file.lastModified,
        handle: item.handle,
        folderId: item.folderId,
        relPath: item.relPath,
        cover: tags.cover,
      };
      if (!item.handle && persistViaOpfs) {
        const dir = await opfsDir();
        const name = `${id}-${file.name.replace(/[^\w.-]+/g, '_')}`;
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(file);
        await w.close();
        record.opfsName = name;
      } else if (!item.handle) {
        // No handles and no OPFS: keep the File for this session only.
        sessionFiles.set(id, file);
      }
      const track: Track = {
        key: trackKey('local', id),
        source: 'local',
        id,
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        genre: tags.genre,
        durationSec,
        artwork: tags.cover
          ? { small: coverUrlToken(id), medium: coverUrlToken(id), large: coverUrlToken(id) }
          : undefined,
        local: {
          fileId: id,
          path: item.relPath ?? file.name,
          folder: item.relPath?.split('/').slice(0, -1).join('/') || undefined,
          size: file.size,
          mtime: file.lastModified,
          trackNo: tags.trackNo,
          year: tags.year,
          replayGainDb: tags.replayGainDb,
          replayGainAlbumDb: tags.replayGainAlbumDb,
        },
        addedAt: Date.now(),
      };
      await db.transaction('rw', db.localFiles, db.tracks, async () => {
        await db.localFiles.put(record);
        await db.tracks.put(track);
      });
      res.added.push(track);
    } catch (e) {
      res.failed.push({
        name: file.name,
        reason: e instanceof Error ? e.message : 'Could not read file',
      });
    }
    onProgress?.(done, items.length);
  }
  return res;
}

const sessionFiles = new Map<string, File>();

/** Pick files with the File System Access API, or an <input type=file> fallback. */
export async function pickFiles(): Promise<ImportItem[]> {
  if (supportsFileSystemAccess()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Audio', accept: AUDIO_ACCEPT }],
      });
      return Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h })));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return [];
      throw e;
    }
  }
  const files = await inputPick({ multiple: true, accept: 'audio/*' });
  return files.map((file) => ({ file }));
}

/** Pick a folder: directory handle (persisted, rescannable) or webkitdirectory fallback. */
export async function pickFolder(): Promise<{ folder?: LocalFolderRecord; items: ImportItem[] }> {
  if (supportsFileSystemAccess()) {
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await window.showDirectoryPicker({ mode: 'read' });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return { items: [] };
      throw e;
    }
    const folder: LocalFolderRecord = {
      id: `d${fnv1a(dir.name + Date.now()).toString(36)}`,
      name: dir.name,
      kind: 'handle',
      handle: dir,
      addedAt: Date.now(),
    };
    await db.folders.put(folder);
    return { folder, items: await scanDirectory(dir, folder.id) };
  }
  const files = await inputPick({ multiple: true, directory: true });
  const audio = files.filter((f) => isAudioFileName(f.name));
  return {
    items: audio.map((file) => ({
      file,
      relPath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    })),
  };
}

async function scanDirectory(
  dir: FileSystemDirectoryHandle,
  folderId: string,
  prefix = '',
): Promise<ImportItem[]> {
  const out: ImportItem[] = [];
  for await (const entry of dir.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'directory') out.push(...(await scanDirectory(entry, folderId, rel)));
    else if (isAudioFileName(entry.name)) {
      const handle = entry;
      out.push({ file: await handle.getFile(), handle, folderId, relPath: `${dir.name}/${rel}` });
    }
  }
  return out;
}

/** Rescan a persisted folder (asks for permission again if needed). */
export async function rescanFolder(folder: LocalFolderRecord): Promise<ImportResult> {
  if (folder.kind !== 'handle' || !folder.handle)
    throw new LocalFileError('This folder can only be rescanned in the desktop app', 'unsupported');
  await ensurePermission(folder.handle);
  const items = await scanDirectory(folder.handle, folder.id);
  const present = new Set(
    items.map((i) => fileIdFor(i.file.name, i.file.size, i.file.lastModified, folder.id)),
  );
  // Files that disappeared are marked missing (kept so playlists don't silently lose them).
  const known = await db.localFiles.where('folderId').equals(folder.id).toArray();
  for (const k of known) {
    if (!present.has(k.id)) {
      const t = await db.tracks.get(trackKey('local', k.id));
      if (t?.local) await db.tracks.put({ ...t, local: { ...t.local, missing: true } });
    }
  }
  await db.folders.update(folder.id, { lastScan: Date.now() });
  return importItems(items);
}

function inputPick(opts: {
  multiple: boolean;
  accept?: string;
  directory?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.multiple;
    if (opts.accept) input.accept = opts.accept;
    if (opts.directory) input.setAttribute('webkitdirectory', '');
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

type PermHandle = FileSystemHandle & {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
};

async function ensurePermission(handle: FileSystemHandle): Promise<void> {
  const h = handle as PermHandle;
  if (!h.queryPermission) return;
  if ((await h.queryPermission({ mode: 'read' })) === 'granted') return;
  const r = await h.requestPermission?.({ mode: 'read' });
  if (r !== 'granted')
    throw new LocalFileError('Allow Tuneshift to read this file again to play it', 'permission');
}

/** The file's bytes (export, loudness analysis, playback). */
export async function getLocalBlob(fileId: string): Promise<Blob> {
  const rec = await db.localFiles.get(fileId);
  const session = sessionFiles.get(fileId);
  if (session) return session;
  if (!rec) throw new LocalFileError('This file is no longer in your library', 'missing');
  try {
    if (rec.kind === 'handle' && rec.handle) {
      await ensurePermission(rec.handle);
      return await rec.handle.getFile();
    }
    if (rec.kind === 'opfs' && rec.opfsName) {
      const dir = await opfsDir();
      return await (await dir.getFileHandle(rec.opfsName)).getFile();
    }
  } catch (e) {
    if (e instanceof LocalFileError) throw e;
    const t = await db.tracks.get(trackKey('local', fileId));
    if (t?.local) await db.tracks.put({ ...t, local: { ...t.local, missing: true } });
    throw new LocalFileError(`“${rec.name}” is missing — it was moved or deleted`, 'missing');
  }
  throw new LocalFileError(
    `“${rec.name}” was added in a previous session in a browser that can't keep files. Add it again.`,
    'missing',
  );
}

const blobUrls = new Map<string, string>();
const MAX_URLS = 8;

/** Object URL for playback (cached; oldest revoked beyond 8). */
export async function localFileUrl(fileId: string): Promise<string> {
  const hit = blobUrls.get(fileId);
  if (hit) return hit;
  const blob = await getLocalBlob(fileId);
  const url = URL.createObjectURL(blob);
  blobUrls.set(fileId, url);
  if (blobUrls.size > MAX_URLS) {
    const [oldId, oldUrl] = blobUrls.entries().next().value as [string, string];
    blobUrls.delete(oldId);
    URL.revokeObjectURL(oldUrl);
  }
  return url;
}

export async function removeLocalFiles(ids: string[]): Promise<void> {
  const recs = (await db.localFiles.bulkGet(ids)).filter((r): r is LocalFileRecord => Boolean(r));
  if (supportsOpfs()) {
    const dir = await opfsDir().catch(() => null);
    for (const r of recs)
      if (r.opfsName && dir) await dir.removeEntry(r.opfsName).catch(() => undefined);
  }
  await db.transaction('rw', db.localFiles, db.tracks, async () => {
    await db.localFiles.bulkDelete(ids);
    await db.tracks.bulkDelete(ids.map((id) => trackKey('local', id)));
  });
  for (const id of ids) {
    const u = blobUrls.get(id);
    if (u) URL.revokeObjectURL(u);
    blobUrls.delete(id);
  }
}

export async function removeFolder(folderId: string): Promise<void> {
  const ids = (await db.localFiles.where('folderId').equals(folderId).toArray()).map((r) => r.id);
  await removeLocalFiles(ids);
  await db.folders.delete(folderId);
}

export interface StorageInfo {
  usage: number;
  quota: number;
  opfsBytes: number;
  opfsFiles: number;
  persisted: boolean;
}

export async function storageInfo(): Promise<StorageInfo> {
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  const opfs = await db.localFiles.where('kind').equals('opfs').toArray();
  return {
    usage: est.usage ?? 0,
    quota: est.quota ?? 0,
    opfsBytes: opfs.reduce((n, r) => n + r.size, 0),
    opfsFiles: opfs.length,
    persisted,
  };
}

/** Delete every OPFS copy (Settings → Data). Handle-based files are untouched. */
export async function clearOpfsCopies(): Promise<number> {
  const ids = (await db.localFiles.where('kind').equals('opfs').toArray()).map((r) => r.id);
  await removeLocalFiles(ids);
  return ids.length;
}

// Cover art for local files lives in IndexedDB; artwork URLs carry a token the UI resolves.
const COVER_PREFIX = 'idb-cover:';
export const coverUrlToken = (fileId: string) => `${COVER_PREFIX}${fileId}`;
const coverUrls = new Map<string, string>();

export async function resolveArtworkUrl(url: string | undefined): Promise<string | undefined> {
  if (!url?.startsWith(COVER_PREFIX)) return url;
  const id = url.slice(COVER_PREFIX.length);
  const hit = coverUrls.get(id);
  if (hit) return hit;
  const rec = await db.localFiles.get(id);
  if (!rec?.cover) return undefined;
  const u = URL.createObjectURL(rec.cover);
  coverUrls.set(id, u);
  return u;
}

export function isCoverToken(url: string | undefined): boolean {
  return Boolean(url?.startsWith(COVER_PREFIX));
}
