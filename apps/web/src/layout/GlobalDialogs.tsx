import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Command } from 'cmdk';
import { Dialog } from 'radix-ui';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, LoaderCircle, Music, Search, Sparkles } from 'lucide-react';
import {
  cloneSound,
  presetSettings,
  SOUND_PRESETS,
  type SoundRef,
  type Track,
} from '@tuneshift/core';
import {
  EXPORT_FORMATS,
  exportFileName,
  exportWithEffects,
  type ExportFormat,
  type ExportPhase,
} from '@tuneshift/audio/export';
import { findVersions } from '@tuneshift/sources';
import { Button, cn, Segmented } from '@tuneshift/ui';
import { toast } from 'sonner';
import { Modal } from '../components/Modal';
import { EmptyState, ErrorState, Skeleton } from '../components/common';
import { TrackList } from '../components/TrackList';
import { player } from '../player/controller';
import { getPlayer } from '../state/player';
import { getSound, useSound } from '../state/sound';
import { useSettings } from '../state/settings';
import { useUi } from '../state/ui';
import { useAllThemes } from '../state/theme';
import { audius, registry } from '../lib/sources';
import { SHORTCUTS, prettyCombo } from '../lib/shortcuts';
import { db } from '../db/db';
import {
  getAssignment,
  listSounds,
  playlistAssignmentId,
  setAssignment,
  songAssignmentId,
} from '../db/library';
import { getLocalBlob } from '../lib/localFiles';
import { demoUrl, isDemoId } from '../lib/demo';

// ---------------------------------------------------------------- Command palette
function CommandPalette() {
  const open = useUi((s) => s.commandOpen);
  const setUi = useUi((s) => s.set);
  const nav = useNavigate();
  const themes = useAllThemes();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const songs = useQuery({
    queryKey: ['palette-search', debounced],
    queryFn: () => registry.search(debounced, { types: ['track'], limit: 8 }),
    enabled: open && debounced.length >= 2,
  });
  const close = () => {
    setUi({ commandOpen: false });
    setQ('');
  };
  const run = (fn: () => void) => {
    fn();
    close();
  };
  const toggle8d = () => {
    const s = cloneSound(getSound().settings);
    s.eightD.enabled = !s.eightD.enabled;
    player.applySound(s);
    toast.message(s.eightD.enabled ? '8D on' : '8D off');
  };
  const toggleKaraoke = () => {
    const s = cloneSound(getSound().settings);
    s.vocalReduce = { enabled: !s.vocalReduce.enabled, amount: 0.9 };
    player.applySound(s);
  };
  const item =
    'flex cursor-pointer items-center gap-2 rounded-ctl px-3 py-2 text-sm data-[selected=true]:bg-surface-hover';
  const group =
    'px-1 py-1 text-xs [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted';
  return (
    <Dialog.Root open={open} onOpenChange={(o) => (o ? setUi({ commandOpen: true }) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-[12vh] z-[61] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-panel border border-line bg-bg-elevated shadow-theme">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">Search songs or run an action</Dialog.Description>
          <Command label="Command palette" shouldFilter loop>
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search size={18} className="text-muted" aria-hidden="true" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search songs or type a command…"
                className="h-12 flex-1 bg-transparent text-base outline-none"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-sm text-muted">
                No matches.
              </Command.Empty>
              {songs.data && songs.data.tracks.length > 0 && (
                <Command.Group heading="Songs" className={group}>
                  {songs.data.tracks.map((t) => (
                    <Command.Item
                      key={t.key}
                      value={`song ${t.title} ${t.artist} ${t.key}`}
                      className={item}
                      onSelect={() =>
                        run(() => void player.playTrack(t, songs.data?.tracks ?? [t]))
                      }
                    >
                      <Music size={15} /> <span className="truncate">{t.title}</span>
                      <span className="ml-auto truncate text-xs text-muted">{t.artist}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {songs.isFetching && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted">
                  <LoaderCircle size={14} className="animate-spin" /> Searching…
                </div>
              )}
              <Command.Group heading="Sound" className={group}>
                {SOUND_PRESETS.map((p) => (
                  <Command.Item
                    key={p.id}
                    value={`apply ${p.name}`}
                    className={item}
                    onSelect={() =>
                      run(() =>
                        player.applySound(
                          presetSettings(p.id),
                          { kind: 'preset', id: p.id },
                          p.name,
                        ),
                      )
                    }
                  >
                    <Sparkles size={15} /> Apply {p.name}
                  </Command.Item>
                ))}
                <Command.Item value="toggle 8d" className={item} onSelect={() => run(toggle8d)}>
                  Toggle 8D
                </Command.Item>
                <Command.Item
                  value="toggle karaoke vocal reduce"
                  className={item}
                  onSelect={() => run(toggleKaraoke)}
                >
                  Toggle karaoke
                </Command.Item>
                <Command.Item
                  value="reset sound to default"
                  className={item}
                  onSelect={() => run(() => void player.resetSoundToDefault())}
                >
                  Reset sound to default
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Playback" className={group}>
                {[15, 30, 60].map((m) => (
                  <Command.Item
                    key={m}
                    value={`sleep timer ${m} min`}
                    className={item}
                    onSelect={() => run(() => player.setSleep('time', m))}
                  >
                    Sleep timer {m} min
                  </Command.Item>
                ))}
                <Command.Item
                  value="shuffle"
                  className={item}
                  onSelect={() => run(() => player.toggleShuffle())}
                >
                  Toggle shuffle
                </Command.Item>
                <Command.Item
                  value="repeat"
                  className={item}
                  onSelect={() => run(() => player.setRepeatMode())}
                >
                  Cycle repeat
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={group}>
                {[
                  ['Home', '/'],
                  ['Search', '/search'],
                  ['Library', '/library'],
                  ['Sound Lab', '/lab'],
                  ['Friends', '/friends'],
                  ['Stats', '/stats'],
                  ['Tuneshift Wrapped', '/wrapped'],
                  ['Import playlist', '/import'],
                  ['Settings', '/settings'],
                ].map(([label, to]) => (
                  <Command.Item
                    key={to}
                    value={`go ${label}`}
                    className={item}
                    onSelect={() => run(() => void nav(to as string))}
                  >
                    {label}
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Theme" className={group}>
                {themes.map((t) => (
                  <Command.Item
                    key={t.id}
                    value={`theme ${t.name}`}
                    className={item}
                    onSelect={() => run(() => useSettings.getState().set({ themeId: t.id }))}
                  >
                    Theme: {t.name}
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ---------------------------------------------------------------- Shortcut cheat sheet
function CheatSheet() {
  const open = useUi((s) => s.cheatSheetOpen);
  const setUi = useUi((s) => s.set);
  const overrides = useSettings((s) => s.shortcuts);
  return (
    <Modal
      open={open}
      onOpenChange={(o) => setUi({ cheatSheetOpen: o })}
      title="Keyboard shortcuts"
      description="Change them in Settings → Shortcuts."
      wide
    >
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {SHORTCUTS.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 border-b border-line py-1.5"
          >
            <dt className="text-sm">{s.label}</dt>
            <dd>
              <kbd className="rounded-chip border border-line bg-surface px-2 py-0.5 font-mono text-xs">
                {prettyCombo(overrides[s.id] ?? s.keys)}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

// ---------------------------------------------------------------- Remix Finder
function VersionsDialog() {
  const track = useUi((s) => s.versionsFor);
  const setUi = useUi((s) => s.set);
  const q = useQuery({
    queryKey: ['versions', track?.key],
    queryFn: () => findVersions(audius, track as Track),
    enabled: Boolean(track) && registry.isUsable('audius'),
    staleTime: 10 * 60_000,
  });
  return (
    <Modal
      open={Boolean(track)}
      onOpenChange={(o) => !o && setUi({ versionsFor: null })}
      title="Find versions"
      description={
        track ? `Sped up, slowed, nightcore and remixes of “${track.title}” on Audius` : ''
      }
      wide
    >
      {!registry.isUsable('audius') ? (
        <EmptyState
          title="Audius is turned off"
          body="Turn Audius on in Settings → Sources to search for versions."
        />
      ) : q.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState
          title="No other versions found"
          body="Nobody has uploaded an edit of this one to Audius yet."
        />
      ) : (
        <div className="space-y-5">
          {q.data.map((g) => (
            <section key={g.kind.id}>
              <h3 className="mb-1 font-display font-bold">
                {g.kind.label}{' '}
                <span className="text-sm font-normal text-muted">· {g.tracks.length}</span>
              </h3>
              <TrackList
                tracks={g.tracks}
                label={`${g.kind.label} versions`}
                context={{ name: `${g.kind.label} versions`, kind: 'versions' }}
              />
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Sound assignment
function AssignSoundDialog() {
  const target = useUi((s) => s.assignFor);
  const setUi = useUi((s) => s.set);
  const sounds = useLiveQuery(() => listSounds(), [], []);
  const current = useLiveQuery(
    async () =>
      target
        ? getAssignment(
            target.kind === 'track' ? songAssignmentId(target.id) : playlistAssignmentId(target.id),
          )
        : null,
    [target?.id],
  );
  if (!target) return null;
  const id =
    target.kind === 'track' ? songAssignmentId(target.id) : playlistAssignmentId(target.id);
  const choose = async (ref: SoundRef | null, label: string) => {
    await setAssignment(id, ref);
    toast.success(ref ? `“${target.name}” will always play with ${label}` : 'Assignment removed');
    const st = getPlayer();
    if (st.current && (st.current.key === target.id || st.queue.meta.id === target.id))
      await player.resetSoundToDefault();
    setUi({ assignFor: null });
  };
  const isSel = (ref: SoundRef) => current?.kind === ref.kind && current.id === ref.id;
  const opt =
    'flex w-full items-center justify-between rounded-ctl px-3 py-2 text-left text-sm hover:bg-surface-hover aria-pressed:bg-accent-soft';
  return (
    <Modal
      open
      onOpenChange={(o) => !o && setUi({ assignFor: null })}
      title={
        target.kind === 'track' ? 'Always play this song with…' : 'Always play this playlist with…'
      }
      description={`Priority: song › playlist › your default. (${target.name})`}
    >
      <div className="space-y-1">
        <h3 className="px-1 text-xs font-bold uppercase text-muted">Presets</h3>
        {SOUND_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={opt}
            aria-pressed={isSel({ kind: 'preset', id: p.id })}
            onClick={() => void choose({ kind: 'preset', id: p.id }, p.name)}
          >
            {p.name} <span className="text-xs text-muted">{p.subtitle}</span>
          </button>
        ))}
        {sounds.length > 0 && (
          <h3 className="px-1 pt-3 text-xs font-bold uppercase text-muted">My Sounds</h3>
        )}
        {sounds.map((s) => (
          <button
            key={s.id}
            type="button"
            className={opt}
            aria-pressed={isSel({ kind: 'saved', id: s.id })}
            onClick={() => void choose({ kind: 'saved', id: s.id }, s.name)}
          >
            {s.name}
          </button>
        ))}
      </div>
      {current && (
        <Button className="mt-4" variant="outline" onClick={() => void choose(null, '')}>
          Remove assignment (use default)
        </Button>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- Export with effects
function ExportDialog() {
  const track = useUi((s) => s.exportFor);
  const setUi = useUi((s) => s.set);
  const sound = useSound((s) => s.settings);
  const label = useSound((s) => s.label);
  const [format, setFormat] = useState<ExportFormat>('mp3');
  const [progress, setProgress] = useState<{ phase: ExportPhase; value: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const busy = progress !== null;
  const phaseLabel = useMemo(
    () => ({ decode: 'Reading file', render: 'Rendering effects', encode: 'Encoding' }),
    [],
  );
  if (!track) return null;
  const close = () => {
    abort.current?.abort();
    setProgress(null);
    setUi({ exportFor: null });
  };
  const start = async () => {
    // Spec §2: export is only for the user's own local files.
    if (track.source !== 'local' || !registry.capabilities('local').export) return;
    abort.current = new AbortController();
    setProgress({ phase: 'decode', value: 0 });
    try {
      const blob = isDemoId(track.id)
        ? await (await fetch(await demoUrl(track.id))).blob()
        : await getLocalBlob(track.id);
      const out = await exportWithEffects(
        blob,
        sound,
        format,
        (phase, value) => setProgress({ phase, value }),
        abort.current.signal,
      );
      const name = exportFileName(`${track.artist} - ${track.title}`, label, format);
      const url = URL.createObjectURL(out);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success(`Exported “${name}”`);
      setUi({ exportFor: null });
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError'))
        toast.error('Export failed', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setProgress(null);
    }
  };
  const overall = progress
    ? progress.phase === 'decode'
      ? 0.05
      : progress.phase === 'render'
        ? 0.05 + progress.value * 0.7
        : 0.75 + progress.value * 0.25
    : 0;
  return (
    <Modal
      open
      onOpenChange={(o) => !o && close()}
      title="Export with effects"
      description={`“${track.title}” rendered with ${label}. Only your own local files can be exported.`}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {busy ? 'Cancel' : 'Close'}
          </Button>
          <Button
            variant="primary"
            icon={<Download size={15} />}
            disabled={busy}
            onClick={() => void start()}
          >
            Export
          </Button>
        </>
      }
    >
      <Segmented
        label="Format"
        value={format}
        onChange={setFormat}
        options={EXPORT_FORMATS.map((f) => ({ value: f.id, label: f.label }))}
      />
      {progress && (
        <div className="mt-5" role="status" aria-live="polite">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{phaseLabel[progress.phase]}…</span>
            <span>{Math.round(overall * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={cn('h-full rounded-full bg-hero transition-[width]')}
              style={{ width: `${overall * 100}%` }}
            />
          </div>
        </div>
      )}
    </Modal>
  );
}

export function GlobalDialogs() {
  // Keep track metadata of liked/library songs warm for the palette (cheap).
  useLiveQuery(() => db.tracks.count(), []);
  return (
    <>
      <CommandPalette />
      <CheatSheet />
      <VersionsDialog />
      <AssignSoundDialog />
      <ExportDialog />
    </>
  );
}
