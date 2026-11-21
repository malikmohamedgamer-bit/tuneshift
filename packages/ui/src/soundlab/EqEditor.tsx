import { useEffect, useRef } from 'react';
import {
  EQ_BAND_LABELS,
  EQ_PRESETS,
  FILTER_TYPES,
  LIMITS,
  cloneSound,
  logFrequencies,
  toneResponseDb,
  withEqPreset,
  type FilterType,
  type ParametricBand,
  type SoundSettings,
} from '@tuneshift/core';
import { Plus, Trash2 } from 'lucide-react';
import { Button, IconButton, Segmented, Slider, Switch } from '../controls';
import { cn } from '../cn';

const CURVE_FREQS = logFrequencies(160);

function EqCurve({ value }: { value: SoundSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = (c.width = Math.round(c.clientWidth * dpr));
    const h = (c.height = Math.round(c.clientHeight * dpr));
    const g = c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, w, h);
    const css = getComputedStyle(c);
    const a1 = css.getPropertyValue('--accent').trim() || '#8b5cf6';
    const a2 = css.getPropertyValue('--accent-2').trim() || '#ec4899';
    const grid = css.getPropertyValue('--border').trim() || '#333';
    const db = toneResponseDb(value, CURVE_FREQS);
    const range = 18;
    const y = (v: number) =>
      h / 2 - (Math.max(-range, Math.min(range, v)) / range) * (h / 2 - 4 * dpr);
    g.strokeStyle = grid;
    g.lineWidth = 1 * dpr;
    for (const v of [-12, 0, 12]) {
      g.beginPath();
      g.moveTo(0, y(v));
      g.lineTo(w, y(v));
      g.stroke();
    }
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, a1);
    grad.addColorStop(1, a2);
    g.beginPath();
    db.forEach((v, i) => {
      const x = (i / (db.length - 1)) * w;
      if (i === 0) g.moveTo(x, y(v));
      else g.lineTo(x, y(v));
    });
    g.strokeStyle = grad;
    g.lineWidth = 2.5 * dpr;
    g.stroke();
    g.lineTo(w, h / 2);
    g.lineTo(0, h / 2);
    g.closePath();
    g.globalAlpha = 0.15;
    g.fillStyle = grad;
    g.fill();
    g.globalAlpha = 1;
  }, [value]);
  return <canvas ref={ref} aria-hidden="true" className="pointer-events-none h-24 w-full" />;
}

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(Number.isInteger(v) ? 0 : 1)} dB`;
const dbText = (v: number) => `${v.toFixed(1)} decibels`;

export interface EqEditorProps {
  value: SoundSettings;
  onChange: (s: SoundSettings) => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function EqEditor({ value, onChange, disabled, disabledReason }: EqEditorProps) {
  const set = (fn: (s: SoundSettings) => void) => {
    const next = cloneSound(value);
    fn(next);
    onChange(next);
  };
  const matching = EQ_PRESETS.find((p) => p.gains.every((g, i) => g === value.eqGains[i]));
  const bands = value.parametric ?? [];
  return (
    <div
      className={cn('flex flex-col gap-3', disabled && 'opacity-60')}
      title={disabled ? disabledReason : undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          label="Equalizer"
          checked={value.eqEnabled}
          disabled={disabled}
          onChange={(v) => set((s) => (s.eqEnabled = v))}
        />
        <Segmented
          label="EQ mode"
          size="sm"
          value={value.eqMode}
          onChange={(m) =>
            set((s) => {
              s.eqMode = m;
              if (m === 'parametric' && !s.parametric?.length)
                s.parametric = [{ type: 'peaking', freq: 1000, q: 1, gainDb: 0 }];
            })
          }
          options={[
            { value: 'graphic', label: 'Graphic', disabled },
            { value: 'parametric', label: 'Parametric', disabled },
          ]}
        />
        {value.eqMode === 'graphic' && (
          <label className="ml-auto flex items-center gap-2 text-xs text-muted">
            Preset
            <select
              className="rounded-ctl border border-line bg-surface px-2 py-1 text-sm text-fg"
              value={matching?.id ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const p = EQ_PRESETS.find((x) => x.id === e.target.value);
                if (p) onChange(withEqPreset(value, p));
              }}
            >
              {!matching && <option value="">Custom</option>}
              {EQ_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="relative rounded-ctl bg-bg/40 p-2">
        <EqCurve value={value} />
      </div>
      {value.eqMode === 'graphic' ? (
        <div className="grid grid-cols-10 gap-1" role="group" aria-label="10-band equalizer">
          {EQ_BAND_LABELS.map((lbl, i) => (
            <Slider
              key={lbl}
              vertical
              label={`${lbl} hertz band`}
              min={LIMITS.eqGain[0]}
              max={LIMITS.eqGain[1]}
              step={0.5}
              value={value.eqGains[i] ?? 0}
              resetTo={0}
              disabled={disabled || !value.eqEnabled}
              disabledReason={disabledReason}
              display={() => lbl}
              valueText={dbText}
              onChange={(v) => set((s) => (s.eqGains[i] = v))}
              testId={`eq-band-${i}`}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {bands.map((b, i) => (
            <ParametricRow
              key={i}
              band={b}
              index={i}
              disabled={disabled || !value.eqEnabled}
              onChange={(nb) => set((s) => ((s.parametric as ParametricBand[])[i] = nb))}
              onRemove={() =>
                set((s) => (s.parametric = (s.parametric ?? []).filter((_, k) => k !== i)))
              }
            />
          ))}
          <Button
            size="sm"
            variant="outline"
            icon={<Plus size={14} />}
            disabled={disabled || bands.length >= 10}
            onClick={() =>
              set(
                (s) =>
                  (s.parametric = [
                    ...(s.parametric ?? []),
                    { type: 'peaking', freq: 1000, q: 1, gainDb: 0 },
                  ]),
              )
            }
          >
            Add band {bands.length >= 10 ? '(max 10)' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}

const FILTER_LABEL: Record<FilterType, string> = {
  peaking: 'Peak',
  lowshelf: 'Low shelf',
  highshelf: 'High shelf',
  lowpass: 'Low-pass',
  highpass: 'High-pass',
  bandpass: 'Band-pass',
  notch: 'Notch',
  allpass: 'All-pass',
};

function ParametricRow({
  band,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  band: ParametricBand;
  index: number;
  disabled?: boolean;
  onChange: (b: ParametricBand) => void;
  onRemove: () => void;
}) {
  const logF = Math.log10(band.freq);
  return (
    <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] items-end gap-2 rounded-ctl bg-surface-hover/50 p-2">
      <label className="flex flex-col text-xs text-muted">
        Type
        <select
          className="rounded-chip border border-line bg-surface px-1.5 py-1 text-xs text-fg"
          value={band.type}
          disabled={disabled}
          aria-label={`Band ${index + 1} filter type`}
          onChange={(e) => onChange({ ...band, type: e.target.value as FilterType })}
        >
          {FILTER_TYPES.map((t) => (
            <option key={t} value={t}>
              {FILTER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
      <Slider
        label={`Band ${index + 1} frequency`}
        min={Math.log10(20)}
        max={Math.log10(20000)}
        step={0.01}
        value={logF}
        disabled={disabled}
        display={() =>
          band.freq >= 1000 ? `${(band.freq / 1000).toFixed(1)}k` : `${Math.round(band.freq)}`
        }
        valueText={() => `${Math.round(band.freq)} hertz`}
        onChange={(v) => onChange({ ...band, freq: Math.round(Math.pow(10, v)) })}
      />
      <Slider
        label="Q"
        min={0.1}
        max={18}
        step={0.1}
        value={band.q}
        disabled={disabled}
        display={(v) => v.toFixed(1)}
        onChange={(v) => onChange({ ...band, q: v })}
      />
      <Slider
        label="Gain"
        min={-24}
        max={24}
        step={0.5}
        value={band.gainDb}
        disabled={disabled}
        display={db}
        valueText={dbText}
        onChange={(v) => onChange({ ...band, gainDb: v })}
      />
      <IconButton
        label={`Remove band ${index + 1}`}
        size="sm"
        disabled={disabled}
        onClick={onRemove}
      >
        <Trash2 size={15} />
      </IconButton>
    </div>
  );
}
