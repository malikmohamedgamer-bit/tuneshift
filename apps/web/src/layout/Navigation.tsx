import { NavLink, useNavigate } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  Compass,
  FolderPlus,
  Heart,
  House,
  Library,
  ListMusic,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Upload,
  Users,
} from 'lucide-react';
import { cn, IconButton } from '@tuneshift/ui';
import { db } from '../db/db';
import { createPlaylist } from '../db/library';
import { Artwork } from '../components/common';
import { PlayPauseButton } from '../components/player/PlayerControls';
import { usePlayer } from '../state/player';
import { useUi } from '../state/ui';
import { isTauri } from '../platform/detect';

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/browse', label: 'Browse', icon: Compass },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/lab', label: 'Sound Lab', icon: SlidersHorizontal },
  { to: '/friends', label: 'Friends', icon: Users },
];

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-semibold transition',
    isActive ? 'bg-surface-hover text-fg' : 'text-muted hover:bg-surface hover:text-fg',
  );

export function Sidebar({ compact }: { compact?: boolean }) {
  const nav = useNavigate();
  const playlists = useLiveQuery(
    async () => (await db.playlists.orderBy('order').toArray()).filter((p) => !p.deleted),
    [],
    [],
  );
  return (
    <nav
      aria-label="Main"
      className={cn(
        'flex h-full min-h-0 flex-col gap-2 rounded-panel bg-bg-elevated p-3',
        compact ? 'w-[76px] items-center' : 'w-[240px]',
      )}
    >
      <NavLink
        to="/"
        className={cn('mb-2 flex items-center gap-2 px-2 py-1', compact && 'justify-center')}
        aria-label="Tuneshift home"
      >
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
        {!compact && (
          <span className="text-gradient font-display text-xl font-extrabold tracking-tight">
            Tuneshift
          </span>
        )}
      </NavLink>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={linkCls}
          title={compact ? label : undefined}
          aria-label={compact ? label : undefined}
        >
          <Icon size={20} aria-hidden="true" />
          {!compact && label}
        </NavLink>
      ))}
      {isTauri() && (
        <NavLink
          to="/boost"
          className={linkCls}
          title={compact ? 'Boost mode' : undefined}
          aria-label={compact ? 'Boost mode' : undefined}
        >
          <Upload size={20} className="rotate-180" aria-hidden="true" />
          {!compact && 'Boost mode'}
        </NavLink>
      )}
      {!compact && (
        <>
          <div className="mt-3 flex items-center justify-between px-3">
            <span className="text-xs font-bold uppercase tracking-wider text-muted">
              Your playlists
            </span>
            <IconButton
              label="New playlist"
              size="sm"
              onClick={() =>
                void createPlaylist('New playlist').then((p) => nav(`/playlist/${p.id}`))
              }
            >
              <Plus size={16} />
            </IconButton>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <NavLink to="/library/liked" className={linkCls}>
              <span className="grid h-7 w-7 place-items-center rounded-chip bg-hero text-white">
                <Heart size={14} fill="currentColor" />
              </span>
              Liked songs
            </NavLink>
            {playlists.map((p) => (
              <NavLink key={p.id} to={`/playlist/${p.id}`} className={linkCls}>
                {p.coverDataUrl ? (
                  <img src={p.coverDataUrl} alt="" className="h-7 w-7 rounded-chip object-cover" />
                ) : (
                  <span className="grid h-7 w-7 place-items-center rounded-chip bg-surface-hover">
                    <ListMusic size={14} />
                  </span>
                )}
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
            {!playlists.length && (
              <button
                type="button"
                onClick={() => void nav('/library?tab=local')}
                className="mx-3 mt-1 flex items-center gap-2 text-xs text-muted hover:text-fg"
              >
                <FolderPlus size={14} /> Add your music
              </button>
            )}
          </div>
          <div className="flex gap-1 border-t border-line pt-2">
            <NavLink to="/stats" className={({ isActive }) => cn(linkCls({ isActive }), 'flex-1')}>
              <BarChart3 size={18} aria-hidden="true" /> Stats
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) => cn(linkCls({ isActive }), 'flex-1')}
            >
              <Settings size={18} aria-hidden="true" /> Settings
            </NavLink>
          </div>
        </>
      )}
      {compact && (
        <NavLink to="/settings" className={linkCls} aria-label="Settings" title="Settings">
          <Settings size={20} />
        </NavLink>
      )}
    </nav>
  );
}

/** Phone bottom navigation (spec §10). */
export function MobileNav() {
  const items = [NAV[0], NAV[1], NAV[3], NAV[4], NAV[5]] as typeof NAV;
  return (
    <nav aria-label="Main" className="glass safe-bottom grid grid-cols-5 border-t border-line">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-0.5 py-2 text-[10px] font-semibold',
              isActive ? 'text-fg' : 'text-muted',
            )
          }
        >
          <Icon size={22} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Phone mini player bar above the nav; tap or swipe up opens the full player. */
export function MiniBar() {
  const current = usePlayer((s) => s.current);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);
  const setUi = useUi((s) => s.set);
  if (!current) return null;
  let startY = 0;
  return (
    <div
      className="relative mx-2 mb-1 overflow-hidden rounded-ctl bg-surface shadow-theme"
      onTouchStart={(e) => (startY = e.touches[0]?.clientY ?? 0)}
      onTouchEnd={(e) => {
        if (startY - (e.changedTouches[0]?.clientY ?? startY) > 40) setUi({ fullPlayer: true });
      }}
    >
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setUi({ fullPlayer: true })}
          aria-label={`Open player: ${current.title}`}
        >
          <Artwork
            art={current.artwork}
            alt=""
            size="small"
            className="h-10 w-10"
            seed={current.title}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{current.title}</span>
            <span className="block truncate text-xs text-muted">{current.artist}</span>
          </span>
        </button>
        <PlayPauseButton size="md" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-hover">
        <div
          className="h-full bg-hero"
          style={{ width: `${duration ? (position / duration) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}
