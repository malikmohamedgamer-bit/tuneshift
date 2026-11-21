import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Reorder } from 'motion/react';
import {
  Copy,
  FileMusic,
  FolderOpen,
  FolderPlus,
  Heart,
  ListMusic,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import {
  findDuplicates,
  formatDuration,
  formatRelative,
  type Playlist,
  type Track,
} from '@tuneshift/core';
import { Button, cn, IconButton, Segmented } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Artwork, EmptyState, PageHeader, SectionHeader } from '../components/common';
import { TrackList } from '../components/TrackList';
import { db, type LocalFolderRecord } from '../db/db';
import {
  clearHistory,
  createFolder,
  createPlaylist,
  createSmartPlaylist,
  deleteFolder,
  reorderPlaylists,
  saveFolder,
  savePlaylist,
} from '../db/library';
import {
  importItems,
  pickFiles,
  pickFolder,
  removeFolder,
  removeLocalFiles,
  rescanFolder,
  type ImportItem,
} from '../lib/localFiles';
import { useHistory } from '../lib/queries';
import { player } from '../player/controller';
import { isTauri, supportsFileSystemAccess } from '../platform/detect';

type Tab = 'playlists' | 'songs' | 'albums' | 'artists' | 'folders' | 'history';

export async function runImport(
  get: () => Promise<ImportItem[]>,
  label = 'Adding music',
): Promise<Track[]> {
  let items: ImportItem[];
  try {
    items = await get();
  } catch (e) {
    toast.error("Couldn't open the picker", {
      description: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
  if (!items.length) return [];
  const id = toast.loading(`${label}…`);
  const res = await importItems(items, (d, t) => toast.loading(`${label}… ${d}/${t}`, { id }));
  toast.success(`Added ${res.added.length} song${res.added.length === 1 ? '' : 's'}`, {
    id,
    description:
      [
        res.skipped ? `${res.skipped} already in library` : '',
        res.failed.length ? `${res.failed.length} couldn't be read` : '',
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
  });
  return res.added;
}

export function AddMusicButtons({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const desktop = isTauri();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        size={compact ? 'sm' : 'md'}
        icon={<Upload size={16} />}
        onClick={() => void runImport(pickFiles)}
      >
        Add files
      </Button>
      <Button
        size={compact ? 'sm' : 'md'}
        icon={<FolderOpen size={16} />}
        onClick={() =>
          void (desktop
            ? nav('/settings/sources')
            : runImport(async () => (await pickFolder()).items, 'Scanning folder'))
        }
      >
        {desktop ? 'Watched folders' : 'Add folder'}
      </Button>
    </div>
  );
}

function PlaylistsTab() {
  const nav = useNavigate();
  const playlists = useLiveQuery(
    async () => (await db.playlists.orderBy('order').toArray()).filter((p) => !p.deleted),
    [],
    [],
  );
  const folders = useLiveQuery(
    async () => (await db.playlistFolders.orderBy('order').toArray()).filter((f) => !f.deleted),
    [],
    [],
  );
  const smart = useLiveQuery(
    async () => (await db.smartPlaylists.toArray()).filter((s) => !s.deleted),
    [],
    [],
  );
  const likedCount = useLiveQuery(
    async () => (await db.likes.toArray()).filter((l) => !l.deleted).length,
    [],
    0,
  );
  const [order, setOrder] = useState<Playlist[] | null>(null);
  const list = order ?? playlists;
  const groups = [
    { id: null as string | null, name: '' },
    ...folders.map((f) => ({ id: f.id as string | null, name: f.name })),
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={<Plus size={16} />}
          onClick={() => void createPlaylist('New playlist').then((p) => nav(`/playlist/${p.id}`))}
        >
          New playlist
        </Button>
        <Button
          icon={<Sparkles size={16} />}
          onClick={() =>
            void createSmartPlaylist('Smart playlist').then((p) => nav(`/smart/${p.id}`))
          }
        >
          New smart playlist
        </Button>
        <Button icon={<FolderPlus size={16} />} onClick={() => void createFolder('New folder')}>
          New folder
        </Button>
        <Link
          to="/import"
          className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          <FileMusic size={16} /> Import from text/CSV
        </Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Link
          to="/library/liked"
          className="flex items-center gap-3 rounded-card bg-hero p-4 text-white"
        >
          <Heart size={28} fill="currentColor" />
          <div>
            <div className="font-display text-lg font-bold">Liked songs</div>
            <div className="text-sm text-white/85">{likedCount} songs</div>
          </div>
        </Link>
        {smart.map((s) => (
          <Link
            key={s.id}
            to={`/smart/${s.id}`}
            className="flex items-center gap-3 rounded-card bg-surface p-4 hover:bg-surface-hover"
          >
            <Wand2 className="text-accent-text" />
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-xs text-muted">Smart playlist · updates live</div>
            </div>
          </Link>
        ))}
      </div>
      {groups.map((g) => {
        const items = list.filter((p) => (p.folderId ?? null) === g.id);
        if (g.id && !items.length && !folders.length) return null;
        return (
          <section key={g.id ?? 'root'}>
            {g.id && (
              <div className="mb-2 flex items-center gap-2">
                <FolderOpen size={16} className="text-muted" />
                <input
                  aria-label="Folder name"
                  defaultValue={g.name}
                  onBlur={(e) => {
                    const f = folders.find((x) => x.id === g.id);
                    if (f && e.target.value.trim() && e.target.value !== f.name)
                      void saveFolder({ ...f, name: e.target.value.trim() });
                  }}
                  className="bg-transparent font-display font-bold outline-none focus:underline"
                />
                <IconButton
                  label={`Delete folder ${g.name}`}
                  size="sm"
                  onClick={() => void deleteFolder(g.id as string)}
                >
                  <Trash2 size={14} />
                </IconButton>
              </div>
            )}
            {items.length ? (
              <Reorder.Group
                axis="y"
                values={items}
                onReorder={(next: Playlist[]) =>
                  setOrder([...list.filter((p) => (p.folderId ?? null) !== g.id), ...next])
                }
                className="flex flex-col gap-1"
              >
                {items.map((p) => (
                  <Reorder.Item
                    key={p.id}
                    value={p}
                    onDragEnd={() => {
                      if (order)
                        void reorderPlaylists(order.map((x) => x.id)).then(() => setOrder(null));
                    }}
                    className="flex items-center gap-3 rounded-ctl bg-surface/60 p-2 hover:bg-surface-hover"
                  >
                    {p.coverDataUrl ? (
                      <img
                        src={p.coverDataUrl}
                        alt=""
                        className="h-12 w-12 rounded-chip object-cover"
                      />
                    ) : (
                      <div className="grid h-12 w-12 place-items-center rounded-chip bg-surface-hover">
                        <ListMusic size={18} />
                      </div>
                    )}
                    <Link to={`/playlist/${p.id}`} className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{p.name}</div>
                      <div className="text-xs text-muted">{p.trackKeys.length} songs</div>
                    </Link>
                    {folders.length > 0 && (
                      <select
                        aria-label={`Folder for ${p.name}`}
                        className="rounded-chip border border-line bg-surface px-2 py-1 text-xs"
                        value={p.folderId ?? ''}
                        onChange={(e) =>
                          void savePlaylist({ ...p, folderId: e.target.value || null })
                        }
                      >
                        <option value="">No folder</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            ) : (
              g.id === null && (
                <EmptyState
                  icon={<ListMusic />}
                  title="No playlists yet"
                  body="Create one, or save any queue/album as a playlist."
                />
              )
            )}
          </section>
        );
      })}
    </div>
  );
}

type SortKey = 'title' | 'artist' | 'album' | 'added' | 'duration';

function useLocalTracks(): Track[] {
  return useLiveQuery(() => db.tracks.where('source').equals('local').toArray(), [], []);
}

function SongsTab() {
  const tracks = useLocalTracks();
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortKey>('added');
  const sorted = useMemo(() => {
    const f = filter.toLowerCase();
    const list = tracks.filter(
      (t) => !f || `${t.title} ${t.artist} ${t.album ?? ''}`.toLowerCase().includes(f),
    );
    const key: Record<SortKey, (t: Track) => string | number> = {
      title: (t) => t.title.toLowerCase(),
      artist: (t) => t.artist.toLowerCase(),
      album: (t) => (t.album ?? '').toLowerCase(),
      added: (t) => -(t.addedAt ?? 0),
      duration: (t) => t.durationSec,
    };
    return [...list].sort((a, b) =>
      key[sort](a) < key[sort](b) ? -1 : key[sort](a) > key[sort](b) ? 1 : 0,
    );
  }, [tracks, filter, sort]);
  const dupes = useMemo(() => findDuplicates(tracks), [tracks]);
  const missing = tracks.filter((t) => t.local?.missing);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <AddMusicButtons />
        <label className="ml-auto flex items-center gap-2 rounded-full border border-line bg-surface px-3">
          <Search size={15} className="text-muted" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter songs"
            className="h-9 w-40 bg-transparent text-sm outline-none"
          />
        </label>
        <label className="text-sm text-muted">
          Sort{' '}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-chip border border-line bg-surface px-2 py-1 text-fg"
          >
            <option value="added">Date added</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="album">Album</option>
            <option value="duration">Duration</option>
          </select>
        </label>
      </div>
      {!supportsFileSystemAccess() && !isTauri() && (
        <p className="text-xs text-muted">
          This browser can't keep file links, so added files are copied into private app storage
          (see Settings → Data).
        </p>
      )}
      {missing.length > 0 && (
        <div className="flex items-center justify-between rounded-ctl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <span>
            {missing.length} file{missing.length > 1 ? 's are' : ' is'} missing (moved or deleted).
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void removeLocalFiles(missing.map((t) => t.id)).then(() =>
                toast.success('Removed missing files'),
              )
            }
          >
            Remove them
          </Button>
        </div>
      )}
      {dupes.length > 0 && (
        <details className="rounded-ctl border border-line bg-surface px-3 py-2 text-sm">
          <summary className="cursor-pointer">
            <Copy size={14} className="mr-1 inline" /> {dupes.length} possible duplicate
            {dupes.length > 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 space-y-1">
            {dupes.map((g) => (
              <li
                key={g.map((t) => t.key).join()}
                className="flex items-center justify-between gap-2"
              >
                <span className="truncate">
                  {g[0]?.artist} – {g[0]?.title} ×{g.length}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    void removeLocalFiles(g.slice(1).map((t) => t.id)).then(() =>
                      toast.success('Kept one copy'),
                    )
                  }
                >
                  Keep one
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {sorted.length ? (
        <TrackList
          tracks={sorted}
          label="Your songs"
          showAlbum
          context={{ name: 'Your songs', kind: 'local' }}
        />
      ) : (
        <EmptyState
          icon={<Upload />}
          title={filter ? 'No matches' : 'No local music yet'}
          body="Drag audio files anywhere onto the app, or use the buttons above. Everything stays on this device."
        />
      )}
    </div>
  );
}

function GroupTab({ by }: { by: 'album' | 'artist' }) {
  const tracks = useLocalTracks();
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Track[]>();
    for (const t of tracks) {
      const k =
        (by === 'album' ? t.album : t.artist) ||
        (by === 'album' ? 'Unknown album' : 'Unknown artist');
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks, by]);
  if (!groups.length)
    return (
      <EmptyState
        title="Nothing here yet"
        body="Add local music to see it grouped."
        action={<AddMusicButtons compact />}
      />
    );
  if (open) {
    const list = (groups.find(([k]) => k === open)?.[1] ?? []).sort(
      (a, b) => (a.local?.trackNo ?? 0) - (b.local?.trackNo ?? 0),
    );
    return (
      <div>
        <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
          ← All {by === 'album' ? 'albums' : 'artists'}
        </Button>
        <SectionHeader title={open} subtitle={`${list.length} songs`} />
        <TrackList tracks={list} label={open} numbered context={{ name: open, kind: by }} />
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {groups.map(([k, list]) => (
        <button key={k} type="button" onClick={() => setOpen(k)} className="group text-left">
          <Artwork
            art={list.find((t) => t.artwork)?.artwork}
            alt=""
            className="aspect-square w-full"
            rounded={by === 'artist' ? 'rounded-full' : 'rounded-card'}
            seed={k}
          />
          <div className="mt-2 truncate text-sm font-semibold group-hover:underline">{k}</div>
          <div className="text-xs text-muted">{list.length} songs</div>
        </button>
      ))}
    </div>
  );
}

function FoldersTab() {
  const folders = useLiveQuery(() => db.folders.toArray(), [], []);
  const tracks = useLocalTracks();
  const byFolder = useMemo(() => {
    const m = new Map<string, Track[]>();
    for (const t of tracks) {
      const f = t.local?.folder ?? 'Loose files';
      m.set(f, [...(m.get(f) ?? []), t]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tracks]);
  const [open, setOpen] = useState<string | null>(null);
  const rescan = async (f: LocalFolderRecord) => {
    const id = toast.loading(`Rescanning ${f.name}…`);
    try {
      const r = await rescanFolder(f);
      toast.success(`${f.name}: ${r.added.length} new`, { id });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rescan failed', { id });
    }
  };
  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section>
          <SectionHeader title="Linked folders" subtitle="Rescan to pick up new files" />
          <ul className="space-y-1">
            {folders.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-ctl bg-surface px-3 py-2">
                <FolderOpen size={16} />
                <span className="flex-1 truncate">{f.name}</span>
                <span className="text-xs text-muted">
                  {f.lastScan
                    ? `scanned ${formatRelative(f.lastScan)}`
                    : `added ${formatRelative(f.addedAt)}`}
                </span>
                <IconButton label={`Rescan ${f.name}`} size="sm" onClick={() => void rescan(f)}>
                  <RefreshCw size={15} />
                </IconButton>
                <IconButton
                  label={`Remove ${f.name} from library`}
                  size="sm"
                  onClick={() =>
                    void removeFolder(f.id).then(() => toast.success('Folder removed'))
                  }
                >
                  <Trash2 size={15} />
                </IconButton>
              </li>
            ))}
          </ul>
        </section>
      )}
      {open ? (
        <div>
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
            ← All folders
          </Button>
          <SectionHeader title={open} />
          <TrackList
            tracks={byFolder.find(([k]) => k === open)?.[1] ?? []}
            label={open}
            context={{ name: open, kind: 'folder' }}
          />
        </div>
      ) : byFolder.length ? (
        <ul className="space-y-1">
          {byFolder.map(([k, list]) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => setOpen(k)}
                className="flex w-full items-center gap-3 rounded-ctl px-3 py-2 text-left hover:bg-surface-hover"
              >
                <FolderOpen size={16} className="text-muted" />
                <span className="flex-1 truncate">{k}</span>
                <span className="text-xs text-muted">
                  {list.length} songs ·{' '}
                  {formatDuration(list.reduce((n, t) => n + t.durationSec, 0))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={<FolderOpen />}
          title="No folders yet"
          action={<AddMusicButtons compact />}
        />
      )}
    </div>
  );
}

function HistoryTab() {
  const history = useHistory(3000);
  const [q, setQ] = useState('');
  const shown = history
    .filter((h) => !q || `${h.title} ${h.artist}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 500);
  const tracks = useLiveQuery(async () => {
    const rows = await db.tracks.bulkGet([...new Set(shown.map((h) => h.trackKey))]);
    return new Map(rows.filter((t): t is Track => Boolean(t)).map((t) => [t.key, t]));
  }, [shown.map((h) => h.id).join()]);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3">
          <Search size={15} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your history"
            aria-label="Search listening history"
            className="h-9 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Button
          variant="ghost"
          icon={<Trash2 size={15} />}
          disabled={!history.length}
          onClick={() => {
            if (window.confirm('Clear your whole listening history? Stats and Wrapped will reset.'))
              void clearHistory().then(() => toast.success('History cleared'));
          }}
        >
          Clear history
        </Button>
      </div>
      {shown.length ? (
        <ul className="divide-y divide-line">
          {shown.map((h) => {
            const t = tracks?.get(h.trackKey);
            return (
              <li key={h.id} className="flex items-center gap-3 py-2">
                <Artwork
                  art={t?.artwork}
                  alt=""
                  size="small"
                  className="h-10 w-10"
                  seed={h.title}
                />
                <button
                  type="button"
                  disabled={!t}
                  onClick={() => t && void player.playTrack(t)}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <div className="truncate text-sm font-semibold">{h.title}</div>
                  <div className="truncate text-xs text-muted">
                    {h.artist}
                    {h.presetName && h.presetName !== 'Normal' ? ` · ${h.presetName}` : ''}
                  </div>
                </button>
                <span className="shrink-0 text-xs text-muted">{formatRelative(h.playedAt)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title={q ? 'No matches' : 'No listening history yet'}
          body="Songs you play for more than a second show up here."
        />
      )}
    </div>
  );
}

export function Library() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: Tab = raw === 'local' ? 'songs' : ((raw as Tab | null) ?? 'playlists');
  return (
    <div>
      <PageHeader title="Your library" />
      <div className="mb-6 overflow-x-auto">
        <Segmented
          label="Library section"
          value={tab}
          onChange={(t) => setParams({ tab: t })}
          options={[
            { value: 'playlists', label: 'Playlists' },
            { value: 'songs', label: 'Songs' },
            { value: 'albums', label: 'Albums' },
            { value: 'artists', label: 'Artists' },
            { value: 'folders', label: 'Folders' },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>
      <div className={cn(tab === 'playlists' ? '' : 'min-h-[40vh]')}>
        {tab === 'playlists' && <PlaylistsTab />}
        {tab === 'songs' && <SongsTab />}
        {tab === 'albums' && <GroupTab by="album" />}
        {tab === 'artists' && <GroupTab by="artist" />}
        {tab === 'folders' && <FoldersTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}
