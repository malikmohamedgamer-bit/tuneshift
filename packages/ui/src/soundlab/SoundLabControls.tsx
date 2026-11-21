import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  LIMITS,
  ROOM_TYPES,
  SOUND_PRESETS,
  cloneSound,
  matchPreset,
  type RoomType,
  type SoundSettings,
} from '@tuneshift/core';
import { ChevronDown, Info } from 'lucide-react';
import { Slider, Switch, Tip } from '../controls';
import { cn } from '../cn';
import { EqEditor } from './EqEditor';

export interface SoundLabLimits {
  /** Why speed can't change (desktop Boost / extension live audio). */
  speed?: string;
  /** Why graph effects are off (Limited mode: the source blocks processing). */
  graph?: string;
  /** Why independent pitch is unavailable (worklet failed to load). */
  pitch?: string;
}

export interface SoundLabControlsProps {
  value: SoundSettings;
  onChange: (s: SoundSettings) => void;
  limits?: SoundLabLimits;
  /** Live headroom readout (auto preamp cut + limiter gain reduction). */
  headroom?: () => { autoDb: number; limiterDb: number } | null;
  compact?: boolean;
  /** Show 1–8 key hints on the first preset cards. */
  keyHints?: boolean;
  /** Pitch status text (e.g. "Loading pitch engine…"). */
  pitchNote?: string;
}

const ROOM_LABEL: Record<RoomType, string> = {
  room: 'Room',
  hall: 'Hall',
  plate: 'Plate',
  church: 'Church',
  stadium: 'Stadium',
  dreamy: 'Dreamy',
};

const signedDb = (v: number) =>
  `${v > 0 ? '+' : ''}${v.toFixed(Math.abs(v) < 10 && !Number.isInteger(v) ? 1 : 0)} dB`;
const dbWords = (v: number) => `${v.toFixed(1)} decibels`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function PresetCard({
  name,
  subtitle,
  colors,
  active,
  onClick,
  hint,
  disabled,
}: {
  name: string;
  subtitle: string;
  colors: readonly [string, string];
  active?: boolean;
  onClick: () => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        'group relative flex min-h-[74px] flex-col justify-end overflow-hidden rounded-card p-3 text-left text-white transition hover:scale-[1.02] disabled:opacity-50',
        active ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg' : 'ring-0',
      )}
      style={{ backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
    >
      {hint && (
        <span
          className="absolute right-2 top-2 rounded-full bg-black/30 px-1.5 text-[10px] font-bold"
          aria-hidden="true"
        >
          {hint}
        </span>
      )}
      <span className="pr-5 text-sm font-bold leading-tight drop-shadow">{name}</span>
      <span className="text-[11px] leading-tight text-white/85">{subtitle}</span>
    </button>
  );
}

function Section({
  title,
  children,
  right,
  defaultOpen = true,
  note,
}: {
  title: string;
  children: ReactNode;
  right?: ReactNode;
  defaultOpen?: boolean;
  note?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-card border border-line bg-surface">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left font-display text-sm font-semibold"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown
            size={16}
            className={cn('transition', !open && '-rotate-90')}
            aria-hidden="true"
          />
          {title}
          {note && (
            <Tip content={note}>
              <span className="text-muted" aria-label={note} tabIndex={0}>
                <Info size={14} />
              </span>
            </Tip>
          )}
        </button>
        {right}
      </div>
      {open && <div className="flex flex-col gap-4 px-4 pb-4">{children}</div>}
    </section>
  );
}

function HeadroomMeter({ read }: { read: () => { autoDb: number; limiterDb: number } | null }) {
  const bar = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const h = read();
      if (h && bar.current && label.current) {
        const red = Math.min(12, Math.abs(h.limiterDb));
        bar.current.style.width = `${(red / 12) * 100}%`;
        label.current.textContent = `${h.autoDb < -0.05 ? `auto −${Math.abs(h.autoDb).toFixed(1)} dB · ` : ''}limiter ${red > 0.05 ? `−${red.toFixed(1)}` : '0'} dB`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [read]);
  return (
    <div className="flex flex-col gap-1" aria-label="Headroom meter">
      <div className="flex justify-between text-[11px] text-muted">
        <span>Headroom</span>
        <span ref={label} className="tabular-nums">
          limiter 0 dB
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
        <div
          ref={bar}
          className="h-full w-0 rounded-full bg-gradient-to-r from-amber-400 to-red-500 transition-[width]"
        />
      </div>
    </div>
  );
}

/**
 * The complete Sound Lab control surface (spec §4). Pure: it renders `value` and reports
 * changes; the host (web app, desktop Boost, extension popup) applies them to its engine.
 */
export function SoundLabControls({
  value,
  onChange,
  limits = {},
  headroom,
  compact,
  keyHints,
  pitchNote,
}: SoundLabControlsProps) {
  const set = (fn: (s: SoundSettings) => void) => {
    const next = cloneSound(value);
    fn(next);
    onChange(next);
  };
  const graphOff = Boolean(limits.graph);
  const active = matchPreset(value);
  const independent = value.pitchMode === 'independent';
  return (
    <div className={cn('flex flex-col', compact ? 'gap-3' : 'gap-4')}>
      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 2xl:grid-cols-7',
        )}
        role="group"
        aria-label="Sound presets"
      >
        {/* In Limited mode presets still apply: their tape speed is heard, the rest waits. */}
        {SOUND_PRESETS.map((p, i) => (
          <PresetCard
            key={p.id}
            name={p.name}
            subtitle={p.subtitle}
            colors={p.colors}
            active={active?.id === p.id}
            hint={keyHints && i < 8 ? String(i + 1) : undefined}
            onClick={() => onChange(cloneSound(p.settings))}
          />
        ))}
      </div>

      <Section title="Speed & pitch" note={limits.speed}>
        <Slider
          label="Speed"
          min={LIMITS.speed[0]}
          max={LIMITS.speed[1]}
          step={0.01}
          value={value.speed}
          resetTo={1}
          disabled={Boolean(limits.speed)}
          disabledReason={limits.speed}
          display={(v) => `${v.toFixed(2)}×`}
          valueText={(v) => `${v.toFixed(2)} times`}
          onChange={(v) => set((s) => (s.speed = v))}
          testId="speed-slider"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick speeds">
          {[0.8, 0.9, 1, 1.1, 1.25, 1.4].map((r) => (
            <button
              key={r}
              type="button"
              disabled={Boolean(limits.speed)}
              onClick={() => set((s) => (s.speed = r))}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40',
                Math.abs(value.speed - r) < 0.001
                  ? 'bg-accent-fill text-on-accent'
                  : 'bg-surface-hover text-muted hover:text-fg',
              )}
            >
              {r}×
            </button>
          ))}
        </div>
        <Switch
          label="Keep pitch"
          description={
            limits.pitch ??
            (independent
              ? 'Tempo and pitch move separately.'
              : 'Tape mode: speed and pitch move together (Mixr-style).')
          }
          checked={independent}
          disabled={Boolean(limits.pitch) && !independent}
          onChange={(v) => set((s) => (s.pitchMode = v ? 'independent' : 'tape'))}
          testId="keep-pitch"
        />
        {independent && (
          <Slider
            label="Pitch"
            min={LIMITS.pitchSemitones[0]}
            max={LIMITS.pitchSemitones[1]}
            step={0.1}
            value={value.pitchSemitones}
            resetTo={0}
            disabled={Boolean(limits.pitch) || graphOff}
            disabledReason={limits.pitch ?? limits.graph}
            display={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} st`}
            valueText={(v) => `${v.toFixed(1)} semitones`}
            onChange={(v) => set((s) => (s.pitchSemitones = v))}
          />
        )}
        {pitchNote && <p className="text-xs text-muted">{pitchNote}</p>}
      </Section>

      {graphOff && (
        <p
          role="note"
          className="rounded-ctl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
        >
          {limits.graph}
        </p>
      )}

      <Section title="Bass & EQ" defaultOpen={!compact} note={limits.graph}>
        <Slider
          label="Bass boost"
          min={LIMITS.bassBoostDb[0]}
          max={LIMITS.bassBoostDb[1]}
          step={0.5}
          value={value.bassBoostDb}
          resetTo={0}
          disabled={graphOff}
          disabledReason={limits.graph}
          display={signedDb}
          valueText={dbWords}
          onChange={(v) => set((s) => (s.bassBoostDb = v))}
          testId="bass-slider"
        />
        <EqEditor
          value={value}
          onChange={onChange}
          disabled={graphOff}
          disabledReason={limits.graph}
        />
        <Slider
          label="Preamp"
          min={LIMITS.preampDb[0]}
          max={LIMITS.preampDb[1]}
          step={0.5}
          value={value.preampDb}
          resetTo={0}
          disabled={graphOff}
          disabledReason={limits.graph}
          display={signedDb}
          valueText={dbWords}
          onChange={(v) => set((s) => (s.preampDb = v))}
        />
        {headroom && !graphOff && <HeadroomMeter read={headroom} />}
      </Section>

      <Section title="Reverb" defaultOpen={!compact} note={limits.graph}>
        <Slider
          label="Amount"
          min={0}
          max={1}
          step={0.01}
          value={value.reverb.amount}
          resetTo={0}
          disabled={graphOff}
          disabledReason={limits.graph}
          display={pct}
          valueText={(v) => `${Math.round(v * 100)} percent`}
          onChange={(v) => set((s) => (s.reverb.amount = v))}
          testId="reverb-amount"
        />
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Room type">
          {ROOM_TYPES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={value.reverb.room === r}
              disabled={graphOff}
              onClick={() => set((s) => (s.reverb.room = r))}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-40',
                value.reverb.room === r
                  ? 'bg-accent-fill text-on-accent'
                  : 'bg-surface-hover text-muted hover:text-fg',
              )}
            >
              {ROOM_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Slider
            label="Pre-delay"
            min={LIMITS.preDelayMs[0]}
            max={LIMITS.preDelayMs[1]}
            step={1}
            value={value.reverb.preDelayMs}
            disabled={graphOff}
            disabledReason={limits.graph}
            display={(v) => `${v} ms`}
            valueText={(v) => `${v} milliseconds`}
            onChange={(v) => set((s) => (s.reverb.preDelayMs = v))}
          />
          <Slider
            label="Tone"
            min={0}
            max={1}
            step={0.01}
            value={value.reverb.tone}
            disabled={graphOff}
            disabledReason={limits.graph}
            display={(v) => (v < 0.35 ? 'Dark' : v > 0.75 ? 'Bright' : 'Warm')}
            valueText={(v) => `${Math.round(v * 100)} percent bright`}
            onChange={(v) => set((s) => (s.reverb.tone = v))}
          />
        </div>
      </Section>

      <Section title="Space: 8D & width" defaultOpen={!compact} note={limits.graph}>
        <Switch
          label="8D audio"
          description="The sound orbits around your head — best on headphones."
          checked={value.eightD.enabled}
          disabled={graphOff}
          onChange={(v) => set((s) => (s.eightD.enabled = v))}
          testId="eightd-toggle"
        />
        <div className="grid grid-cols-2 gap-3">
          <Slider
            label="Orbit speed"
            min={LIMITS.eightDSpeed[0]}
            max={LIMITS.eightDSpeed[1]}
            step={0.01}
            value={value.eightD.speedHz}
            disabled={graphOff || !value.eightD.enabled}
            disabledReason={limits.graph}
            display={(v) => `${v.toFixed(2)} Hz`}
            valueText={(v) => `${v.toFixed(2)} hertz`}
            onChange={(v) => set((s) => (s.eightD.speedHz = v))}
          />
          <Slider
            label="Width"
            min={LIMITS.eightDRadius[0]}
            max={LIMITS.eightDRadius[1]}
            step={0.05}
            value={value.eightD.radius}
            disabled={graphOff || !value.eightD.enabled}
            disabledReason={limits.graph}
            display={(v) => v.toFixed(2)}
            onChange={(v) => set((s) => (s.eightD.radius = v))}
          />
        </div>
        <Switch
          label="Height wobble"
          checked={value.eightD.heightWobble}
          disabled={graphOff || !value.eightD.enabled}
          onChange={(v) => set((s) => (s.eightD.heightWobble = v))}
        />
        <Slider
          label="Stereo widener"
          min={LIMITS.widener[0]}
          max={LIMITS.widener[1]}
          step={0.05}
          value={value.widener}
          resetTo={1}
          disabled={graphOff}
          disabledReason={limits.graph}
          display={(v) => (v < 0.05 ? 'Mono' : `${Math.round(v * 100)}%`)}
          valueText={(v) => `${Math.round(v * 100)} percent width`}
          onChange={(v) => set((s) => (s.widener = v))}
        />
      </Section>

      <Section title="Character" defaultOpen={!compact} note={limits.graph}>
        <Switch
          label="Lo-fi"
          description="Warm band-limit, tape wow and vinyl crackle."
          checked={value.lofi.enabled}
          disabled={graphOff}
          onChange={(v) =>
            set((s) => {
              s.lofi.enabled = v;
              if (v && s.lofi.amount === 0) s.lofi.amount = 0.5;
            })
          }
        />
        {value.lofi.enabled && (
          <Slider
            label="Lo-fi amount"
            min={0}
            max={1}
            step={0.01}
            value={value.lofi.amount}
            disabled={graphOff}
            display={pct}
            onChange={(v) => set((s) => (s.lofi.amount = v))}
          />
        )}
        <Switch
          label="Karaoke (vocal reduce)"
          description="Pulls centre-panned vocals back; keeps the bass."
          checked={value.vocalReduce.enabled}
          disabled={graphOff}
          onChange={(v) =>
            set((s) => {
              s.vocalReduce.enabled = v;
              if (v && s.vocalReduce.amount === 0) s.vocalReduce.amount = 0.9;
            })
          }
        />
        {value.vocalReduce.enabled && (
          <Slider
            label="Vocal reduction"
            min={0}
            max={1}
            step={0.01}
            value={value.vocalReduce.amount}
            disabled={graphOff}
            display={pct}
            onChange={(v) => set((s) => (s.vocalReduce.amount = v))}
          />
        )}
        <Switch
          label="Compressor"
          description="Evens out loud and quiet parts."
          checked={value.compressor.enabled}
          disabled={graphOff}
          onChange={(v) => set((s) => (s.compressor.enabled = v))}
        />
        {value.compressor.enabled && (
          <div className="grid grid-cols-2 gap-3">
            <Slider
              label="Threshold"
              min={LIMITS.threshold[0]}
              max={LIMITS.threshold[1]}
              step={1}
              value={value.compressor.threshold}
              display={signedDb}
              valueText={dbWords}
              onChange={(v) => set((s) => (s.compressor.threshold = v))}
            />
            <Slider
              label="Ratio"
              min={LIMITS.ratio[0]}
              max={LIMITS.ratio[1]}
              step={0.5}
              value={value.compressor.ratio}
              display={(v) => `${v}:1`}
              valueText={(v) => `${v} to 1`}
              onChange={(v) => set((s) => (s.compressor.ratio = v))}
            />
            <Slider
              label="Attack"
              min={0}
              max={0.2}
              step={0.001}
              value={value.compressor.attack}
              display={(v) => `${Math.round(v * 1000)} ms`}
              onChange={(v) => set((s) => (s.compressor.attack = v))}
            />
            <Slider
              label="Release"
              min={LIMITS.release[0]}
              max={LIMITS.release[1]}
              step={0.01}
              value={value.compressor.release}
              display={(v) => `${Math.round(v * 1000)} ms`}
              onChange={(v) => set((s) => (s.compressor.release = v))}
            />
            <Slider
              label="Knee"
              min={LIMITS.knee[0]}
              max={LIMITS.knee[1]}
              step={1}
              value={value.compressor.knee}
              display={(v) => `${v} dB`}
              onChange={(v) => set((s) => (s.compressor.knee = v))}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
