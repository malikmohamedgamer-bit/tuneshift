import { useState } from 'react';
import { Link } from 'react-router';
import { Sparkles } from 'lucide-react';
import { formatMinutes, type StatsPeriod } from '@tuneshift/core';
import { Badge, Segmented } from '@tuneshift/ui';
import { EmptyState, PageHeader, SectionHeader } from '../components/common';
import { useStats } from '../lib/queries';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function ListeningClock({ clock }: { clock: number[][] }) {
  const max = Math.max(0.001, ...clock.flat());
  return (
    <div className="overflow-x-auto">
      <table
        className="border-separate border-spacing-0.5 text-[10px]"
        aria-label="Listening clock: minutes per weekday and hour"
      >
        <thead>
          <tr>
            <th />
            {Array.from({ length: 24 }, (_, h) => (
              <th key={h} scope="col" className="w-5 font-normal text-muted">
                {h % 3 === 0 ? h : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clock.map((row, d) => (
            <tr key={d}>
              <th scope="row" className="pr-1 text-right font-normal text-muted">
                {DAYS[d]}
              </th>
              {row.map((v, h) => (
                <td
                  key={h}
                  title={`${DAYS[d]} ${h}:00 — ${Math.round(v)} min`}
                  className="h-5 w-5 rounded-sm"
                  style={{
                    background:
                      v > 0
                        ? `color-mix(in srgb, var(--accent) ${Math.round(15 + (v / max) * 85)}%, transparent)`
                        : 'var(--surface-hover)',
                  }}
                >
                  <span className="sr-only">{Math.round(v)} minutes</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Ranked({
  title,
  items,
}: {
  title: string;
  items: { key: string; label: string; sublabel?: string; plays: number }[];
}) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <SectionHeader title={title} />
      {items.length ? (
        <ol className="space-y-1.5">
          {items.map((it, i) => (
            <li key={it.key} className="flex items-center gap-3 text-sm">
              <span className="w-5 text-right font-bold tabular-nums text-muted">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{it.label}</span>
                {it.sublabel && <span className="text-muted"> · {it.sublabel}</span>}
              </span>
              <span className="tabular-nums text-muted">{it.plays}×</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">Nothing yet.</p>
      )}
    </section>
  );
}

export function Stats() {
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const s = useStats(period);
  return (
    <div className="space-y-6">
      <PageHeader title="Your stats" subtitle="Plays count after 30 seconds of listening.">
        <Link
          to="/wrapped"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-hero px-4 text-sm font-bold text-white"
        >
          <Sparkles size={16} /> Tuneshift Wrapped
        </Link>
      </PageHeader>
      <Segmented
        label="Period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' },
          { value: 'all', label: 'All time' },
        ]}
      />
      {s.plays === 0 && s.minutes === 0 ? (
        <EmptyState
          title="No listening yet in this period"
          body="Play some music and come back — everything is computed on this device."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card bg-hero p-4 text-white">
              <div className="text-xs font-bold uppercase text-white/80">Minutes listened</div>
              <div className="font-display text-4xl font-extrabold">
                {s.minutes.toLocaleString()}
              </div>
              <div className="text-sm text-white/85">{formatMinutes(s.minutes)}</div>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <div className="text-xs font-bold uppercase text-muted">Plays</div>
              <div className="font-display text-4xl font-extrabold">{s.plays}</div>
            </div>
            <div className="rounded-card border border-line bg-surface p-4">
              <div className="text-xs font-bold uppercase text-muted">Most-used sound</div>
              <div className="mt-1">
                {s.mostUsedPreset ? <Badge tone="accent">{s.mostUsedPreset.label}</Badge> : '—'}
              </div>
              {s.peakHour !== undefined && (
                <div className="mt-2 text-sm text-muted">Peak hour: {s.peakHour}:00</div>
              )}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Ranked title="Top songs" items={s.topTracks} />
            <Ranked title="Top artists" items={s.topArtists} />
            <Ranked title="Top genres" items={s.topGenres} />
            <Ranked title="Top sounds" items={s.topPresets} />
          </div>
          <section className="rounded-card border border-line bg-surface p-4">
            <SectionHeader
              title="Listening clock"
              subtitle="When you listen, by weekday and hour"
            />
            <ListeningClock clock={s.clock} />
          </section>
        </>
      )}
    </div>
  );
}
