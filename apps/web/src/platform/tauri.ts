import { presetSettings, SOUND_PRESETS, upcomingContext } from '@tuneshift/core';
import { toast } from 'sonner';
import { player } from '../player/controller';
import { getPlayer, usePlayer } from '../state/player';
import { getSound, useSound } from '../state/sound';
import { getSettings, useSettings } from '../state/settings';
import { db } from '../db/db';
import { toggleLike } from '../db/library';
import { registry } from '../lib/sources';
import { navigateTo } from '../lib/nav';
import { completeAuthFromUrl } from '../lib/social';
import { isCoverToken } from '../lib/localFiles';
import { smtcControl, smtcCurrent, tauriInvoke, type SmtcInfo } from './tauriBridge';
import { openDesktopFiles, restoreAssetScopes } from './desktopLibrary';
import {
  COMMAND_EVENT,
  STATE_EVENT,
  toAccelerator,
  type DesktopCommand,
  type DesktopState,
} from './desktopState';

/**
 * Desktop bridge (spec §11.2): only loaded inside Tauri. Audio plays in this (main) window; the
 * mini player, overlay and tray are controllers synced through events.
 */

let smtc: SmtcInfo | null = null;
let boostOn = false;
let liked = false;
let lastJson = '';

async function emit(name: string, payload: unknown) {
  const { emit: e } = await import('@tauri-apps/api/event');
  await e(name, payload);
}

function snapshot(): DesktopState {
  const p = getPlayer();
  const s = getSettings();
  const t = p.current;
  const art = t?.artwork?.medium ?? t?.artwork?.small;
  const upNext = [...p.queue.manual, ...upcomingContext(p.queue), ...p.queue.autoplay]
    .slice(0, 5)
    .map((i) => p.tracks[i.trackKey])
    .filter(Boolean)
    .map((x) => ({ title: x?.title ?? '', artist: x?.artist ?? '' }));
  return {
    trackKey: t?.key ?? null,
    title: t?.title ?? null,
    artist: t?.artist ?? null,
    artwork: art && !isCoverToken(art) ? new URL(art, window.location.href).toString() : null,
    playing: p.status === 'playing' || p.status === 'buffering',
    position: player.engine.currentTime,
    duration: p.duration,
    preset: getSound().label,
    liked,
    fullEffects: p.mode !== 'direct',
    upNext,
    boostOn,
    smtc,
    settings: {
      miniOpacity: s.miniOpacity,
      overlayMode: s.overlayMode,
      overlaySeconds: s.overlaySeconds,
      themeId: s.themeId,
    },
  };
}

function broadcast(force = false) {
  const snap = snapshot();
  const json = JSON.stringify({ ...snap, position: 0 });
  if (!force && json === lastJson && !snap.playing) return;
  lastJson = json;
  void emit(STATE_EVENT, snap);
}

async function updateTray() {
  const p = getPlayer();
  const mini = await isVisible('mini');
  await tauriInvoke('update_tray', {
    title: p.current?.title ?? null,
    artist: p.current?.artist ?? null,
    playing: p.status === 'playing',
    miniVisible: mini,
    overlayOn: getSettings().overlayMode !== 'off',
    boost: boostOn,
  }).catch(() => undefined);
}

async function isVisible(label: string): Promise<boolean> {
  try {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const w = await WebviewWindow.getByLabel(label);
    return w ? await w.isVisible() : false;
  } catch {
    return false;
  }
}

async function toggleBoost() {
  const { useBoost, startBoost, stopBoost } = await import('./boost/boostEngine');
  if (useBoost.getState().on) await stopBoost();
  else {
    navigateTo('/boost');
    await startBoost();
  }
}

async function handleCommand(action: DesktopCommand) {
  if (action === 'play') return player.togglePlay();
  if (action === 'next') return player.next();
  if (action === 'prev') return player.prev();
  if (action === 'like') {
    const t = getPlayer().current;
    if (t) liked = await toggleLike(t);
    return broadcast(true);
  }
  if (action === 'show-main')
    return tauriInvoke('set_window_visible', { label: 'main', visible: true });
  if (action === 'toggle-mini')
    return tauriInvoke('toggle_window', { label: 'mini' }).then(updateTray);
  if (action === 'toggle-overlay') {
    const s = useSettings.getState();
    s.set({ overlayMode: s.overlayMode === 'off' ? 'change' : 'off' });
    return updateTray();
  }
  if (action === 'toggle-boost') return toggleBoost();
  if (action.startsWith('preset:')) {
    const p = SOUND_PRESETS.find((x) => x.id === action.slice(7));
    if (p) player.applySound(presetSettings(p.id), { kind: 'preset', id: p.id }, p.name);
    return;
  }
  if (action.startsWith('seek:')) return player.seek(Number(action.slice(5)));
  if (action.startsWith('smtc:'))
    return smtcControl(action.slice(5) as 'toggle' | 'next' | 'previous');
}

async function applyGlobalShortcuts() {
  const gs = await import('@tauri-apps/plugin-global-shortcut');
  await gs.unregisterAll().catch(() => undefined);
  const map = getSettings().globalShortcuts;
  const actions: Record<string, () => void> = {
    playPause: () => void player.togglePlay(),
    next: () => void player.next(),
    prev: () => void player.prev(),
    cyclePreset: () => {
      const label = getSound().label;
      const i = SOUND_PRESETS.slice(0, 8).findIndex((p) => p.name === label);
      const p = SOUND_PRESETS[(i + 1) % 8];
      if (p) {
        player.applySound(presetSettings(p.id), { kind: 'preset', id: p.id }, p.name);
        broadcast(true);
      }
    },
    toggleMini: () => void handleCommand('toggle-mini'),
    toggleOverlay: () => void handleCommand('toggle-overlay'),
  };
  for (const [id, combo] of Object.entries(map)) {
    const fn = actions[id];
    if (!fn || !combo.trim()) continue;
    try {
      await gs.register(toAccelerator(combo), (e) => {
        if (e.state === 'Pressed') fn();
      });
    } catch {
      toast.error(`Shortcut ${combo} is used by another app`);
    }
  }
}

async function applyAutostart() {
  const a = await import('@tauri-apps/plugin-autostart');
  const want = getSettings().launchOnStartup;
  const on = await a.isEnabled().catch(() => false);
  if (want && !on) await a.enable().catch(() => toast.error("Couldn't enable launch at startup"));
  if (!want && on) await a.disable().catch(() => undefined);
}

let discordWarned = false;
async function updateDiscord() {
  const s = getSettings();
  const p = getPlayer();
  if (
    !s.discordEnabled ||
    !s.discordClientId ||
    !p.current ||
    p.status !== 'playing' ||
    s.privateSession
  ) {
    await tauriInvoke('discord_clear').catch(() => undefined);
    return;
  }
  const rate = player.engine.playbackRate || 1;
  try {
    await tauriInvoke('discord_update', {
      clientId: s.discordClientId,
      details: p.current.title,
      status: `${p.current.artist} · ${getSound().label}`,
      startMs: Date.now() - (player.engine.currentTime / rate) * 1000,
      largeText: 'Tuneshift',
    });
    discordWarned = false;
  } catch (e) {
    if (!discordWarned) toast.message('Discord status unavailable', { description: String(e) });
    discordWarned = true;
  }
}

async function handleDeepLink(url: string) {
  if (url.startsWith('tuneshift://auth')) {
    await completeAuthFromUrl(
      url.replace('tuneshift://auth', 'https://tuneshift.invalid/auth'),
    ).catch((e: unknown) =>
      toast.error('Sign-in failed', { description: e instanceof Error ? e.message : String(e) }),
    );
    navigateTo('/friends');
    return;
  }
  const share = /^tuneshift:\/\/(?:s\/)?([A-Za-z0-9._-]+)/.exec(url);
  if (share?.[1]) navigateTo(`/s/${share[1]}`);
}

async function openPaths(args: string[]) {
  const tracks = await openDesktopFiles(
    args.filter((a) => !a.startsWith('-') && !a.startsWith('tuneshift://')),
  );
  if (tracks.length) await player.playTracks(tracks, 0, { name: 'Opened files', kind: 'local' });
  for (const a of args.filter((x) => x.startsWith('tuneshift://'))) await handleDeepLink(a);
}

export async function startDesktop(): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event');
  await restoreAssetScopes();
  await listen<{ action: DesktopCommand }>(
    COMMAND_EVENT,
    (e) => void handleCommand(e.payload.action),
  );
  await listen<string[]>('ts://second-instance', (e) => void openPaths(e.payload));
  const { onOpenUrl, getCurrent } = await import('@tauri-apps/plugin-deep-link');
  await onOpenUrl((urls) => urls.forEach((u) => void handleDeepLink(u)));
  (await getCurrent().catch(() => null))?.forEach((u) => void handleDeepLink(u));
  void openPaths(await tauriInvoke<string[]>('launch_args').catch(() => []));

  // State broadcast at ~4 Hz plus on every change.
  setInterval(() => broadcast(), 250);
  usePlayer.subscribe((s, p) => {
    if (s.current?.key !== p.current?.key) {
      void db.likes.get(s.current?.key ?? '').then((l) => {
        liked = Boolean(l && !l.deleted);
        broadcast(true);
      });
    }
    if (s.current?.key !== p.current?.key || s.status !== p.status) {
      broadcast(true);
      void updateTray();
      void updateDiscord();
    }
  });
  useSound.subscribe((s, p) => {
    if (s.label !== p.label) {
      broadcast(true);
      void updateDiscord();
    }
  });
  const { useBoost } = await import('./boost/boostEngine');
  useBoost.subscribe((b, prev) => {
    if (b.on !== prev.on) {
      boostOn = b.on;
      broadcast(true);
      void updateTray();
    }
  });
  // Other apps' now-playing (SMTC) while Boost mode is on.
  setInterval(() => {
    if (!boostOn) {
      if (smtc) {
        smtc = null;
        broadcast(true);
      }
      return;
    }
    void smtcCurrent().then((i) => {
      smtc = i;
      broadcast(true);
    });
  }, 2000);

  const applyPrefs = () => {
    const s = getSettings();
    void tauriInvoke('set_prefs', { closeToTray: s.closeToTray });
    void tauriInvoke('overlay_config', {
      position: s.overlayPosition,
      clickThrough: s.overlayClickThrough,
    });
  };
  applyPrefs();
  void applyGlobalShortcuts();
  void applyAutostart();
  void updateTray();
  useSettings.subscribe((s, p) => {
    if (
      s.closeToTray !== p.closeToTray ||
      s.overlayPosition !== p.overlayPosition ||
      s.overlayClickThrough !== p.overlayClickThrough
    )
      applyPrefs();
    if (JSON.stringify(s.globalShortcuts) !== JSON.stringify(p.globalShortcuts))
      void applyGlobalShortcuts();
    if (s.launchOnStartup !== p.launchOnStartup) void applyAutostart();
    if (s.discordEnabled !== p.discordEnabled || s.discordClientId !== p.discordClientId)
      void updateDiscord();
    if (
      s.overlayMode !== p.overlayMode ||
      s.miniOpacity !== p.miniOpacity ||
      s.overlaySeconds !== p.overlaySeconds ||
      s.themeId !== p.themeId
    ) {
      broadcast(true);
      void updateTray();
    }
  });
  // Local files on desktop must always be "Full Sound Lab" (asset protocol sends CORS headers).
  registry.setFullEffects('local', true);
}
