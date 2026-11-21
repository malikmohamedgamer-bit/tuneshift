import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Reorder } from 'motion/react';
import {
  Copy,
  Download,
  FileDown,
  FileUp,
  GripVertical,
  Headphones,
  Pencil,
  RotateCcw,
  Save,
  Share2,
  Star,
  Trash2,
} from 'lucide-react';
import { decodeShareCode, encodeShareCode, migrateSound, type SavedSound } from '@tuneshift/core';
import { VISUALIZER_MODES, type PitchStatus, type VisualizerMode } from '@tuneshift/audio';
import {
  Badge,
  Button,
  cn,
  IconButton,
  Segmented,
  SoundLabControls,
  Switch,
  Tip,
} from '@tuneshift/ui';
import { toast } from 'sonner';
import { z } from 'zod';
import { Artwork, CapabilityBadge, PageHeader, SectionHeader } from '../components/common';
import { PresetBadge } from '../components/player/PlayerControls';
import { VisualizerCanvas } from '../components/player/VisualizerCanvas';
import { player } from '../player/controller';
import { askText } from '../components/Ask';
import { usePlayer } from '../state/player';
import { useSettings } from '../state/settings';
import { useSound } from '../state/sound';
import { useUi } from '../state/ui';
import {
  createSound,
  deleteSound,
  duplicateSound,
  listSounds,
  reorderSounds,
  setAssignment,
  songAssignmentId,
  updateSound,
} from '../db/library';
import { downloadBlob } from '../lib/images';
import { publicSiteUrl } from '../env';

const ExportFile = z.object({
  app: z.literal('tuneshift'),
  kind: z.literal('sounds'),
  sounds: z.array(
    z.object({ name: z.string(), settings: z.unknown(), favourite: z.boolean().optional() }),
  ),
});

function ABButton() {
  const comparing = usePlayer((s) => s.comparing);
  const start = () => player.setCompare(true);
  const stop = () => player.setCompare(false);
  return (
    <Tip content="Hold to hear the original sound (or hold B)">
      <button
        type="button"
        aria-pressed={comparing}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && start()}
        onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && stop()}
        className={cn(
          'h-10 select-none rounded-full border px-4 text-sm font-bold transition',
          comparing
            ? 'border-accent bg-accent-fill text-on-accent'
            : 'border-line bg-surface hover:bg-surface-hover',
        )}
        data-testid="ab-compare"
      >
        {comparing ? 'Original (A)' : 'Hold for A/B'}
      </button>
    </Tip>
  );
}

function MySounds() {
  const sounds = useLiveQuery(() => listSounds(), [], []);
  const current = useSound((s) => s.settings);
  const activeRef = useSound((s) => s.ref);
  const defaultSound = useSettings((s) => s.defaultSound);
  const setSettings = useSettings((s) => s.set);
  const track = usePlayer((s) => s.current);
  const [name, setName] = useState('');
  const [order, setOrder] = useState<SavedSound[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const list = order ?? sounds;
  const save = async () => {
    const s = await createSound(name || 'My sound', current);
    player.applySound(s.settings, { kind: 'saved', id: s.id }, s.name);
    setName('');
    toast.success(`Saved “${s.name}”`);
  };
  const exportAll = () => {
    const data = {
      app: 'tuneshift',
      kind: 'sounds',
      exportedAt: Date.now(),
      sounds: sounds.map((s) => ({ name: s.name, settings: s.settings, favourite: s.favourite })),
    };
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      'tuneshift-sounds.json',
    );
  };
  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const parsed = ExportFile.parse(JSON.parse(await f.text()));
        for (const s of parsed.sounds) {
          const created = await createSound(s.name, migrateSound(s.settings));
          if (s.favourite) await updateSound(created.id, { favourite: true });
        }
        toast.success(
          `Imported ${parsed.sounds.length} sound${parsed.sounds.length === 1 ? '' : 's'}`,
        );
      } catch {
        toast.error("That file isn't a Tuneshift sounds export");
      }
    };
    input.click();
  };
  const importCode = async () => {
    const code = await askText({
      title: 'Add a shared sound',
      label: 'Paste a sound code or link',
      placeholder: 'ts1.s.… or https://…/s/…',
    });
    if (!code) return;
    try {
      const p = decodeShareCode(code);
      if (p.kind !== 'sound') throw new Error(`That code is a ${p.kind}, not a sound`);
      const s = await createSound(p.data.name, p.data.settings);
      player.applySound(s.settings, { kind: 'saved', id: s.id }, s.name);
      toast.success(`Added “${s.name}” to My Sounds`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid code');
    }
  };
  const share = async (s: SavedSound) => {
    const code = encodeShareCode({ kind: 'sound', data: { name: s.name, settings: s.settings } });
    await navigator.clipboard.writeText(`${publicSiteUrl()}s/${code}`);
    toast.success('Share link copied', { description: 'Friends can open it to add this sound.' });
  };
  return (
    <section className="rounded-card border border-line bg-surface p-4" aria-labelledby="mysounds">
      <SectionHeader
        title="My Sounds"
        subtitle="Adjust the sliders below, then save your sound here"
      />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          id="mysounds"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder="Name your sound (e.g. Car mix)"
          aria-label="Sound name"
          className="h-10 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm"
          data-testid="sound-name"
        />
        <Button type="submit" variant="primary" icon={<Save size={15} />} data-testid="save-sound">
          Save
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" icon={<FileUp size={14} />} onClick={importFile}>
          Import JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<FileDown size={14} />}
          onClick={exportAll}
          disabled={!sounds.length}
        >
          Export JSON
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={<Share2 size={14} />}
          onClick={() => void importCode()}
        >
          Paste a code
        </Button>
      </div>
      {list.length > 0 && (
        <Reorder.Group
          axis="y"
          values={list}
          onReorder={setOrder}
          className="mt-3 flex flex-col gap-1"
          aria-label="Saved sounds"
          data-testid="my-sounds"
        >
          {list.map((s) => {
            const active = activeRef?.kind === 'saved' && activeRef.id === s.id;
            const isDefault = defaultSound.kind === 'saved' && defaultSound.id === s.id;
            return (
              <Reorder.Item
                key={s.id}
                value={s}
                onDragEnd={() =>
                  order && void reorderSounds(order.map((x) => x.id)).then(() => setOrder(null))
                }
                className={cn(
                  'flex items-center gap-2 rounded-ctl px-2 py-1.5',
                  active ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                )}
              >
                <GripVertical
                  size={14}
                  className="shrink-0 cursor-grab text-muted"
                  aria-hidden="true"
                />
                {editing === s.id ? (
                  <input
                    autoFocus
                    defaultValue={s.name}
                    aria-label="Rename sound"
                    className="min-w-0 flex-1 rounded-chip border border-line bg-bg px-2 py-1 text-sm"
                    onBlur={(e) => {
                      if (e.target.value.trim())
                        void updateSound(s.id, { name: e.target.value.trim().slice(0, 60) });
                      setEditing(null);
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                    onClick={() =>
                      player.applySound(s.settings, { kind: 'saved', id: s.id }, s.name)
                    }
                  >
                    {s.name} {isDefault && <Badge tone="accent">Default</Badge>}
                  </button>
                )}
                <IconButton
                  label={s.favourite ? `Unfavourite ${s.name}` : `Favourite ${s.name}`}
                  size="sm"
                  active={s.favourite}
                  onClick={() => void updateSound(s.id, { favourite: !s.favourite })}
                >
                  <Star size={15} fill={s.favourite ? 'currentColor' : 'none'} />
                </IconButton>
                <IconButton label={`Rename ${s.name}`} size="sm" onClick={() => setEditing(s.id)}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton
                  label={`Duplicate ${s.name}`}
                  size="sm"
                  onClick={() => void duplicateSound(s.id)}
                >
                  <Copy size={14} />
                </IconButton>
                <IconButton label={`Share ${s.name}`} size="sm" onClick={() => void share(s)}>
                  <Share2 size={14} />
                </IconButton>
                <IconButton
                  label={`Delete ${s.name}`}
                  size="sm"
                  onClick={() =>
                    void deleteSound(s.id).then((undo) =>
                      toast.success(`Deleted “${s.name}”`, {
                        action: { label: 'Undo', onClick: () => void undo() },
                      }),
                    )
                  }
                >
                  <Trash2 size={14} />
                </IconButton>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
      )}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-3">
        <Button
          size="sm"
          variant="outline"
          disabled={!activeRef}
          onClick={() => {
            if (!activeRef) return;
            setSettings({ defaultSound: activeRef });
            toast.success('Set as your default sound');
          }}
        >
          Make current sound my default
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!track || !activeRef}
          onClick={() => {
            if (!track || !activeRef) return;
            void setAssignment(songAssignmentId(track.key), activeRef).then(() =>
              toast.success(`“${track.title}” will always play with this sound`),
            );
          }}
        >
          Always use for this song
        </Button>
        {!activeRef && (
          <span className="self-center text-xs text-muted">
            Save the sound first to make it a default or assign it.
          </span>
        )}
      </div>
    </section>
  );
}

export function SoundLab() {
  const sound = useSound((s) => s.settings);
  const origin = useSound((s) => s.origin);
  const track = usePlayer((s) => s.current);
  const mode = usePlayer((s) => s.mode);
  const handoff = usePlayer((s) => s.backgroundHandoff);
  const vizMode = useSettings((s) => s.visualizer);
  const showViz = useSettings((s) => s.showVisualizer);
  const setSettings = useSettings((s) => s.set);
  const setUi = useUi((s) => s.set);
  const [pitch, setPitch] = useState<PitchStatus>(player.engine.chain?.pitchStatus ?? 'idle');
  useEffect(() => player.engine.chain?.onPitchStatus(setPitch), [track?.key]);
  const graphReason =
    mode === 'direct' && !handoff
      ? "This source doesn't allow audio processing — only speed and tape-pitch presets work on it."
      : handoff
        ? 'Background-safe mode is active while the app is hidden — effects return when you come back.'
        : undefined;
  const pitchReason =
    pitch === 'unavailable'
      ? `Independent pitch isn't available in this browser (${player.engine.chain?.pitchUnavailableReason || 'worklet blocked'}).`
      : undefined;
  const originText =
    origin === 'song'
      ? 'set for this song'
      : origin === 'playlist'
        ? 'set for this playlist'
        : origin === 'global'
          ? 'your default sound'
          : 'your pick — stays on for the next songs';
  return (
    <div className="space-y-6">
      <PageHeader title="Sound Lab" subtitle="Everything applies live to what's playing.">
        <ABButton />
        <Button
          variant="ghost"
          icon={<RotateCcw size={15} />}
          onClick={() => void player.resetSoundToDefault()}
        >
          Reset to default
        </Button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="flex items-center gap-4 rounded-card border border-line bg-surface p-4">
          {track ? (
            <>
              <Artwork
                art={track.artwork}
                alt=""
                size="small"
                className="h-16 w-16"
                seed={track.title}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{track.title}</div>
                <div className="truncate text-sm text-muted">{track.artist}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <PresetBadge />
                  <span className="text-xs text-muted">{originText}</span>
                  <CapabilityBadge track={track} mode={mode} />
                </div>
              </div>
              {track.source === 'local' && (
                <Button
                  size="sm"
                  icon={<Download size={14} />}
                  onClick={() => setUi({ exportFor: track })}
                >
                  Export
                </Button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 text-sm text-muted">
              <Headphones /> Nothing is playing — changes apply as soon as you play something.
            </div>
          )}
        </div>
        <div className="relative h-28 overflow-hidden rounded-card border border-line bg-surface p-2">
          {showViz && mode === 'fx' ? (
            <VisualizerCanvas mode={vizMode === 'glow' ? 'bars' : vizMode} />
          ) : (
            <p className="grid h-full place-items-center text-xs text-muted">
              {mode === 'direct' ? 'Visualizer needs Full Sound Lab' : 'Visualizer'}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Visualizer"
          size="sm"
          value={vizMode}
          onChange={(v: VisualizerMode) => setSettings({ visualizer: v })}
          options={VISUALIZER_MODES.map((m) => ({ value: m.id, label: m.label }))}
        />
        <Switch
          label="Show visualizer"
          checked={showViz}
          onChange={(v) => setSettings({ showVisualizer: v })}
        />
      </div>
      <SoundLabControls
        value={sound}
        onChange={(s) => player.applySound(s)}
        limits={{ graph: graphReason, pitch: pitchReason }}
        headroom={() => player.engine.chain?.headroom() ?? null}
        keyHints
        pitchNote={
          sound.pitchMode === 'independent' && pitch === 'loading'
            ? 'Loading the pitch engine…'
            : undefined
        }
      />
      <MySounds />
    </div>
  );
}
