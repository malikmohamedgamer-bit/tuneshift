import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Reorder } from 'motion/react';
import { AudioWaveform, Copy, GripVertical, ImagePlus, Share2, Trash2 } from 'lucide-react';
import { encodeShareCode, type SharedTrack, type Track } from '@tuneshift/core';
import { Button, IconButton } from '@tuneshift/ui';
import { toast } from 'sonner';
import { CollectionHeader } from '../components/CollectionHeader';
import { Artwork, EmptyState } from '../components/common';
import { TrackRow } from '../components/TrackList';
import { db } from '../db/db';
import {
  deletePlaylist,
  duplicatePlaylist,
  getAssignment,
  movePlaylistTrack,
  playlistAssignmentId,
  removeFromPlaylist,
  resolveSoundRef,
  savePlaylist,
} from '../db/library';
import { blobToDataUrl, pickImage, resizeImage } from '../lib/images';
import { player } from '../player/controller';
import { useUi } from '../state/ui';
import { useAllThemes } from '../state/theme';
import { publicSiteUrl } from '../env';

function Mosaic({ tracks }: { tracks: Track[] }) {
  const arts = tracks.filter((t) => t.artwork).slice(0, 4);
  if (arts.length < 4)
    return (
      <Artwork
        art={tracks[0]?.artwork}
        alt=""
        size="large"
        className="h-44 w-44 shadow-theme sm:h-52 sm:w-52"
        rounded="rounded-panel"
        seed={tracks[0]?.title ?? 'playlist'}
      />
    );
  return (
    <div
      className="grid h-44 w-44 shrink-0 grid-cols-2 overflow-hidden rounded-panel shadow-theme sm:h-52 sm:w-52"
      aria-hidden="true"
    >
      {arts.map((t) => (
        <Artwork
          key={t.key}
          art={t.artwork}
          alt=""
          size="small"
          className="h-full w-full"
          rounded="rounded-none"
          seed={t.title}
        />
      ))}
    </div>
  );
}

export function sharedTracks(tracks: Track[]): SharedTrack[] {
  return tracks
    .filter(
      (t): t is Track & { source: 'audius' | 'jamendo' } =>
        t.source === 'audius' || t.source === 'jamendo',
    )
    .map((t) => ({
      key: t.key,
      source: t.source,
      id: t.id,
      title: t.title,
      artist: t.artist,
      durationSec: t.durationSec,
      artwork: t.artwork?.medium,
      permalink: t.permalink,
    }));
}

export function PlaylistPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const setUi = useUi((s) => s.set);
  const themes = useAllThemes();
  const playlist = useLiveQuery(() => db.playlists.get(id), [id]);
  const tracks = useLiveQuery(async () => {
    if (!playlist) return [];
    const rows = await db.tracks.bulkGet(playlist.trackKeys);
    return playlist.trackKeys.map(
      (k, i) =>
        rows[i] ??
        ({
          key: k,
          source: 'audius',
          id: k,
          title: 'Unavailable song',
          artist: '—',
          durationSec: 0,
        } as Track),
    );
  }, [playlist?.trackKeys.join('|')]);
  const assigned = useLiveQuery(async () => {
    const ref = await getAssignment(playlistAssignmentId(id));
    return ref ? (await resolveSoundRef(ref)).label : null;
  }, [id]);
  const [items, setItems] = useState<{ uid: string; track: Track; index: number }[]>([]);
  useEffect(
    () => setItems((tracks ?? []).map((t, i) => ({ uid: `${t.key}#${i}`, track: t, index: i }))),
    [tracks],
  );
  if (playlist === undefined) return null;
  if (!playlist || playlist.deleted)
    return <EmptyState title="Playlist not found" body="It may have been deleted." />;
  const list = tracks ?? [];
  const ctx = { name: playlist.name, kind: 'playlist', id: playlist.id };
  const setCover = async () => {
    const f = await pickImage();
    if (!f) return;
    try {
      const dataUrl = await blobToDataUrl(await resizeImage(f, 512));
      await savePlaylist({ ...playlist, coverDataUrl: dataUrl });
    } catch (e) {
      toast.error("Couldn't use that image", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };
  const remove = async () => {
    const undo = await deletePlaylist(playlist.id);
    void nav('/library');
    toast.success(`Deleted “${playlist.name}”`, {
      action: { label: 'Undo', onClick: () => void undo() },
      duration: 8000,
    });
  };
  const share = async () => {
    const shareable = sharedTracks(list);
    if (!shareable.length) {
      toast.error('Only Audius/Jamendo songs can be shared — this playlist has none.');
      return;
    }
    const code = encodeShareCode({
      kind: 'playlist',
      data: { name: playlist.name, description: playlist.description, tracks: shareable },
    });
    const url = `${publicSiteUrl()}s/${code}`;
    await navigator.clipboard.writeText(url);
    toast.success('Share link copied', {
      description:
        shareable.length < list.length
          ? `${list.length - shareable.length} local songs were left out (they're only on this device).`
          : undefined,
    });
  };
  return (
    <div>
      <CollectionHeader
        kind="Playlist"
        title={playlist.name}
        tracks={list}
        context={ctx}
        cover={
          <div className="group relative shrink-0">
            {playlist.coverDataUrl ? (
              <img
                src={playlist.coverDataUrl}
                alt={`${playlist.name} cover`}
                className="h-44 w-44 rounded-panel object-cover shadow-theme sm:h-52 sm:w-52"
              />
            ) : (
              <Mosaic tracks={list} />
            )}
            <button
              type="button"
              onClick={() => void setCover()}
              className="absolute inset-0 grid place-items-center rounded-panel bg-black/50 text-white opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
              aria-label="Change cover image"
            >
              <ImagePlus />
            </button>
          </div>
        }
        subtitle={
          <span>
            {list.length} songs{assigned ? ` · always plays with ${assigned}` : ''}
            {playlist.coverDataUrl && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => void savePlaylist({ ...playlist, coverDataUrl: undefined })}
              >
                Use auto cover
              </button>
            )}
          </span>
        }
      >
        <Button
          icon={<AudioWaveform size={16} />}
          onClick={() =>
            setUi({ assignFor: { kind: 'playlist', id: playlist.id, name: playlist.name } })
          }
        >
          Sound
        </Button>
        <IconButton label="Share playlist" onClick={() => void share()}>
          <Share2 size={18} />
        </IconButton>
        <IconButton
          label="Duplicate playlist"
          onClick={() =>
            void duplicatePlaylist(playlist.id).then(
              (p) => p && toast.success(`Created “${p.name}”`),
            )
          }
        >
          <Copy size={18} />
        </IconButton>
        <IconButton label="Delete playlist" onClick={() => void remove()}>
          <Trash2 size={18} />
        </IconButton>
      </CollectionHeader>
      <div className="mb-6 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Name
          <input
            defaultValue={playlist.name}
            key={`n-${playlist.updatedAt}`}
            onBlur={(e) =>
              e.target.value.trim() &&
              e.target.value !== playlist.name &&
              void savePlaylist({ ...playlist, name: e.target.value.trim() })
            }
            className="rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Description
          <input
            defaultValue={playlist.description}
            key={`d-${playlist.updatedAt}`}
            placeholder="Add a description"
            onBlur={(e) =>
              e.target.value !== (playlist.description ?? '') &&
              void savePlaylist({ ...playlist, description: e.target.value })
            }
            className="rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-fg"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Theme while playing
          <select
            value={playlist.themeId ?? ''}
            onChange={(e) => void savePlaylist({ ...playlist, themeId: e.target.value || null })}
            className="rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-fg"
          >
            <option value="">App theme</option>
            {themes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {list.length ? (
        <Reorder.Group
          axis="y"
          values={items}
          onReorder={setItems}
          className="flex flex-col"
          aria-label={`${playlist.name} songs`}
        >
          {items.map((it, i) => (
            <Reorder.Item
              key={it.uid}
              value={it}
              className="flex items-center gap-1"
              onDragEnd={() => {
                const from = it.index;
                const to = items.findIndex((x) => x.uid === it.uid);
                if (from !== to) void movePlaylistTrack(playlist.id, from, to);
              }}
            >
              <GripVertical
                size={14}
                className="shrink-0 cursor-grab text-muted"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <TrackRow
                  track={it.track}
                  index={i}
                  numbered
                  onPlay={() => void player.playTracks(list, it.index, ctx)}
                  menu={{
                    playlistId: playlist.id,
                    index: it.index,
                    total: list.length,
                    onMove: (from, to) => void movePlaylistTrack(playlist.id, from, to),
                    onRemove: () => void removeFromPlaylist(playlist.id, it.index),
                  }}
                />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      ) : (
        <EmptyState
          title="This playlist is empty"
          body="Use “Add to playlist” in any song's menu, or save a queue here."
          action={<Button onClick={() => void nav('/search')}>Find songs</Button>}
        />
      )}
    </div>
  );
}
