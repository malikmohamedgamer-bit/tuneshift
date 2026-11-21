import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Link, NavLink, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  ExternalLink,
  Info,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import {
  APP_REPO_URL,
  APP_VERSION,
  BACKUP_TABLES,
  formatBytes,
  makeBackup,
  parseBackup,
  SOUND_PRESETS,
  type SoundRef,
} from '@tuneshift/core';
import { AudioEngine, forgetCors } from '@tuneshift/audio';
import { Button, cn, Segmented, Slider, Switch, Tip } from '@tuneshift/ui';
import { toast } from 'sonner';
import { PageHeader, SectionHeader } from '../../components/common';
import { AccountPanel } from '../../components/social/Account';
import { AppearanceSection } from './Appearance';
import { useSettings, type Settings as SettingsT } from '../../state/settings';
import { db } from '../../db/db';
import { clearHistory, listSounds } from '../../db/library';
import {
  envIssues,
  getKeys,
  keySource,
  setRuntimeKey,
  subscribeKeys,
  isServiceRoleKey,
  type KeyName,
} from '../../env';
import { audius, jamendo } from '../../lib/sources';
import { clearOpfsCopies, storageInfo, type StorageInfo } from '../../lib/localFiles';
import { downloadBlob } from '../../lib/images';
import { SHORTCUTS, comboFromEvent, prettyCombo } from '../../lib/shortcuts';
import { isIOS, isTauri } from '../../platform/detect';
import { queryClient } from '../../lib/queryClient';

const SECTIONS = [
  ['account', 'Account'],
  ['playback', 'Playback'],
  ['audio', 'Audio'],
  ['sources', 'Sources'],
  ['lyrics', 'Lyrics'],
  ['appearance', 'Appearance'],
  ['shortcuts', 'Shortcuts'],
  ['desktop', 'Desktop'],
  ['boost', 'Boost mode'],
  ['privacy', 'Privacy'],
  ['data', 'Data'],
  ['about', 'About'],
] as const;
type SectionId = (typeof SECTIONS)[number][0];

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{label}</div>
        {hint && <div className="text-xs text-muted">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- keys
const KEY_META: Record<KeyName, { label: string; help: ReactNode; placeholder: string }> = {
  audiusApiKey: {
    label: 'Audius API key',
    help: 'Optional — Audius works without one; a key only raises rate limits.',
    placeholder: 'paste key',
  },
  jamendoClientId: {
    label: 'Jamendo client ID',
    help: <>Free at devportal.jamendo.com (non-commercial). Enables the Jamendo catalog.</>,
    placeholder: 'e.g. a1b2c3d4',
  },
  supabaseUrl: {
    label: 'Supabase project URL',
    help: 'Enables sign-in, sync and friends.',
    placeholder: 'https://xxxx.supabase.co',
  },
  supabaseAnonKey: {
    label: 'Supabase anon (publishable) key',
    help: 'The public anon/publishable key — never the service-role key.',
    placeholder: 'eyJ… or sb_publishable_…',
  },
};

function KeyField({
  name,
  validate,
}: {
  name: KeyName;
  validate?: (v: string) => Promise<boolean>;
}) {
  useSyncExternalStore(subscribeKeys, getKeys);
  const src = keySource(name);
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'bad'>('idle');
  const meta = KEY_META[name];
  const save = async () => {
    const v = value.trim();
    if (name === 'supabaseAnonKey' && isServiceRoleKey(v)) {
      setState('bad');
      toast.error(
        'That is a service-role key. Only the anon/publishable key is allowed in an app.',
      );
      return;
    }
    if (validate && v) {
      setState('checking');
      const ok = await validate(v);
      setState(ok ? 'ok' : 'bad');
      if (!ok) {
        toast.error(`${meta.label} didn't work — check it and try again`);
        return;
      }
    }
    try {
      setRuntimeKey(name, v || undefined);
      setValue('');
      toast.success(v ? `${meta.label} saved` : `${meta.label} removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid key');
    }
  };
  return (
    <div className="border-b border-line py-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <KeyRound size={15} /> {meta.label}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px]',
            src === 'missing'
              ? 'bg-surface-hover text-muted'
              : 'bg-emerald-500/15 text-emerald-300',
          )}
        >
          {src === 'missing' ? 'not set' : src === 'env' ? 'set (build)' : 'set (this device)'}
        </span>
      </div>
      <p className="mb-2 text-xs text-muted">{meta.help}</p>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <input
          value={value}
          onChange={(e) => (setValue(e.target.value), setState('idle'))}
          placeholder={meta.placeholder}
          aria-label={meta.label}
          className="h-9 min-w-0 flex-1 rounded-ctl border border-line bg-bg px-3 font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={!value.trim() || state === 'checking'}
        >
          {state === 'checking' ? (
            <LoaderCircle size={14} className="animate-spin" />
          ) : validate ? (
            'Check & save'
          ) : (
            'Save'
          )}
        </Button>
        {src === 'runtime' && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (setRuntimeKey(name, undefined), toast.success('Removed'))}
          >
            Remove
          </Button>
        )}
        {state === 'ok' && <CheckCircle2 className="text-emerald-400" aria-label="Valid" />}
        {state === 'bad' && <XCircle className="text-red-400" aria-label="Invalid" />}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- sections
function PlaybackSection() {
  const s = useSettings();
  return (
    <div>
      <Row label="Crossfade" hint="0 s = gapless playback">
        <Slider
          className="w-56"
          label="Crossfade seconds"
          hideLabel
          min={0}
          max={12}
          step={1}
          value={s.crossfadeSec}
          display={(v) => (v === 0 ? 'Gapless' : `${v} s`)}
          valueText={(v) => `${v} seconds`}
          onChange={(v) => s.set({ crossfadeSec: v })}
        />
      </Row>
      <p className="-mt-2 mb-2 text-right text-xs text-muted">
        {s.crossfadeSec === 0 ? 'Gapless' : `${s.crossfadeSec} s crossfade`}
      </p>
      <Row
        label="Loudness normalization"
        hint="Evens out volume between songs (target −14 LUFS). Album mode keeps album dynamics."
      >
        <Segmented
          label="Normalization"
          size="sm"
          value={s.normalization}
          onChange={(normalization) => s.set({ normalization })}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'track', label: 'Track' },
            { value: 'album', label: 'Album' },
          ]}
        />
      </Row>
      <Row
        label="Autoplay similar songs"
        hint="When the queue ends, keep going with similar tracks from Audius."
      >
        <Switch
          label="Autoplay"
          hideLabel
          checked={s.autoplay}
          onChange={(autoplay) => s.set({ autoplay })}
        />
      </Row>
      <Row label="Smart shuffle" hint="Avoids the same artist twice in a row.">
        <Switch
          label="Smart shuffle"
          hideLabel
          checked={s.smartShuffle}
          onChange={(smartShuffle) => s.set({ smartShuffle })}
        />
      </Row>
      <Row label="Resume where I left off" hint="Reopens your last song and position (paused).">
        <Switch
          label="Resume"
          hideLabel
          checked={s.resume}
          onChange={(resume) => s.set({ resume })}
        />
      </Row>
    </div>
  );
}

function AudioSection() {
  const s = useSettings();
  const sounds = useLiveQuery(() => listSounds(), [], []);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const canPick = AudioEngine.supportsSinkSelection();
  const refreshDevices = async (ask = false) => {
    try {
      if (ask)
        (await navigator.mediaDevices.getUserMedia({ audio: true }))
          .getTracks()
          .forEach((t) => t.stop());
      setDevices(
        (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput'),
      );
    } catch {
      toast.error('Device list unavailable — the browser blocked access.');
    }
  };
  useEffect(() => {
    if (canPick) void refreshDevices();
  }, [canPick]);
  const refValue = (r: SoundRef) => `${r.kind}:${r.id}`;
  return (
    <div>
      <Row
        label="Default sound"
        hint="Used when no song/playlist sound is set (song › playlist › default)."
      >
        <select
          className="h-9 rounded-ctl border border-line bg-surface px-2 text-sm"
          value={refValue(s.defaultSound)}
          onChange={(e) => {
            const [kind, ...rest] = e.target.value.split(':');
            s.set({ defaultSound: { kind: kind as SoundRef['kind'], id: rest.join(':') } });
          }}
        >
          <optgroup label="Presets">
            {SOUND_PRESETS.map((p) => (
              <option key={p.id} value={`preset:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
          {sounds.length > 0 && (
            <optgroup label="My Sounds">
              {sounds.map((m) => (
                <option key={m.id} value={`saved:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Row>
      <Row
        label="Output device"
        hint={
          canPick
            ? 'Where Tuneshift plays (speakers, headphones…).'
            : "This browser can't choose an output device — it uses the system default."
        }
      >
        {canPick ? (
          <div className="flex gap-2">
            <select
              className="h-9 max-w-56 rounded-ctl border border-line bg-surface px-2 text-sm"
              value={s.outputDeviceId}
              onChange={(e) => s.set({ outputDeviceId: e.target.value })}
            >
              <option value="">System default</option>
              {devices
                .filter((d) => d.deviceId && d.deviceId !== 'default')
                .map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Output ${i + 1}`}
                  </option>
                ))}
            </select>
            {devices.some((d) => !d.label) && (
              <Button size="sm" variant="ghost" onClick={() => void refreshDevices(true)}>
                Show names
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted">Not supported here</span>
        )}
      </Row>
      <Row
        label="Background-safe mode"
        hint={
          <span className="inline-flex items-center gap-1">
            {isIOS() ? 'On iPhone/iPad this is on automatically.' : 'Mainly for iPhone.'}
            <Tip content="iOS pauses Web Audio when the screen locks or you switch apps. In this mode Tuneshift switches to plain playback while hidden — speed presets keep working, other effects return when you come back.">
              <span tabIndex={0} aria-label="About background-safe mode">
                <Info size={13} />
              </span>
            </Tip>
          </span>
        }
      >
        <Segmented
          label="Background-safe mode"
          size="sm"
          value={s.backgroundSafe}
          onChange={(backgroundSafe) => s.set({ backgroundSafe })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Row>
      <div className="mt-4 rounded-ctl border border-line bg-surface p-3 text-sm text-muted">
        <p className="font-semibold text-fg">Full Sound Lab vs Speed only</p>
        <p className="mt-1">
          Some music hosts don't allow web apps to process their audio. Tracks from those hosts show
          a “Speed only” badge: tape-style presets (Sped Up, Nightcore, Slowed) still work, but EQ,
          bass, reverb and 8D can't be applied. Your own files and Audius always get the full Sound
          Lab.
        </p>
      </div>
    </div>
  );
}

function SourcesSection() {
  const s = useSettings();
  const toggle = (id: 'local' | 'audius' | 'jamendo', v: boolean) =>
    s.set({ sourcesEnabled: { ...s.sourcesEnabled, [id]: v } });
  return (
    <div>
      <Row label="Your files" hint="Local music and the demo loops (full Sound Lab + export).">
        <Switch
          label="Local files"
          hideLabel
          checked={s.sourcesEnabled.local}
          onChange={(v) => toggle('local', v)}
        />
      </Row>
      <Row
        label="Audius"
        hint="Huge catalog of remixes, sped-up/slowed edits, phonk, EDM, lo-fi. Works without a key."
      >
        <Switch
          label="Audius"
          hideLabel
          checked={s.sourcesEnabled.audius}
          onChange={(v) => toggle('audius', v)}
        />
      </Row>
      <Row
        label="Jamendo"
        hint={
          getKeys().jamendoClientId
            ? 'Creative Commons catalog (non-commercial).'
            : 'Add a Jamendo client ID below to enable.'
        }
      >
        <Switch
          label="Jamendo"
          hideLabel
          checked={s.sourcesEnabled.jamendo}
          onChange={(v) => toggle('jamendo', v)}
        />
      </Row>
      <SectionHeader
        title="API keys"
        subtitle="Stored on this device only. They take effect immediately."
      />
      <KeyField name="jamendoClientId" validate={(v) => jamendo.validateKey(v)} />
      <KeyField name="audiusApiKey" validate={(v) => audius.validateKey(v)} />
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to="/library?tab=folders"
          className="inline-flex h-9 items-center rounded-full border border-line px-4 text-sm font-semibold hover:bg-surface-hover"
        >
          Manage local folders
        </Link>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => (forgetCors(), toast.success('Source capability cache cleared'))}
        >
          Re-check “Speed only” sources
        </Button>
      </div>
      {envIssues.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-ctl border border-amber-500/30 bg-amber-500/10 p-3 text-sm"
        >
          {envIssues.map((i) => (
            <p key={i.variable}>
              <code>{i.variable}</code> {i.message} — ignored.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function LyricsSection() {
  const s = useSettings();
  const count = useLiveQuery(() => db.lyricsCache.count(), [], 0);
  return (
    <div>
      <Row
        label="Open lyrics when a song starts"
        hint="Switches the now-playing panel to the Lyrics tab."
      >
        <Switch
          label="Auto-open lyrics"
          hideLabel
          checked={s.lyricsAutoOpen}
          onChange={(lyricsAutoOpen) => s.set({ lyricsAutoOpen })}
        />
      </Row>
      <Row label="Lyrics cache" hint={`${count} songs cached. Lyrics come from LRCLIB.`}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void db.lyricsCache.clear().then(() => toast.success('Lyrics cache cleared'))
          }
        >
          Clear
        </Button>
      </Row>
    </div>
  );
}

function ShortcutsSection() {
  const s = useSettings();
  const [recording, setRecording] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
      if (e.key === 'Escape') return setRecording(null);
      const combo = comboFromEvent(e);
      const clash = SHORTCUTS.find(
        (x) => x.id !== recording && (s.shortcuts[x.id] ?? x.keys) === combo,
      );
      if (clash) toast.error(`${prettyCombo(combo)} is already used for “${clash.label}”`);
      else s.set({ shortcuts: { ...s.shortcuts, [recording]: combo } });
      setRecording(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, s]);
  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        Press ? anywhere to see these. Click a shortcut, then press the new keys (Esc cancels).
      </p>
      {SHORTCUTS.map((sc) => (
        <Row key={sc.id} label={sc.label}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRecording(sc.id)}
              className={cn(
                'min-w-24 rounded-chip border px-2 py-1 font-mono text-xs',
                recording === sc.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
              )}
              aria-label={`Change shortcut for ${sc.label}`}
            >
              {recording === sc.id ? 'Press keys…' : prettyCombo(s.shortcuts[sc.id] ?? sc.keys)}
            </button>
            {s.shortcuts[sc.id] && (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Reset ${sc.label}`}
                onClick={() => {
                  const next = { ...s.shortcuts };
                  delete next[sc.id];
                  s.set({ shortcuts: next });
                }}
              >
                <RotateCcw size={13} />
              </Button>
            )}
          </div>
        </Row>
      ))}
    </div>
  );
}

function DesktopSection() {
  const s = useSettings();
  if (!isTauri()) {
    return (
      <div className="space-y-2 text-sm text-muted">
        <p>
          The Windows desktop app adds an always-on-top mini player, a now-playing overlay for
          games, a tray icon, global media shortcuts, Discord status and Boost mode (effects on
          Spotify and other apps).
        </p>
        <a
          className="inline-flex items-center gap-1 font-semibold text-accent-text underline"
          href={`${APP_REPO_URL}/releases`}
          target="_blank"
          rel="noreferrer"
        >
          Get the desktop app <ExternalLink size={13} />
        </a>
      </div>
    );
  }
  const shortcut = (id: string, label: string) => (
    <Row key={id} label={label}>
      <input
        className="h-9 w-44 rounded-ctl border border-line bg-bg px-2 font-mono text-xs"
        value={s.globalShortcuts[id] ?? ''}
        onChange={(e) => s.set({ globalShortcuts: { ...s.globalShortcuts, [id]: e.target.value } })}
        aria-label={`Global shortcut: ${label}`}
      />
    </Row>
  );
  return (
    <div>
      <Row
        label="Close button minimises to tray"
        hint="Music keeps playing; quit from the tray icon."
      >
        <Switch
          label="Close to tray"
          hideLabel
          checked={s.closeToTray}
          onChange={(closeToTray) => s.set({ closeToTray })}
        />
      </Row>
      <Row label="Launch at startup">
        <Switch
          label="Launch at startup"
          hideLabel
          checked={s.launchOnStartup}
          onChange={(launchOnStartup) => s.set({ launchOnStartup })}
        />
      </Row>
      <Row label="Start minimised">
        <Switch
          label="Start minimised"
          hideLabel
          checked={s.startMinimized}
          onChange={(startMinimized) => s.set({ startMinimized })}
        />
      </Row>
      <Row label="Mini player opacity">
        <Slider
          className="w-48"
          label="Mini player opacity"
          hideLabel
          min={0.4}
          max={1}
          step={0.02}
          value={s.miniOpacity}
          display={(v) => `${Math.round(v * 100)}%`}
          onChange={(miniOpacity) => s.set({ miniOpacity })}
        />
      </Row>
      <Row
        label="Game overlay"
        hint="Exclusive-fullscreen games can cover it — use borderless windowed mode."
      >
        <Segmented
          label="Overlay"
          size="sm"
          value={s.overlayMode}
          onChange={(overlayMode) => s.set({ overlayMode })}
          options={[
            { value: 'always', label: 'Always' },
            { value: 'change', label: 'On track change' },
            { value: 'off', label: 'Off' },
          ]}
        />
      </Row>
      <Row label="Overlay position">
        <select
          className="h-9 rounded-ctl border border-line bg-surface px-2 text-sm"
          value={s.overlayPosition}
          onChange={(e) =>
            s.set({ overlayPosition: e.target.value as SettingsT['overlayPosition'] })
          }
        >
          <option value="top-center">Top centre</option>
          <option value="top-left">Top left</option>
          <option value="top-right">Top right</option>
          <option value="bottom-center">Bottom centre</option>
        </select>
      </Row>
      <Row label="Overlay hides after">
        <Slider
          className="w-48"
          label="Overlay seconds"
          hideLabel
          min={2}
          max={20}
          value={s.overlaySeconds}
          display={(v) => `${v} s`}
          onChange={(overlaySeconds) => s.set({ overlaySeconds })}
        />
      </Row>
      <Row label="Overlay click-through" hint="On: clicks go to the game underneath.">
        <Switch
          label="Click-through"
          hideLabel
          checked={s.overlayClickThrough}
          onChange={(overlayClickThrough) => s.set({ overlayClickThrough })}
        />
      </Row>
      <Row
        label="Discord status"
        hint={
          s.discordClientId
            ? 'Shows song, artist, sound and elapsed time.'
            : 'Paste a Discord application client ID to enable.'
        }
      >
        <Switch
          label="Discord Rich Presence"
          hideLabel
          checked={s.discordEnabled}
          disabled={!s.discordClientId}
          onChange={(discordEnabled) => s.set({ discordEnabled })}
        />
      </Row>
      <Row label="Discord client ID">
        <input
          className="h-9 w-56 rounded-ctl border border-line bg-bg px-2 font-mono text-xs"
          value={s.discordClientId}
          onChange={(e) => s.set({ discordClientId: e.target.value.replace(/\D/g, '') })}
          placeholder="e.g. 123456789012345678"
          aria-label="Discord client ID"
        />
      </Row>
      <SectionHeader
        title="Global shortcuts"
        subtitle="Work even when Tuneshift isn't focused. Media keys always work."
      />
      {shortcut('playPause', 'Play / pause')}
      {shortcut('next', 'Next')}
      {shortcut('prev', 'Previous')}
      {shortcut('cyclePreset', 'Cycle sound presets')}
      {shortcut('toggleMini', 'Toggle mini player')}
      {shortcut('toggleOverlay', 'Toggle overlay')}
    </div>
  );
}

function BoostSection() {
  const nav = useNavigate();
  return (
    <div className="space-y-3 text-sm text-muted">
      <p>
        Boost mode applies the Sound Lab to other apps' audio (e.g. Spotify) on Windows, using the
        free VB-Audio Virtual Cable. Speed can't change on live audio, but bass, EQ, reverb, 8D and
        pitch all work.
      </p>
      {isTauri() ? (
        <Button variant="primary" onClick={() => void nav('/boost')}>
          Open Boost mode
        </Button>
      ) : (
        <p>
          Available in the Windows desktop app. In Chrome/Edge you can also use the Tuneshift Boost
          extension on any tab.
        </p>
      )}
    </div>
  );
}

function PrivacySection() {
  const s = useSettings();
  return (
    <div>
      <Row
        label="Share what I'm listening to"
        hint="Friends (signed in) see your current song and sound."
      >
        <Switch
          label="Share activity"
          hideLabel
          checked={s.shareActivity}
          onChange={(shareActivity) => s.set({ shareActivity })}
        />
      </Row>
      <Row label="Private session" hint="Hides your activity and doesn't record history.">
        <Switch
          label="Private session"
          hideLabel
          checked={s.privateSession}
          onChange={(privateSession) => s.set({ privateSession })}
        />
      </Row>
      <Row label="Listening history" hint="Used for stats, Wrapped and Made for you.">
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            window.confirm('Clear your whole listening history?') &&
            void clearHistory().then(() => toast.success('History cleared'))
          }
        >
          Clear history
        </Button>
      </Row>
    </div>
  );
}

function DataSection() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const refresh = () => void storageInfo().then(setInfo);
  useEffect(refresh, []);
  const backup = async () => {
    const data: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) {
      if (t === 'settings') data[t] = [useSettings.getState()];
      else if (t === 'tracks') data[t] = await db.tracks.toArray();
      else data[t] = await db.table(t).toArray();
    }
    const file = makeBackup(data);
    // Drop functions from the settings row (zustand actions).
    file.data.settings = (file.data.settings ?? []).map((r) =>
      Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v !== 'function')),
    );
    downloadBlob(
      new Blob([JSON.stringify(file)], { type: 'application/json' }),
      `tuneshift-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );
    toast.success('Backup downloaded');
  };
  const restore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const b = parseBackup(await f.text());
        if (
          !window.confirm(
            `Restore this backup from ${new Date(b.exportedAt).toLocaleString()}? Records in it replace matching ones here.`,
          )
        )
          return;
        for (const [t, rows] of Object.entries(b.data)) {
          if (t === 'settings') {
            const row = rows[0];
            if (row) useSettings.getState().set(row as Partial<SettingsT>);
          } else if (rows.length)
            await db.table(t).bulkPut(rows.map((r) => (t === 'tracks' ? r : { ...r, dirty: 1 })));
        }
        toast.success('Backup restored');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Restore failed');
      }
    };
    input.click();
  };
  const clearCaches = async () => {
    await db.lyricsCache.clear();
    await db.loudness.clear();
    forgetCors();
    queryClient.clear();
    if ('caches' in window)
      for (const k of await caches.keys()) if (k === 'artwork') await caches.delete(k);
    toast.success('Caches cleared');
    refresh();
  };
  return (
    <div>
      <Row
        label="Backup"
        hint="Library, playlists, sounds, themes, history and settings as one JSON file. Your audio files aren't included."
      >
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void backup()}>
            Download backup
          </Button>
          <Button size="sm" variant="ghost" onClick={restore}>
            Restore…
          </Button>
        </div>
      </Row>
      <Row
        label="Storage"
        hint={
          info
            ? `${formatBytes(info.usage)} used of ${formatBytes(info.quota)}${info.persisted ? ' · protected from cleanup' : ''}`
            : 'Checking…'
        }
      >
        {!info?.persisted && navigator.storage?.persist && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void navigator.storage
                .persist()
                .then(
                  (ok) => (
                    toast[ok ? 'success' : 'error'](
                      ok ? 'Storage protected' : 'The browser declined',
                    ),
                    refresh()
                  ),
                )
            }
          >
            Protect storage
          </Button>
        )}
      </Row>
      <Row
        label="Copied files (private storage)"
        hint={
          info
            ? `${info.opfsFiles} files · ${formatBytes(info.opfsBytes)} — used by browsers that can't keep links to your files`
            : ''
        }
      >
        <Button
          size="sm"
          variant="ghost"
          disabled={!info?.opfsFiles}
          onClick={() =>
            window.confirm('Delete all copied audio files from private storage?') &&
            void clearOpfsCopies().then((n) => (toast.success(`Deleted ${n} files`), refresh()))
          }
        >
          Delete copies
        </Button>
      </Row>
      <Row
        label="Caches"
        hint="Lyrics, loudness analysis, cover art and source checks. Safe to clear."
      >
        <Button size="sm" variant="ghost" onClick={() => void clearCaches()}>
          Clear caches
        </Button>
      </Row>
    </div>
  );
}

function AboutSection() {
  return (
    <div className="space-y-3 text-sm text-muted">
      <p>
        <span className="font-display text-lg font-bold text-fg">Tuneshift</span> v{APP_VERSION} — a
        personal, non-commercial music app with a live Sound Lab.
      </p>
      <p>
        Music from your own files, Audius and Jamendo (Creative Commons). Artist names link to their
        pages; Jamendo licences are shown on every track. Lyrics from LRCLIB. Reverb rooms are
        generated, so no impulse files are needed.
      </p>
      <p>
        Tuneshift never downloads or records audio from Spotify, YouTube, Apple Music, TikTok or
        SoundCloud, and never records Boost-mode audio. Export works only for your own files.
      </p>
      <p>
        Fonts: Inter, Outfit, Space Grotesk, Nunito, Unbounded (SIL OFL). Icons: Lucide (ISC). Pitch
        shifting: Signalsmith Stretch (MIT). MP3 encoding: lamejs (LGPL).
      </p>
      <a
        className="inline-flex items-center gap-1 font-semibold text-accent-text underline"
        href={APP_REPO_URL}
        target="_blank"
        rel="noreferrer"
      >
        Source code <ExternalLink size={13} />
      </a>
    </div>
  );
}

function AccountSection() {
  return (
    <div className="space-y-6">
      <AccountPanel />
      <div>
        <SectionHeader
          title="Server (Supabase)"
          subtitle="Needed for sign-in, sync, friends, short share links and parties."
        />
        <KeyField name="supabaseUrl" />
        <KeyField name="supabaseAnonKey" />
      </div>
    </div>
  );
}

export function Settings() {
  const { section } = useParams();
  const current = (SECTIONS.find(([id]) => id === section)?.[0] ?? 'account') as SectionId;
  const body: Record<SectionId, ReactNode> = {
    account: <AccountSection />,
    playback: <PlaybackSection />,
    audio: <AudioSection />,
    sources: <SourcesSection />,
    lyrics: <LyricsSection />,
    appearance: <AppearanceSection />,
    shortcuts: <ShortcutsSection />,
    desktop: <DesktopSection />,
    boost: <BoostSection />,
    privacy: <PrivacySection />,
    data: <DataSection />,
    about: <AboutSection />,
  };
  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav
          aria-label="Settings sections"
          className="scrollbar-none flex gap-1 overflow-x-auto md:flex-col"
        >
          {SECTIONS.map(([id, label]) => (
            <NavLink
              key={id}
              to={`/settings/${id}`}
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-ctl px-3 py-2 text-sm font-semibold',
                  isActive || (id === 'account' && !section)
                    ? 'bg-surface-hover text-fg'
                    : 'text-muted hover:text-fg',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <h2 className="mb-2 font-display text-xl font-bold">
            {SECTIONS.find(([id]) => id === current)?.[1]}
          </h2>
          {body[current]}
        </div>
      </div>
    </div>
  );
}
