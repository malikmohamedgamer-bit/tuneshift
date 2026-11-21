import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge, Button, cn, Tip } from '@tuneshift/ui';
import type { Artwork as ArtworkT, SourceId, Track } from '@tuneshift/core';
import { AlertTriangle, Disc3, HardDrive, Music } from 'lucide-react';
import { isCoverToken, resolveArtworkUrl } from '../lib/localFiles';
import { registry } from '../lib/sources';

/** Resolves local cover tokens (IndexedDB) to object URLs. */
export function useArtworkUrl(
  art?: ArtworkT,
  size: 'small' | 'medium' | 'large' = 'medium',
): string | undefined {
  const raw = art?.[size] ?? art?.medium ?? art?.large ?? art?.small;
  const [url, setUrl] = useState<string | undefined>(isCoverToken(raw) ? undefined : raw);
  useEffect(() => {
    let live = true;
    if (!isCoverToken(raw)) {
      setUrl(raw);
      return;
    }
    void resolveArtworkUrl(raw).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [raw]);
  return url;
}

export function Artwork({
  art,
  alt,
  size = 'medium',
  className,
  rounded = 'rounded-ctl',
  seed,
}: {
  art?: ArtworkT;
  alt: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
  rounded?: string;
  /** Text used to pick a fallback gradient when there's no artwork. */
  seed?: string;
}) {
  const url = useArtworkUrl(art, size);
  // On a failed load, retry the same path on the next mirror host before giving up.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [url]);
  const mirrors = art?.mirrors ?? [];
  const failed = attempt > mirrors.length;
  let src = url;
  if (url && attempt > 0 && mirrors[attempt - 1]) {
    try {
      const u = new URL(url);
      src = `${mirrors[attempt - 1]?.replace(/\/$/, '')}${u.pathname}${u.search}`;
    } catch {
      src = url;
    }
  }
  if (!url || failed) {
    const h = [...(seed ?? alt)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn('grid shrink-0 place-items-center text-white/80', rounded, className)}
        style={{
          background: `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 60) % 360} 70% 35%))`,
        }}
      >
        <Music className="h-2/5 w-2/5" aria-hidden="true" />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setAttempt((a) => a + 1)}
      className={cn('shrink-0 bg-surface-hover object-cover', rounded, className)}
    />
  );
}

const SOURCE_TONE: Record<SourceId, string> = {
  local: 'bg-emerald-500/15 text-emerald-300',
  audius: 'bg-violet-500/15 text-violet-300',
  jamendo: 'bg-orange-500/15 text-orange-300',
};

export function SourceBadge({ source, className }: { source: SourceId; className?: string }) {
  const label = source === 'local' ? 'Local' : source === 'audius' ? 'Audius' : 'Jamendo';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide',
        SOURCE_TONE[source],
        className,
      )}
    >
      {label}
    </span>
  );
}

/** "Full Sound Lab" vs "Speed only" (spec §3 CORS-aware playback). */
export function CapabilityBadge({ track, mode }: { track: Track; mode?: 'fx' | 'direct' | null }) {
  const full = mode
    ? mode === 'fx'
    : registry.has(track.source) && registry.capabilities(track.source).fullEffects;
  return (
    <Tip
      content={
        full
          ? 'Every Sound Lab effect works on this track.'
          : "This source doesn't allow audio processing — only speed presets apply."
      }
    >
      <span tabIndex={0} data-testid="capability-badge">
        <Badge tone={full ? 'accent' : 'warn'}>{full ? 'Full Sound Lab' : 'Speed only'}</Badge>
      </span>
    </Tip>
  );
}

/** Attribution: artist + link to the source page, plus Jamendo's licence badge (spec §2). */
export function Attribution({ track, className }: { track: Track; className?: string }) {
  if (track.source === 'local') {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-muted', className)}>
        <HardDrive size={12} aria-hidden="true" />{' '}
        {track.local?.folder === 'Demo' ? 'Original Tuneshift demo' : 'Your file'}
      </span>
    );
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-2 text-xs text-muted', className)}>
      {track.permalink && (
        <a
          href={track.permalink}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted hover:text-fg"
        >
          {track.artist} on {track.source === 'audius' ? 'Audius' : 'Jamendo'}
        </a>
      )}
      {track.license && (
        <a
          href={track.license.url}
          target="_blank"
          rel="noreferrer license"
          className="rounded-full border border-line px-1.5 py-px text-[10px] font-bold hover:text-fg"
        >
          {track.license.name}
        </a>
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <div
        className="grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent-text"
        aria-hidden="true"
      >
        {icon ?? <Disc3 />}
      </div>
      <h3 className="font-display text-lg font-semibold">{title}</h3>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error: unknown;
  onRetry?: () => void;
}) {
  const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-red-500/30 bg-red-500/5 px-6 py-10 text-center"
    >
      <AlertTriangle className="text-red-400" aria-hidden="true" />
      <h3 className="font-display font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{msg}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-ctl bg-surface-hover', className)}
    />
  );
}

export function ShelfSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex gap-4 overflow-hidden" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-40 shrink-0 space-y-2">
          <Skeleton className="aspect-square w-full rounded-card" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  subtitle,
}: {
  title: string;
  action?: ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-xl font-bold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Shelf({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="list"
      aria-label={label}
      className="scrollbar-none -mx-4 flex snap-x scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:scroll-px-6 md:px-6"
    >
      {children}
    </div>
  );
}

export function GradientCard({
  to,
  title,
  subtitle,
  colors,
  count,
}: {
  to: string;
  title: string;
  subtitle?: string;
  colors: readonly [string, string];
  count?: number;
}) {
  return (
    <Link
      to={to}
      role="listitem"
      className="group relative flex aspect-[4/3] flex-col justify-end overflow-hidden rounded-card p-4 text-white shadow-theme transition hover:scale-[1.02]"
      style={{ backgroundImage: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
    >
      <span className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15 blur-xl transition group-hover:scale-125" />
      <span className="font-display text-lg font-bold leading-tight drop-shadow">{title}</span>
      {subtitle && <span className="text-xs text-white/85">{subtitle}</span>}
      {count !== undefined && (
        <span className="mt-1 text-[11px] font-semibold text-white/80">{count} tracks</span>
      )}
    </Link>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
