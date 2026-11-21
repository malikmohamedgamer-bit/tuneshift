import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Download, Gauge, Power, Save, Trash2, X } from 'lucide-react';
import {
  BUILT_IN_THEMES,
  builtInTheme,
  decodeShareCode,
  defaultTheme,
  extractCode,
  isOfflineShareCode,
  migrateSound,
  NEUTRAL_SOUND,
  ShareCodeError,
  soundLabel,
  type SoundSettings,
} from '@tuneshift/core';
import { applyTheme, Badge, Button, cn, Slider, SoundLabControls, Switch } from '@tuneshift/ui';
import { errorText, type LiveStats, type SessionInfo, type SoundUpdate } from '../lib/messages';
import {
  MAX_MY_SOUNDS,
  MAX_NAME,
  mySoundKey,
  mySoundsFrom,
  newMySound,
  type MySound,
} from '../lib/mySounds';
import { captureBlockedReason, hostOf, pageSpeedFor, speedBlockedReason } from '../lib/pages';
import {
  listSessions,
  liveStats,
  sendPageSpeed,
  speedKey,
  toBackground,
  toOffscreen,
} from './chromeApi';

interface Loaded {
  tab: chrome.tabs.Tab | null;
  sound: SoundSettings;
  savedName: string;
  volume: number;
  pageSpeed: boolean;
  sessions: SessionInfo[];
  mySounds: MySound[];
  themeId: string;
}

async function load(): Promise<Loaded> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const local = await chrome.storage.local.get(['lastSound', 'lastName', 'volume']);
  const sync = await chrome.storage.sync.get(null);
  const tabId = tab?.id;
  const sess = tabId === undefined ? {} : await chrome.storage.session.get(speedKey(tabId));
  const sessions = await listSessions().catch(() => [] as SessionInfo[]);
  return {
    tab: tab ?? null,
    sound: migrateSound(local.lastSound ?? NEUTRAL_SOUND),
    savedName: typeof local.lastName === 'string' ? local.lastName : '',
    volume: typeof local.volume === 'number' ? local.volume : 1,
    pageSpeed: tabId !== undefined && Boolean(sess[speedKey(tabId)]),
    sessions,
    mySounds: mySoundsFrom(sync),
    themeId: typeof sync.themeId === 'string' ? sync.themeId : defaultTheme().id,
  };
}

function dbText(db: number) {
  return db <= -119 ? '−∞' : `${db.toFixed(0)} dB`;
}

export function App() {
  const [data, setData] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [saveName, setSaveName] = useState('');
  const [code, setCode] = useState('');
  const statsRef = useRef<LiveStats | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setData(await load());
    } catch (e) {
      setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'sync') return;
      if (Object.keys(changes).some((k) => k.startsWith('mysound:')))
        void chrome.storage.sync
          .get(null)
          .then((all) => setData((d) => (d ? { ...d, mySounds: mySoundsFrom(all) } : d)));
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const tabId = data?.tab?.id;
  const boosted = Boolean(data && data.sessions.some((s) => s.tabId === tabId));

  // Re-apply page speed whenever the popup opens (a reload drops the page script).
  const reapplied = useRef(false);
  useEffect(() => {
    if (!data || reapplied.current || tabId === undefined || !data.pageSpeed) return;
    reapplied.current = true;
    const { rate, preservesPitch } = pageSpeedFor(data.sound);
    sendPageSpeed(tabId, rate, preservesPitch).catch(() => undefined);
  }, [data, tabId]);

  useEffect(() => {
    if (!boosted || tabId === undefined) {
      setStats(null);
      statsRef.current = null;
      return;
    }
    const t = setInterval(() => {
      void liveStats(tabId).then((s) => {
        statsRef.current = s;
        setStats(s);
      });
    }, 200);
    return () => clearInterval(t);
  }, [boosted, tabId]);

  if (!data) {
    return (
      <div className="grid h-40 place-items-center text-sm text-muted">{error ?? 'Loading…'}</div>
    );
  }

  const label = soundLabel(data.sound, data.savedName || undefined);
  const update = (d: Loaded): SoundUpdate => ({
    sound: d.sound,
    label: soundLabel(d.sound, d.savedName || undefined),
    tapeToPitch: !d.pageSpeed,
    volume: d.volume,
  });

  /** Apply a new state: persist it, retune the live engine and the page speed. */
  const commit = (next: Loaded, opts: { speed?: boolean } = {}) => {
    setData(next);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void chrome.storage.local.set({
        lastSound: next.sound,
        lastName: next.savedName,
        lastLabel: soundLabel(next.sound, next.savedName || undefined),
        volume: next.volume,
      });
    }, 150);
    if (tabId === undefined) return;
    if (next.sessions.some((s) => s.tabId === tabId))
      toOffscreen({ type: 'sound', tabId, ...update(next) }).catch((e: unknown) =>
        setError(errorText(e)),
      );
    if (next.pageSpeed && opts.speed !== false) {
      const { rate, preservesPitch } = pageSpeedFor(next.sound);
      sendPageSpeed(tabId, rate, preservesPitch).catch((e: unknown) => setError(errorText(e)));
    }
  };

  const setSound = (sound: SoundSettings, savedName = '') => commit({ ...data, sound, savedName });

  const toggleBoost = async () => {
    if (tabId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      if (boosted) await toBackground({ type: 'stop', tabId });
      else await toBackground({ type: 'start', tabId, ...update(data) });
      setData({ ...data, sessions: await listSessions() });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const stopOther = async (id: number) => {
    await toBackground({ type: 'stop', tabId: id }).catch((e: unknown) => setError(errorText(e)));
    setData({ ...data, sessions: await listSessions().catch(() => data.sessions) });
  };

  const togglePageSpeed = async (on: boolean) => {
    if (tabId === undefined) return;
    setError(null);
    try {
      const { rate, preservesPitch } = pageSpeedFor(data.sound);
      await sendPageSpeed(tabId, on ? rate : null, preservesPitch);
      if (on) await chrome.storage.session.set({ [speedKey(tabId)]: true });
      else await chrome.storage.session.remove(speedKey(tabId));
      commit({ ...data, pageSpeed: on }, { speed: false });
    } catch (e) {
      setError(`Couldn’t control this page’s speed: ${errorText(e)}`);
    }
  };

  const saveMySound = async () => {
    setError(null);
    if (data.mySounds.length >= MAX_MY_SOUNDS) {
      setError(`You can keep up to ${MAX_MY_SOUNDS} sounds. Delete one first.`);
      return;
    }
    const s = newMySound(saveName || label, data.sound);
    try {
      await chrome.storage.sync.set({ [mySoundKey(s.id)]: s });
      setSaveName('');
      setNotice(`Saved “${s.name}”`);
      commit({ ...data, savedName: s.name, mySounds: [s, ...data.mySounds] });
    } catch (e) {
      setError(`Couldn’t save (sync storage may be full): ${errorText(e)}`);
    }
  };

  const deleteMySound = async (s: MySound) => {
    await chrome.storage.sync.remove(mySoundKey(s.id));
    setData({ ...data, mySounds: data.mySounds.filter((x) => x.id !== s.id) });
  };

  const importCode = async () => {
    setError(null);
    const c = extractCode(code);
    if (!c) return;
    if (!isOfflineShareCode(c)) {
      setError(
        'That looks like a short link. In Tuneshift open the sound’s Share menu and use “Copy code”, then paste the full code (it starts with ts1.).',
      );
      return;
    }
    try {
      const p = decodeShareCode(c);
      if (p.kind !== 'sound') {
        setError(`That’s a ${p.kind} code — the extension imports sounds.`);
        return;
      }
      const s = newMySound(p.data.name, p.data.settings);
      await chrome.storage.sync.set({ [mySoundKey(s.id)]: s });
      setCode('');
      setNotice(`Imported “${s.name}” into My Sounds`);
      commit({ ...data, sound: s.settings, savedName: s.name, mySounds: [s, ...data.mySounds] });
    } catch (e) {
      setError(e instanceof ShareCodeError ? e.message : `Couldn’t import: ${errorText(e)}`);
    }
  };

  const setTheme = (id: string) => {
    applyTheme(builtInTheme(id) ?? defaultTheme());
    void chrome.storage.sync.set({ themeId: id });
    setData({ ...data, themeId: id });
  };

  const captureBlocked = captureBlockedReason(data.tab?.url);
  const speedBlocked = speedBlockedReason(data.tab?.url);
  const others = data.sessions.filter((s) => s.tabId !== tabId);
  const pitchUnavailable = stats?.pitchStatus === 'unavailable';
  const meterPct = stats ? Math.max(0, Math.min(100, ((stats.inputDb + 60) / 60) * 100)) : 0;

  return (
    <div className="flex flex-col gap-3 p-3">
      <header className="flex items-center gap-2">
        <img src="icons/icon-32.png" alt="" className="h-6 w-6" />
        <h1 className="font-heading text-base font-bold">Tuneshift Boost</h1>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted">
          <span className="sr-only">Theme</span>
          <select
            value={data.themeId}
            onChange={(e) => setTheme(e.target.value)}
            className="max-w-32 rounded-ctl border border-line bg-surface px-1.5 py-1 text-xs text-fg"
            data-testid="theme-select"
          >
            {BUILT_IN_THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section className="rounded-card border border-line bg-surface p-3" aria-label="This tab">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold" title={data.tab?.title}>
              {data.tab?.title || 'This tab'}
            </p>
            <p className="truncate text-xs text-muted">{hostOf(data.tab?.url) || '—'}</p>
          </div>
          {boosted && <Badge tone="accent">{label}</Badge>}
        </div>
        <Button
          variant={boosted ? 'secondary' : 'primary'}
          className="mt-3 w-full"
          icon={<Power size={16} />}
          disabled={busy || Boolean(captureBlocked) || tabId === undefined}
          onClick={() => void toggleBoost()}
          data-testid="boost-toggle"
          aria-pressed={boosted}
        >
          {busy ? 'Working…' : boosted ? 'Stop boosting' : 'Boost this tab'}
        </Button>
        {captureBlocked && <p className="mt-2 text-xs text-muted">{captureBlocked}</p>}
        {boosted && stats && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted" aria-live="off">
            <span>Input</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full bg-accent-fill" style={{ width: `${meterPct}%` }} />
            </div>
            <span className="w-12 text-right tabular-nums">{dbText(stats.inputDb)}</span>
            <span className="tabular-nums">{stats.latencyMs} ms</span>
          </div>
        )}
        {boosted && (
          <Slider
            className="mt-3"
            label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={data.volume}
            resetTo={1}
            display={(v) => `${Math.round(v * 100)}%`}
            valueText={(v) => `${Math.round(v * 100)} percent`}
            onChange={(v) => commit({ ...data, volume: v }, { speed: false })}
          />
        )}
      </section>

      {others.length > 0 && (
        <section aria-label="Other boosted tabs" className="flex flex-col gap-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Also boosted</h2>
          {others.map((s) => (
            <div
              key={s.tabId}
              className="flex items-center gap-2 rounded-ctl bg-surface px-2 py-1.5 text-xs"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left hover:underline"
                onClick={() => void chrome.tabs.update(s.tabId, { active: true })}
              >
                {s.title} <span className="text-muted">· {s.label}</span>
              </button>
              <button
                type="button"
                className="rounded-full p-1 text-muted hover:bg-surface-hover hover:text-fg"
                aria-label={`Stop boosting ${s.title}`}
                onClick={() => void stopOther(s.tabId)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </section>
      )}

      {(error || notice) && (
        <p
          role={error ? 'alert' : 'status'}
          className={cn(
            'rounded-ctl px-3 py-2 text-xs',
            error ? 'bg-red-500/15 text-red-200' : 'bg-emerald-500/15 text-emerald-200',
          )}
        >
          {error ?? notice}
        </p>
      )}

      <section className="rounded-card border border-line bg-surface p-3" aria-label="Page speed">
        <Switch
          label="Page speed"
          description={
            speedBlocked ??
            (data.pageSpeed
              ? 'The page’s own player runs at the Speed below.'
              : 'Changes the page player’s speed for real Sped Up / Slowed / Nightcore.')
          }
          checked={data.pageSpeed && !speedBlocked}
          disabled={Boolean(speedBlocked) || tabId === undefined}
          onChange={(v) => void togglePageSpeed(v)}
          testId="page-speed"
        />
        {data.pageSpeed && !speedBlocked && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <Gauge size={13} /> {pageSpeedFor(data.sound).rate.toFixed(2)}× ·{' '}
            {pageSpeedFor(data.sound).preservesPitch ? 'pitch kept' : 'tape (pitch follows speed)'}
          </p>
        )}
      </section>

      <SoundLabControls
        compact
        value={data.sound}
        onChange={(s) => setSound(s)}
        headroom={boosted ? () => statsRef.current?.headroom ?? null : undefined}
        limits={{
          speed: data.pageSpeed
            ? undefined
            : 'Live tab audio can’t change speed. Tape presets become a pitch shift — or turn on Page speed above.',
          pitch: pitchUnavailable ? 'The pitch engine couldn’t load in this browser.' : undefined,
        }}
        pitchNote={stats?.pitchStatus === 'loading' ? 'Loading pitch engine…' : undefined}
      />

      <section className="rounded-card border border-line bg-surface p-3" aria-label="My Sounds">
        <h2 className="mb-2 text-sm font-bold">My Sounds</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveMySound();
          }}
        >
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder={label}
            aria-label="Name for this sound"
            className="min-w-0 flex-1 rounded-ctl border border-line bg-bg px-2 py-1.5 text-sm"
          />
          <Button type="submit" size="sm" icon={<Save size={14} />}>
            Save
          </Button>
        </form>
        {data.mySounds.length > 0 ? (
          <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
            {data.mySounds.map((s) => (
              <li key={s.id} className="flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-ctl px-2 py-1.5 text-left text-sm hover:bg-surface-hover',
                    data.savedName === s.name && 'font-bold text-accent-text',
                  )}
                  onClick={() => setSound(s.settings, s.name)}
                >
                  {s.name}
                </button>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted hover:bg-surface-hover hover:text-fg"
                  aria-label={`Delete ${s.name}`}
                  onClick={() => void deleteMySound(s)}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted">Saved sounds sync with your browser profile.</p>
        )}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void importCode();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste a sound code (ts1.…)"
            aria-label="Sound share code"
            className="min-w-0 flex-1 rounded-ctl border border-line bg-bg px-2 py-1.5 text-sm"
            data-testid="import-code"
          />
          <Button type="submit" size="sm" icon={<Download size={14} />} disabled={!code.trim()}>
            Import
          </Button>
        </form>
      </section>

      <footer className="flex items-center justify-between text-[11px] text-muted">
        <span>Processed live — never recorded.</span>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 hover:text-fg"
          onClick={() => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
        >
          Shortcut <ArrowUpRight size={11} />
        </button>
      </footer>
    </div>
  );
}
