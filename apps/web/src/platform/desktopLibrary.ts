import { fnv1a, trackKey, type Track } from '@tuneshift/core';
import { isAudioFileName, metadataFromFileName } from '@tuneshift/sources';
import { toast } from 'sonner';
import { db, type LocalFileRecord, type LocalFolderRecord } from '../db/db';
import { tauriInvoke } from './tauriBridge';
import { coverUrlToken } from '../lib/localFiles';

/**
 * Desktop local library (spec §3.1): watched folders scanned by Rust (walkdir), files played via
 * Tauri's asset protocol (which sends CORS headers, so the full Sound Lab works).
 */

interface FileEntry {
  path: string;
  name: string;
  relPath: string;
  size: number;
  mtimeMs: number;
}

const desktopFileId = (path: string, size: number, mtime: number) =>
  `t${fnv1a(`${path}|${size}|${mtime}`).toString(36)}`;

async function assetUrl(path: string): Promise<string> {
  const { convertFileSrc } = await import('@tauri-apps/api/core');
  return convertFileSrc(path);
}

async function readTags(path: string, name: string) {
  const fallback = metadataFromFileName(name);
  try {
    const res = await fetch(await assetUrl(path));
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const { parseBlob } = await import('music-metadata');
    const meta = await parseBlob(blob, { duration: false, skipCovers: false });
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

async function importEntries(
  entries: FileEntry[],
  folderId: string | undefined,
  onProgress?: (d: number, t: number) => void,
): Promise<Track[]> {
  const added: Track[] = [];
  let done = 0;
  const queue = [...entries];
  const worker = async () => {
    while (queue.length) {
      const e = queue.shift() as FileEntry;
      done++;
      const id = desktopFileId(e.path, e.size, e.mtimeMs);
      if (await db.localFiles.get(id)) {
        onProgress?.(done, entries.length);
        continue;
      }
      const tags = await readTags(e.path, e.name);
      const rec: LocalFileRecord = {
        id,
        name: e.name,
        kind: 'tauri',
        size: e.size,
        mtime: e.mtimeMs,
        path: e.path,
        folderId,
        relPath: e.relPath,
        cover: tags.cover,
      };
      const art = tags.cover ? coverUrlToken(id) : undefined;
      const track: Track = {
        key: trackKey('local', id),
        source: 'local',
        id,
        title: tags.title,
        artist: tags.artist,
        album: tags.album,
        genre: tags.genre,
        durationSec: tags.durationSec,
        artwork: art ? { small: art, medium: art, large: art } : undefined,
        local: {
          fileId: id,
          path: e.path,
          folder: e.relPath.split('/').slice(0, -1).join('/') || undefined,
          size: e.size,
          mtime: e.mtimeMs,
          trackNo: tags.trackNo,
          year: tags.year,
          replayGainDb: tags.replayGainDb,
          replayGainAlbumDb: tags.replayGainAlbumDb,
        },
        addedAt: Date.now(),
      };
      await db.transaction('rw', db.localFiles, db.tracks, async () => {
        await db.localFiles.put(rec);
        await db.tracks.put(track);
      });
      added.push(track);
      onProgress?.(done, entries.length);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  return added;
}

/** Pick a folder to watch; scans it recursively. */
export async function addWatchedFolder(): Promise<Track[]> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const picked = await open({ directory: true, multiple: false, title: 'Choose a music folder' });
  if (!picked || Array.isArray(picked)) return [];
  const path = picked;
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const folder: LocalFolderRecord = {
    id: `d${fnv1a(path).toString(36)}`,
    name,
    kind: 'tauri',
    path,
    addedAt: Date.now(),
  };
  await db.folders.put(folder);
  return rescanDesktopFolder(folder);
}

export async function rescanDesktopFolder(folder: LocalFolderRecord): Promise<Track[]> {
  if (!folder.path) return [];
  await tauriInvoke('allow_asset_dir', { path: folder.path });
  const id = toast.loading(`Scanning ${folder.name}…`);
  try {
    const entries = await tauriInvoke<FileEntry[]>('scan_folder', { path: folder.path });
    const present = new Set(entries.map((e) => desktopFileId(e.path, e.size, e.mtimeMs)));
    const known = await db.localFiles.where('folderId').equals(folder.id).toArray();
    for (const k of known) {
      if (!present.has(k.id)) {
        const t = await db.tracks.get(trackKey('local', k.id));
        if (t?.local) await db.tracks.put({ ...t, local: { ...t.local, missing: true } });
      }
    }
    const added = await importEntries(entries, folder.id, (d, t) =>
      toast.loading(`Scanning ${folder.name}… ${d}/${t}`, { id }),
    );
    await db.folders.update(folder.id, { lastScan: Date.now() });
    toast.success(
      `${folder.name}: ${added.length} new song${added.length === 1 ? '' : 's'} (${entries.length} total)`,
      { id },
    );
    return added;
  } catch (e) {
    toast.error(`Couldn't scan ${folder.name}`, {
      id,
      description: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/** Open files passed on the command line / "Open with Tuneshift". Returns the imported tracks. */
export async function openDesktopFiles(paths: string[]): Promise<Track[]> {
  const audio = paths.filter((p) => isAudioFileName(p));
  if (!audio.length) return [];
  const entries: FileEntry[] = [];
  for (const path of audio) {
    try {
      await tauriInvoke('allow_asset_file', { path });
      const res = await fetch(await assetUrl(path), { method: 'HEAD' });
      const size = Number(res.headers.get('content-length') ?? 0);
      const name = path.split(/[\\/]/).pop() ?? path;
      entries.push({ path, name, relPath: name, size, mtimeMs: 0 });
    } catch {
      // unreadable file: skipped below
    }
  }
  const added = await importEntries(entries, undefined);
  const keys = entries.map((e) => trackKey('local', desktopFileId(e.path, e.size, e.mtimeMs)));
  const all = (await db.tracks.bulkGet(keys)).filter((t): t is Track => Boolean(t));
  return all.length ? all : added;
}

/** Asset-protocol scope resets every launch: re-allow saved folders and files. */
export async function restoreAssetScopes(): Promise<void> {
  const folders = (await db.folders.toArray()).filter((f) => f.kind === 'tauri' && f.path);
  for (const f of folders)
    await tauriInvoke('allow_asset_dir', { path: f.path }).catch(() => undefined);
  const loose = await db.localFiles
    .where('kind')
    .equals('tauri')
    .filter((r) => !r.folderId && Boolean(r.path))
    .toArray();
  for (const r of loose)
    await tauriInvoke('allow_asset_file', { path: r.path }).catch(() => undefined);
}
