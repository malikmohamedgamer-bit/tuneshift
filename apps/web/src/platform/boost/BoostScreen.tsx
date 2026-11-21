import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Pause,
  Play,
  Power,
  RefreshCw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { Badge, Button, cn, IconButton, SoundLabControls } from '@tuneshift/ui';
import { toast } from 'sonner';
import { PageHeader, SectionHeader } from '../../components/common';
import { player } from '../../player/controller';
import { useSettings } from '../../state/settings';
import { useSound } from '../../state/sound';
import {
  boostHeadroom,
  isCableInput,
  isCableOutput,
  listAudioDevices,
  startBoost,
  stopBoost,
  useBoost,
} from './boostEngine';
import { openExternal, smtcControl, smtcCurrent, type SmtcInfo } from '../tauriBridge';

const VB_CABLE_URL = 'https://vb-audio.com/Cable/';

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5">
        {done ? (
          <CheckCircle2 className="text-emerald-400" aria-label="Done" />
        ) : (
          <Circle className="text-muted" aria-label={`Step ${n}`} />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <h3 className="font-semibold">
          {n}. {title}
        </h3>
        {children}
      </div>
    </li>
  );
}

function Meter({ db }: { db: number }) {
  const pct = Number.isFinite(db) ? Math.max(0, Math.min(100, ((db + 60) / 60) * 100)) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-hover"
      role="meter"
      aria-label="Input level"
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={Number.isFinite(db) ? Math.round(db) : -60}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width]',
          pct > 92 ? 'bg-red-500' : 'bg-gradient-to-r from-emerald-400 to-amber-400',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Desktop Boost mode screen: setup wizard, big switch, meter, latency, SMTC, Sound Lab. */
export function BoostScreen() {
  const boost = useBoost();
  const s = useSettings();
  const sound = useSound((x) => x.settings);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [smtc, setSmtc] = useState<SmtcInfo | null | undefined>(undefined);
  const refresh = async (ask = false) => {
    try {
      const d = await listAudioDevices(ask);
      setInputs(d.inputs);
      setOutputs(d.outputs);
      const cable = d.inputs.find(isCableInput);
      if (cable && !s.boostInputDeviceId) s.set({ boostInputDeviceId: cable.deviceId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not list devices');
    }
  };
  useEffect(() => {
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      const info = await smtcCurrent();
      if (live) setSmtc(info);
    };
    void poll();
    const t = setInterval(() => void poll(), 2000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);
  const cableInstalled = inputs.some(isCableInput) || outputs.some(isCableOutput);
  const inputPicked = Boolean(
    s.boostInputDeviceId &&
    inputs.find((d) => d.deviceId === s.boostInputDeviceId && isCableInput(d)),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Boost mode"
        subtitle="Live Sound Lab for other apps (Spotify, games, browsers). Nothing is recorded."
      />
      <section className="flex flex-wrap items-center gap-6 rounded-card border border-line bg-surface p-5">
        <button
          type="button"
          onClick={() => void (boost.on ? stopBoost() : startBoost())}
          aria-pressed={boost.on}
          aria-label={boost.on ? 'Turn Boost mode off' : 'Turn Boost mode on'}
          disabled={boost.starting}
          className={cn(
            'grid h-24 w-24 place-items-center rounded-full text-white shadow-theme transition',
            boost.on ? 'bg-hero scale-105' : 'bg-surface-hover text-muted',
          )}
        >
          <Power size={40} />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="font-display text-xl font-bold">
            {boost.starting ? 'Starting…' : boost.on ? 'Boost is on' : 'Boost is off'}
          </div>
          <Meter db={boost.inputDb} />
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span>
              Input {Number.isFinite(boost.inputDb) ? `${boost.inputDb.toFixed(0)} dBFS` : '—'}
            </span>
            <span>Latency ≈ {boost.on ? `${boost.latencyMs} ms` : '—'}</span>
            {boost.on && <Badge tone="ok">Tuneshift playback paused</Badge>}
          </div>
          {boost.error && (
            <p role="alert" className="text-sm text-red-300">
              {boost.error}
            </p>
          )}
        </div>
      </section>

      {smtc && (
        <section
          className="flex items-center gap-4 rounded-card border border-line bg-surface p-4"
          aria-label="Now playing in another app"
        >
          {smtc.thumbnail ? (
            <img src={smtc.thumbnail} alt="" className="h-14 w-14 rounded-ctl object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-ctl bg-surface-hover" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{smtc.title || 'Unknown title'}</div>
            <div className="truncate text-sm text-muted">
              {smtc.artist} · {smtc.app}
            </div>
          </div>
          <IconButton label="Previous in other app" onClick={() => void smtcControl('previous')}>
            <SkipBack size={18} />
          </IconButton>
          <IconButton
            label={smtc.playing ? 'Pause other app' : 'Play other app'}
            tone="filled"
            onClick={() => void smtcControl('toggle')}
          >
            {smtc.playing ? <Pause size={18} /> : <Play size={18} />}
          </IconButton>
          <IconButton label="Next in other app" onClick={() => void smtcControl('next')}>
            <SkipForward size={18} />
          </IconButton>
        </section>
      )}

      <section className="rounded-card border border-line bg-surface p-5">
        <SectionHeader
          title="Setup"
          action={
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={14} />}
              onClick={() => void refresh(true)}
            >
              Re-check
            </Button>
          }
        />
        <ol className="space-y-5">
          <Step n={1} done={cableInstalled} title="Install VB-Audio Virtual Cable (free)">
            <p className="text-sm text-muted">
              {cableInstalled
                ? 'Found it.'
                : "Not detected. It's a free virtual audio driver; install it from the official site, then restart Tuneshift."}
            </p>
            {!cableInstalled && (
              <Button
                size="sm"
                icon={<Download size={14} />}
                onClick={() => void openExternal(VB_CABLE_URL)}
              >
                Open vb-audio.com <ExternalLink size={12} />
              </Button>
            )}
          </Step>
          <Step n={2} done={false} title="Send the app's sound to the cable">
            <p className="text-sm text-muted">
              Windows Settings → System → Sound → Volume mixer (“App volume and device
              preferences”). Set Spotify's (or any app's) <b>Output</b> to <b>CABLE Input</b>. Keep
              your normal speakers as the default.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openExternal('ms-settings:apps-volume')}
            >
              Open Volume mixer
            </Button>
          </Step>
          <Step n={3} done={inputPicked} title="Pick CABLE Output as Tuneshift's Boost input">
            <div className="flex flex-wrap gap-3">
              <label className="text-xs text-muted">
                Input (from the cable)
                <select
                  className="mt-1 block h-9 w-64 rounded-ctl border border-line bg-bg px-2 text-sm text-fg"
                  value={s.boostInputDeviceId}
                  onChange={(e) => s.set({ boostInputDeviceId: e.target.value })}
                  disabled={boost.on}
                >
                  <option value="">Choose…</option>
                  {inputs.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `Input ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted">
                Output (your speakers)
                <select
                  className="mt-1 block h-9 w-64 rounded-ctl border border-line bg-bg px-2 text-sm text-fg"
                  value={s.boostOutputDeviceId}
                  onChange={(e) => s.set({ boostOutputDeviceId: e.target.value })}
                  disabled={boost.on}
                >
                  <option value="">System default</option>
                  {outputs
                    .filter((d) => !isCableOutput(d) && d.deviceId !== 'default')
                    .map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Output ${i + 1}`}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </Step>
        </ol>
      </section>

      <SoundLabControls
        value={sound}
        onChange={(v) => player.applySound(v)}
        limits={{
          speed:
            "Speed can't be changed on live audio from other apps. Tape-style presets become a pitch shift instead.",
        }}
        headroom={boostHeadroom}
      />
    </div>
  );
}
