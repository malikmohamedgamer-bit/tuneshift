import { NEUTRAL_SOUND, migrateSound, soundLabel } from '@tuneshift/core';
import {
  errorText,
  type BackgroundMessage,
  type OffscreenMessage,
  type Reply,
  type SessionInfo,
  type SoundUpdate,
} from './lib/messages';
import { captureBlockedReason, hostOf, originOf } from './lib/pages';

/**
 * Tuneshift Boost service worker (spec §11.3): turns tab capture on/off, owns the single offscreen
 * document that runs the Sound Lab, keeps the badge in sync and stops a boost when its tab closes
 * or navigates to another site. Audio is processed live only; nothing is recorded or stored.
 */

const OFFSCREEN_URL = 'offscreen.html';
const SESSIONS_KEY = 'sessions';

interface StoredSession extends SessionInfo {
  origin: string;
}

// The worker can be stopped while idle, so boosted tabs live in storage.session.
async function getSessions(): Promise<Record<string, StoredSession>> {
  const r = await chrome.storage.session.get(SESSIONS_KEY);
  return (r[SESSIONS_KEY] as Record<string, StoredSession> | undefined) ?? {};
}

async function setSessions(s: Record<string, StoredSession>): Promise<void> {
  await chrome.storage.session.set({ [SESSIONS_KEY]: s });
}

let creating: Promise<void> | null = null;
async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  if (contexts.length) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Process the captured tab audio live with the Tuneshift Sound Lab.',
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function toOffscreen<T>(msg: OffscreenMessage): Promise<T> {
  const r = (await chrome.runtime.sendMessage(msg)) as Reply<T> | undefined;
  if (!r) throw new Error('The audio engine did not answer.');
  if (!r.ok) throw new Error(r.error);
  return r.data;
}

async function setBadge(tabId: number, on: boolean): Promise<void> {
  await chrome.action.setBadgeText({ tabId, text: on ? 'ON' : '' }).catch(() => undefined);
  if (on) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#c026d3' }).catch(() => undefined);
    await chrome.action.setBadgeTextColor?.({ tabId, color: '#ffffff' }).catch(() => undefined);
  }
}

/** The popup's last sound, for boosts started by the keyboard command. */
async function lastUpdate(tabId: number): Promise<SoundUpdate> {
  const r = await chrome.storage.local.get(['lastSound', 'lastLabel', 'volume']);
  const speedKey = `speed:${tabId}`;
  const pageSpeed = Boolean((await chrome.storage.session.get(speedKey))[speedKey]);
  const sound = migrateSound(r.lastSound ?? NEUTRAL_SOUND);
  return {
    sound,
    label: typeof r.lastLabel === 'string' ? r.lastLabel : soundLabel(sound),
    tapeToPitch: !pageSpeed,
    volume: typeof r.volume === 'number' ? r.volume : 1,
  };
}

async function startBoost(tabId: number, update: SoundUpdate): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const blocked = captureBlockedReason(tab.url);
  if (blocked) throw new Error(blocked);
  const sessions = await getSessions();
  if (sessions[tabId]) return;
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  await ensureOffscreen();
  await toOffscreen<null>({ target: 'offscreen', type: 'start', tabId, streamId, ...update });
  sessions[tabId] = {
    tabId,
    title: tab.title ?? hostOf(tab.url),
    host: hostOf(tab.url),
    origin: originOf(tab.url),
    label: update.label,
  };
  await setSessions(sessions);
  await setBadge(tabId, true);
}

async function stopBoost(tabId: number, alreadyEnded = false): Promise<void> {
  const sessions = await getSessions();
  const had = Boolean(sessions[tabId]);
  delete sessions[tabId];
  await setSessions(sessions);
  await setBadge(tabId, false);
  if (!alreadyEnded && had) {
    await toOffscreen<null>({ target: 'offscreen', type: 'stop', tabId }).catch(() => undefined);
  }
  if (!Object.keys(sessions).length) {
    // Last boost finished: close the offscreen document so no audio context stays alive.
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
}

/** After a browser/extension restart the offscreen document is gone: drop stale sessions. */
async function reconcile(): Promise<void> {
  const sessions = await getSessions();
  const ids = Object.keys(sessions).map(Number);
  if (!ids.length) return;
  const active = await toOffscreen<{ tabId: number; label: string }[]>({
    target: 'offscreen',
    type: 'active',
  }).catch(() => []);
  const live = new Map(active.map((a) => [a.tabId, a.label]));
  for (const id of ids) if (!live.has(id)) await stopBoost(id, true);
  // Labels change from the popup (sent straight to the engine): refresh them here.
  const now = await getSessions();
  for (const [id, label] of live) if (now[id]) now[id] = { ...now[id], label };
  await setSessions(now);
}

async function handle(msg: BackgroundMessage): Promise<unknown> {
  switch (msg.type) {
    case 'start': {
      const { tabId, sound, label, tapeToPitch, volume } = msg;
      await startBoost(tabId, { sound, label, tapeToPitch, volume });
      return null;
    }
    case 'stop':
      await stopBoost(msg.tabId);
      return null;
    case 'ended':
      await stopBoost(msg.tabId, true);
      return null;
    case 'sessions': {
      await reconcile();
      return Object.values(await getSessions()).map(
        ({ tabId, title, host, label }): SessionInfo => ({ tabId, title, host, label }),
      );
    }
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const msg = raw as Partial<BackgroundMessage> | undefined;
  if (msg?.target !== 'background') return false;
  handle(msg as BackgroundMessage).then(
    (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
    (e: unknown) => sendResponse({ ok: false, error: errorText(e) } satisfies Reply<unknown>),
  );
  return true;
});

// Keyboard command (default Alt+Shift+B) toggles Boost for the active tab.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-boost' || tab?.id === undefined) return;
  const tabId = tab.id;
  void (async () => {
    const sessions = await getSessions();
    try {
      if (sessions[tabId]) await stopBoost(tabId);
      else await startBoost(tabId, await lastUpdate(tabId));
    } catch (e) {
      console.warn('Tuneshift Boost:', errorText(e));
      await chrome.action.setBadgeText({ tabId, text: '!' }).catch(() => undefined);
    }
  })();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(`speed:${tabId}`);
  void getSessions().then((s) => (s[tabId] ? stopBoost(tabId) : undefined));
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  void (async () => {
    const s = (await getSessions())[tabId];
    if (!s) return;
    // Navigating to another site ends the boost; same-site navigation (e.g. YouTube's next video)
    // keeps it. Tab badges reset on navigation, so restore it.
    if (info.url && originOf(info.url) !== s.origin) await stopBoost(tabId);
    else if (info.status === 'complete') {
      await setBadge(tabId, true);
      if (tab.title && tab.title !== s.title) {
        const all = await getSessions();
        if (all[tabId]) {
          all[tabId] = { ...all[tabId], title: tab.title };
          await setSessions(all);
        }
      }
    }
  })();
});

chrome.runtime.onStartup.addListener(() => void setSessions({}));
chrome.runtime.onInstalled.addListener(() => void setSessions({}));
