import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ListPlus, Palette, Play, Sparkles } from 'lucide-react';
import {
  decodeShareCode,
  isOfflineShareCode,
  soundLabel,
  type SharePayload,
  type Track,
} from '@tuneshift/core';
import { Button } from '@tuneshift/ui';
import { toast } from 'sonner';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/common';
import { TrackList } from '../components/TrackList';
import { createPlaylist, createSound } from '../db/library';
import { rememberTracks } from '../lib/sources';
import { saveCustomTheme } from '../state/theme';
import { useSettings } from '../state/settings';
import { player } from '../player/controller';
import { fetchShortShare } from '../lib/social';

function toTracks(p: Extract<SharePayload, { kind: 'playlist' }>): Track[] {
  return p.data.tracks.map((t) => ({
    key: t.key,
    source: t.source,
    id: t.id,
    title: t.title,
    artist: t.artist,
    durationSec: t.durationSec,
    artwork: t.artwork ? { small: t.artwork, medium: t.artwork, large: t.artwork } : undefined,
    permalink: t.permalink,
  }));
}

/** Public share link page: preview + "Add to my library" (spec §8 Sharing). */
export function SharePage() {
  const { code = '' } = useParams();
  const nav = useNavigate();
  const setSettings = useSettings((s) => s.set);
  const q = useQuery({
    queryKey: ['share', code],
    queryFn: async (): Promise<SharePayload> =>
      isOfflineShareCode(code) ? decodeShareCode(code) : fetchShortShare(code),
    retry: false,
  });
  if (q.isLoading) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState title="This share link didn't work" error={q.error} />;
  const p = q.data;
  if (!p) return <EmptyState title="Nothing to show" />;
  if (p.kind === 'sound') {
    const add = async () => {
      const s = await createSound(p.data.name, p.data.settings);
      player.applySound(s.settings, { kind: 'saved', id: s.id }, s.name);
      toast.success(`Added “${s.name}” to My Sounds`);
      void nav('/lab');
    };
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader
          title={p.data.name}
          subtitle={`A shared sound · ${soundLabel(p.data.settings)}`}
        />
        <ul className="grid grid-cols-2 gap-2 text-sm">
          <li className="rounded-ctl bg-surface p-3">Speed {p.data.settings.speed.toFixed(2)}×</li>
          <li className="rounded-ctl bg-surface p-3">Bass +{p.data.settings.bassBoostDb} dB</li>
          <li className="rounded-ctl bg-surface p-3">
            Reverb {Math.round(p.data.settings.reverb.amount * 100)}%
          </li>
          <li className="rounded-ctl bg-surface p-3">
            8D {p.data.settings.eightD.enabled ? 'on' : 'off'}
          </li>
        </ul>
        <div className="flex gap-2">
          <Button variant="primary" icon={<Sparkles size={16} />} onClick={() => void add()}>
            Add to my library
          </Button>
          <Button onClick={() => player.applySound(p.data.settings, null, p.data.name)}>
            Try it now
          </Button>
        </div>
      </div>
    );
  }
  if (p.kind === 'theme') {
    const t = p.data;
    const add = async () => {
      const rec = await saveCustomTheme({
        ...t,
        id: t.id.startsWith('custom-') ? t.id : `custom-${t.id}`,
      });
      setSettings({ themeId: rec.id });
      toast.success(`Theme “${t.name}” added and applied`);
    };
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <PageHeader title={t.name} subtitle="A shared theme" />
        <div
          className="overflow-hidden rounded-card border border-line"
          style={{ background: t.tokens.bg, color: t.tokens.text }}
        >
          <div
            className="h-24"
            style={{
              backgroundImage: `linear-gradient(${t.gradient.angle}deg, ${t.gradient.stops.join(', ')})`,
            }}
          />
          <div className="space-y-2 p-4">
            <div className="font-bold">Preview</div>
            <div style={{ color: t.tokens.textMuted }}>Muted text sample</div>
            <span
              className="inline-block rounded-full px-3 py-1 text-sm font-bold"
              style={{ background: t.tokens.accent, color: t.tokens.accentContrast }}
            >
              Button
            </span>
          </div>
        </div>
        <Button variant="primary" icon={<Palette size={16} />} onClick={() => void add()}>
          Add to my library
        </Button>
      </div>
    );
  }
  const tracks = toTracks(p);
  const add = async () => {
    await rememberTracks(tracks);
    const pl = await createPlaylist(
      p.data.name,
      tracks.map((t) => t.key),
    );
    toast.success(`Added “${pl.name}” to your playlists`);
    void nav(`/playlist/${pl.id}`);
  };
  return (
    <div className="space-y-4">
      <PageHeader
        title={p.data.name}
        subtitle={`A shared playlist · ${tracks.length} songs${p.data.description ? ` · ${p.data.description}` : ''}`}
      >
        <Button variant="primary" icon={<ListPlus size={16} />} onClick={() => void add()}>
          Add to my library
        </Button>
        <Button
          icon={<Play size={16} />}
          onClick={() => void player.playTracks(tracks, 0, { name: p.data.name, kind: 'shared' })}
        >
          Play
        </Button>
      </PageHeader>
      <TrackList
        tracks={tracks}
        label={p.data.name}
        context={{ name: p.data.name, kind: 'shared' }}
      />
    </div>
  );
}
