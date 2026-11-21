import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, Download, Palette, Plus, Share2, Trash2, Upload } from 'lucide-react';
import {
  contrastPairs,
  contrastRatio,
  decodeShareCode,
  encodeShareCode,
  FONT_IDS,
  FONT_LABEL,
  ThemeSchema,
  TOKEN_KEYS,
  TOKEN_LABEL,
  type FontId,
  type Theme,
} from '@tuneshift/core';
import { applyTheme, Button, cn, IconButton, Segmented, Slider, Switch } from '@tuneshift/ui';
import { toast } from 'sonner';
import { SectionHeader } from '../../components/common';
import { useSettings } from '../../state/settings';
import {
  deleteCustomTheme,
  newThemeFrom,
  saveCustomTheme,
  useActiveTheme,
  useAllThemes,
} from '../../state/theme';
import { downloadBlob } from '../../lib/images';
import { askText } from '../../components/Ask';
import { publicSiteUrl } from '../../env';

function Swatch({
  theme,
  active,
  onClick,
}: {
  theme: Theme;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'overflow-hidden rounded-card border text-left transition hover:scale-[1.02]',
        active ? 'border-fg ring-2 ring-accent' : 'border-line',
      )}
      style={{ background: theme.tokens.bg }}
      data-testid={`theme-${theme.id}`}
    >
      <div
        className="h-12"
        style={{
          backgroundImage: `linear-gradient(${theme.gradient.angle}deg, ${theme.gradient.stops.join(', ')})`,
        }}
      />
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="truncate text-sm font-semibold" style={{ color: theme.tokens.text }}>
          {theme.name}
        </span>
        {active && <Check size={15} style={{ color: theme.tokens.text }} />}
      </div>
    </button>
  );
}

function ThemeEditor({ base, onDone }: { base: Theme; onDone: () => void }) {
  const [t, setT] = useState<Theme>(() =>
    base.builtIn ? newThemeFrom(base, `${base.name} (mine)`) : base,
  );
  const set = useSettings((s) => s.set);
  const pairs = useMemo(
    () => contrastPairs(t).map((p) => ({ ...p, ratio: contrastRatio(p.fg, p.bg) })),
    [t],
  );
  // Live preview: apply while editing; the ThemeController re-applies the saved theme afterwards.
  useEffect(() => {
    applyTheme(t);
  }, [t]);
  const save = async () => {
    try {
      const rec = await saveCustomTheme(t);
      set({ themeId: rec.id });
      toast.success(`Saved “${t.name}”`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid theme');
    }
  };
  const field = 'h-9 rounded-ctl border border-line bg-bg px-2 text-sm';
  return (
    <div
      className="space-y-5 rounded-card border border-line bg-surface p-4"
      aria-label="Theme editor"
    >
      <label className="flex flex-col gap-1 text-xs text-muted">
        Theme name
        <input
          value={t.name}
          maxLength={60}
          onChange={(e) => setT({ ...t, name: e.target.value })}
          className={field}
        />
      </label>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Colours</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {TOKEN_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-xs">
              <input
                type="color"
                value={t.tokens[k]}
                onChange={(e) => setT({ ...t, tokens: { ...t.tokens, [k]: e.target.value } })}
                aria-label={TOKEN_LABEL[k]}
                className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
              />
              {TOKEN_LABEL[k]}
            </label>
          ))}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Gradient</h3>
        <div
          className="mb-2 h-10 rounded-ctl"
          style={{
            backgroundImage: `linear-gradient(${t.gradient.angle}deg, ${t.gradient.stops.join(', ')})`,
          }}
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center gap-2">
          {t.gradient.stops.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <input
                type="color"
                value={c}
                aria-label={`Gradient stop ${i + 1}`}
                onChange={(e) =>
                  setT({
                    ...t,
                    gradient: {
                      ...t.gradient,
                      stops: t.gradient.stops.map((x, k) => (k === i ? e.target.value : x)),
                    },
                  })
                }
                className="h-8 w-10 rounded border border-line"
              />
              {t.gradient.stops.length > 2 && (
                <IconButton
                  label={`Remove stop ${i + 1}`}
                  size="sm"
                  onClick={() =>
                    setT({
                      ...t,
                      gradient: {
                        ...t.gradient,
                        stops: t.gradient.stops.filter((_, k) => k !== i),
                      },
                    })
                  }
                >
                  <Trash2 size={13} />
                </IconButton>
              )}
            </span>
          ))}
          {t.gradient.stops.length < 4 && (
            <Button
              size="sm"
              variant="outline"
              icon={<Plus size={13} />}
              onClick={() =>
                setT({
                  ...t,
                  gradient: { ...t.gradient, stops: [...t.gradient.stops, t.tokens.accent2] },
                })
              }
            >
              Stop
            </Button>
          )}
        </div>
        <Slider
          className="mt-3 max-w-sm"
          label="Angle"
          min={0}
          max={360}
          value={t.gradient.angle}
          display={(v) => `${v}°`}
          onChange={(v) => setT({ ...t, gradient: { ...t.gradient, angle: v } })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider
          label="Glass blur"
          min={0}
          max={40}
          value={t.blur}
          display={(v) => `${v}px`}
          onChange={(v) => setT({ ...t, blur: v })}
        />
        <Slider
          label="Corner radius"
          min={0}
          max={28}
          value={t.radius}
          display={(v) => `${v}px`}
          onChange={(v) => setT({ ...t, radius: v })}
        />
        <label className="flex flex-col gap-1 text-xs text-muted">
          Body font
          <select
            value={t.fontSans}
            onChange={(e) => setT({ ...t, fontSans: e.target.value as FontId })}
            className={field}
          >
            {FONT_IDS.map((f) => (
              <option key={f} value={f}>
                {FONT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Heading font
          <select
            value={t.fontDisplay}
            onChange={(e) => setT({ ...t, fontDisplay: e.target.value as FontId })}
            className={field}
          >
            {FONT_IDS.map((f) => (
              <option key={f} value={f}>
                {FONT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <Segmented
          label="Density"
          value={t.density}
          onChange={(d) => setT({ ...t, density: d })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
        <Segmented
          label="Shadows"
          value={t.shadow}
          onChange={(s) => setT({ ...t, shadow: s })}
          options={[
            { value: 'none', label: 'None' },
            { value: 'soft', label: 'Soft' },
            { value: 'strong', label: 'Strong' },
          ]}
        />
        <Switch
          label="Animated gradient background"
          checked={t.animatedGradient}
          onChange={(v) => setT({ ...t, animatedGradient: v })}
        />
        <Switch
          label="Adaptive accent from album art"
          description="Picks a colour from the cover, kept readable (WCAG AA)."
          checked={t.adaptiveAccent}
          onChange={(v) => setT({ ...t, adaptiveAccent: v })}
        />
        <Switch
          label="Falling petals"
          checked={Boolean(t.petals)}
          onChange={(v) => setT({ ...t, petals: v })}
        />
        <Segmented
          label="Scheme"
          value={t.colorScheme}
          onChange={(c) => setT({ ...t, colorScheme: c })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Custom CSS (advanced)</h3>
        <p className="mb-2 text-xs text-muted">
          Scoped to the app. If something breaks, hold Shift while the app loads (or open it with
          ?safe) to reset to a safe theme.
        </p>
        <textarea
          value={t.customCss ?? ''}
          onChange={(e) => setT({ ...t, customCss: e.target.value })}
          rows={5}
          spellCheck={false}
          placeholder={'.rounded-card { border-width: 2px; }'}
          className="w-full rounded-ctl border border-line bg-bg p-2 font-mono text-xs"
          aria-label="Custom CSS"
        />
      </div>
      <div>
        <h3 className="mb-1 text-sm font-semibold">Readability check</h3>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {pairs.map((p) => (
            <li key={p.label} className={p.ratio >= 4.5 ? 'text-muted' : 'text-amber-300'}>
              {p.ratio >= 4.5 ? '✓' : '⚠'} {p.label}: {p.ratio.toFixed(1)}:1
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[11px] text-muted">
          Muted text and accents are adjusted automatically to stay readable.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => void save()}>
          Save theme
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const themes = useAllThemes();
  const active = useActiveTheme();
  const s = useSettings();
  const [editing, setEditing] = useState<Theme | null>(null);
  const share = async (t: Theme) => {
    const code = encodeShareCode({ kind: 'theme', data: { ...t, builtIn: false } });
    await navigator.clipboard.writeText(`${publicSiteUrl()}s/${code}`);
    toast.success('Theme link copied');
  };
  const importCode = async () => {
    const raw = await askText({
      title: 'Add a shared theme',
      label: 'Paste a theme code or link',
      placeholder: 'ts1.t.… or https://…/s/…',
    });
    if (!raw) return;
    try {
      const p = decodeShareCode(raw);
      if (p.kind !== 'theme') throw new Error(`That code is a ${p.kind}, not a theme`);
      const rec = await saveCustomTheme({ ...p.data, id: `custom-${Date.now().toString(36)}` });
      s.set({ themeId: rec.id });
      toast.success(`Added “${rec.name}”`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Invalid code');
    }
  };
  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const t = ThemeSchema.parse(JSON.parse(await f.text()));
        const rec = await saveCustomTheme({
          ...(t as Theme),
          id: `custom-${Date.now().toString(36)}`,
        });
        s.set({ themeId: rec.id });
        toast.success(`Imported “${rec.name}”`);
      } catch {
        toast.error("That file isn't a Tuneshift theme");
      }
    };
    input.click();
  };
  return (
    <div className="space-y-6">
      <section>
        <SectionHeader title="Theme" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {themes.map((t) => (
            <Swatch
              key={t.id}
              theme={t}
              active={active.id === t.id}
              onClick={() => s.set({ themeId: t.id })}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={<Palette size={15} />} onClick={() => setEditing(active)}>
            {active.builtIn ? 'Customize this theme' : 'Edit theme'}
          </Button>
          <Button variant="ghost" icon={<Share2 size={15} />} onClick={() => void share(active)}>
            Share
          </Button>
          <Button
            variant="ghost"
            icon={<Download size={15} />}
            onClick={() =>
              downloadBlob(
                new Blob([JSON.stringify({ ...active, builtIn: false }, null, 2)], {
                  type: 'application/json',
                }),
                `${active.name}.tuneshift-theme.json`,
              )
            }
          >
            Export
          </Button>
          <Button variant="ghost" icon={<Upload size={15} />} onClick={importFile}>
            Import file
          </Button>
          <Button variant="ghost" icon={<Copy size={15} />} onClick={() => void importCode()}>
            Paste code
          </Button>
          {!active.builtIn && (
            <Button
              variant="ghost"
              icon={<Trash2 size={15} />}
              onClick={() => void deleteCustomTheme(active.id)}
            >
              Delete
            </Button>
          )}
        </div>
      </section>
      {editing && <ThemeEditor key={editing.id} base={editing} onDone={() => setEditing(null)} />}
      <section className="space-y-4">
        <SectionHeader title="Layout & display" />
        <Segmented
          label="Layout"
          value={s.layout}
          onChange={(layout) => s.set({ layout })}
          options={[
            { value: 'classic', label: 'Classic' },
            { value: 'compact', label: 'Compact' },
            { value: 'focus', label: 'Focus' },
          ]}
        />
        <Slider
          className="max-w-sm"
          label="Text size"
          min={0.9}
          max={1.3}
          step={0.05}
          value={s.textScale}
          display={(v) => `${Math.round(v * 100)}%`}
          valueText={(v) => `${Math.round(v * 100)} percent`}
          onChange={(v) => s.set({ textScale: v })}
        />
        <Segmented
          label="Motion"
          value={s.motion}
          onChange={(motion) => s.set({ motion })}
          options={[
            { value: 'system', label: 'Follow system' },
            { value: 'reduced', label: 'Reduced' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </section>
    </div>
  );
}
