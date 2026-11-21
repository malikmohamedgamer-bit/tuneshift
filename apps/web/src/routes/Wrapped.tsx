import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { formatMinutes, type ListeningStats, type StatsPeriod } from '@tuneshift/core';
import { Button, IconButton, Segmented } from '@tuneshift/ui';
import { toast } from 'sonner';
import { EmptyState } from '../components/common';
import { useStats } from '../lib/queries';
import { useSettings, prefersReducedMotion } from '../state/settings';
import { downloadBlob } from '../lib/images';

const PERIOD_LABEL: Record<StatsPeriod, string> = {
  week: 'This week',
  month: 'This month',
  year: 'This year',
  all: 'All time',
};

/** Draws a 1080×1920 shareable summary card (no DOM capture needed). */
async function renderCard(s: ListeningStats, name: string, period: StatsPeriod): Promise<Blob> {
  const W = 1080;
  const H = 1920;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  const css = getComputedStyle(document.documentElement);
  const a1 = css.getPropertyValue('--accent').trim() || '#8b5cf6';
  const a2 = css.getPropertyValue('--accent-2').trim() || '#ec4899';
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0d0b14');
  grad.addColorStop(0.45, a1);
  grad.addColorStop(1, a2);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  await document.fonts.ready;
  const font = (size: number, weight = 800) =>
    `${weight} ${size}px 'Outfit Variable', system-ui, sans-serif`;
  g.fillStyle = '#fff';
  g.textBaseline = 'top';
  g.font = font(54, 700);
  g.fillText('TUNESHIFT WRAPPED', 90, 110);
  g.font = font(44, 500);
  g.globalAlpha = 0.85;
  g.fillText(`${PERIOD_LABEL[period]}${name ? ` · ${name}` : ''}`, 90, 185);
  g.globalAlpha = 1;
  const block = (y: number, label: string, value: string, sub?: string) => {
    g.font = font(36, 600);
    g.globalAlpha = 0.8;
    g.fillText(label.toUpperCase(), 90, y);
    g.globalAlpha = 1;
    g.font = font(value.length > 18 ? 70 : 96);
    const clipped = value.length > 26 ? `${value.slice(0, 25)}…` : value;
    g.fillText(clipped, 90, y + 50);
    if (sub) {
      g.font = font(40, 500);
      g.globalAlpha = 0.85;
      g.fillText(
        sub.length > 40 ? `${sub.slice(0, 39)}…` : sub,
        90,
        y + (value.length > 18 ? 140 : 165),
      );
      g.globalAlpha = 1;
    }
  };
  block(330, 'Minutes listened', s.minutes.toLocaleString(), formatMinutes(s.minutes));
  block(620, 'Top song', s.topTracks[0]?.label ?? '—', s.topTracks[0]?.sublabel);
  block(910, 'Top artist', s.topArtists[0]?.label ?? '—');
  block(1150, 'Top genre', s.topGenres[0]?.label ?? '—');
  block(1390, 'Signature sound', s.mostUsedPreset?.label ?? 'Normal');
  g.font = font(34, 500);
  g.globalAlpha = 0.75;
  g.fillText('made with Tuneshift', 90, H - 120);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'),
  );
}

function Slide({ children, colors }: { children: ReactNode; colors: [string, string] }) {
  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-4 p-8 text-white"
      style={{ backgroundImage: `linear-gradient(160deg, ${colors[0]}, ${colors[1]})` }}
    >
      {children}
    </div>
  );
}

export function Wrapped() {
  const [period, setPeriod] = useState<StatsPeriod>('year');
  const s = useStats(period);
  const name = useSettings((x) => x.displayName);
  const nav = useNavigate();
  const [i, setI] = useState(0);
  const slides: { colors: [string, string]; body: ReactNode }[] = [
    {
      colors: ['#1e1b4b', '#7c3aed'],
      body: (
        <>
          <p className="text-sm font-bold uppercase tracking-widest text-white/80">
            Tuneshift Wrapped
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-tight">
            {name
              ? `${name}, here's your ${PERIOD_LABEL[period].toLowerCase()}`
              : `Your ${PERIOD_LABEL[period].toLowerCase()} in sound`}
          </h1>
          <p className="text-white/85">Swipe or use the arrows →</p>
        </>
      ),
    },
    {
      colors: ['#7c3aed', '#db2777'],
      body: (
        <>
          <p className="text-lg text-white/85">You listened for</p>
          <h2 className="font-display text-7xl font-extrabold">{s.minutes.toLocaleString()}</h2>
          <p className="text-2xl font-bold">minutes</p>
          <p className="text-white/85">
            That's {formatMinutes(s.minutes)} across {s.plays} plays.
          </p>
        </>
      ),
    },
    {
      colors: ['#db2777', '#f97316'],
      body: (
        <>
          <p className="text-lg text-white/85">Your song on repeat</p>
          <h2 className="font-display text-5xl font-extrabold">{s.topTracks[0]?.label ?? '—'}</h2>
          <p className="text-xl">{s.topTracks[0]?.sublabel}</p>
          <ol className="mt-4 space-y-1 text-white/90">
            {s.topTracks.slice(1, 5).map((t, k) => (
              <li key={t.key}>
                {k + 2}. {t.label} — {t.sublabel}
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      colors: ['#0891b2', '#4338ca'],
      body: (
        <>
          <p className="text-lg text-white/85">Top artist</p>
          <h2 className="font-display text-6xl font-extrabold">{s.topArtists[0]?.label ?? '—'}</h2>
          <p className="mt-4 text-lg text-white/85">Top genres</p>
          <p className="text-2xl font-bold">
            {s.topGenres
              .slice(0, 3)
              .map((g) => g.label)
              .join(' · ') || '—'}
          </p>
        </>
      ),
    },
    {
      colors: ['#10b981', '#6366f1'],
      body: (
        <>
          <p className="text-lg text-white/85">Your signature sound</p>
          <span className="inline-flex w-fit rounded-full bg-white/20 px-5 py-2 font-display text-4xl font-extrabold backdrop-blur">
            {s.mostUsedPreset?.label ?? 'Normal'}
          </span>
          <p className="text-white/85">
            {s.peakHour !== undefined ? `You're most in the zone around ${s.peakHour}:00.` : ''}
          </p>
        </>
      ),
    },
  ];
  const n = slides.length;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((v) => Math.min(n - 1, v + 1));
      if (e.key === 'ArrowLeft') setI((v) => Math.max(0, v - 1));
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [n]);
  if (s.plays === 0) {
    return (
      <EmptyState
        title="Not enough listening yet"
        body="Wrapped needs at least one full play (30 s+). Come back after a few songs."
        action={<Button onClick={() => void nav('/')}>Go play something</Button>}
      />
    );
  }
  let startX = 0;
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <div className="flex items-center justify-between">
        <Segmented
          label="Period"
          size="sm"
          value={period}
          onChange={(p) => (setPeriod(p), setI(0))}
          options={(['week', 'month', 'year', 'all'] as const).map((p) => ({
            value: p,
            label: PERIOD_LABEL[p],
          }))}
        />
        <IconButton label="Close Wrapped" onClick={() => void nav('/stats')}>
          <X />
        </IconButton>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {slides.map((_, k) => (
          <span
            key={k}
            className={`h-1 flex-1 rounded-full ${k <= i ? 'bg-fg' : 'bg-surface-hover'}`}
          />
        ))}
      </div>
      <div
        className="relative aspect-[9/16] w-full overflow-hidden rounded-panel shadow-theme"
        role="region"
        aria-roledescription="carousel"
        aria-label={`Wrapped slide ${i + 1} of ${n}`}
        onTouchStart={(e) => (startX = e.touches[0]?.clientX ?? 0)}
        onTouchEnd={(e) => {
          const dx = (e.changedTouches[0]?.clientX ?? 0) - startX;
          if (dx < -40) setI((v) => Math.min(n - 1, v + 1));
          if (dx > 40) setI((v) => Math.max(0, v - 1));
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            className="absolute inset-0"
            initial={prefersReducedMotion() ? false : { opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
          >
            <Slide colors={slides[i]?.colors ?? ['#000', '#000']}>{slides[i]?.body}</Slide>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="flex items-center justify-between">
        <IconButton label="Previous slide" disabled={i === 0} onClick={() => setI(i - 1)}>
          <ChevronLeft />
        </IconButton>
        <Button
          variant="primary"
          icon={<Download size={16} />}
          onClick={() =>
            void renderCard(s, name, period)
              .then((b) => downloadBlob(b, `tuneshift-wrapped-${period}.png`))
              .catch((e: unknown) => toast.error(e instanceof Error ? e.message : 'Export failed'))
          }
        >
          Save as image
        </Button>
        <IconButton label="Next slide" disabled={i === n - 1} onClick={() => setI(i + 1)}>
          <ChevronRight />
        </IconButton>
      </div>
    </div>
  );
}
