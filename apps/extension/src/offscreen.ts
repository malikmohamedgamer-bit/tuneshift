import { LiveInputEngine, setPitchWorkletUrl } from '@tuneshift/audio';
import { errorText, type LiveStats, type OffscreenMessage, type Reply } from './lib/messages';

/**
 * Offscreen document (reason USER_MEDIA): one LiveInputEngine per boosted tab. Chrome mutes a
 * captured tab, so every engine always plays to the speakers. Live processing only — nothing is
 * recorded, stored or exported.
 */

// MV3 pages forbid blob: scripts, so the pitch worklet loads from the packaged module file.
setPitchWorkletUrl(chrome.runtime.getURL('worklet/signalsmith-stretch.mjs'));

interface Session {
  engine: LiveInputEngine;
  stream: MediaStream;
  label: string;
}

const sessions = new Map<number, Session>();

async function start(msg: Extract<OffscreenMessage, { type: 'start' }>): Promise<void> {
  if (sessions.has(msg.tabId)) await stop(msg.tabId);
  const constraints = {
    audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.streamId } },
    video: false,
  } as unknown as MediaStreamConstraints;
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const engine = new LiveInputEngine();
  try {
    engine.attach(stream);
    engine.setSound(msg.sound, msg.tapeToPitch);
    engine.setVolume(msg.volume);
    await engine.resume();
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await engine.close().catch(() => undefined);
    throw e;
  }
  sessions.set(msg.tabId, { engine, stream, label: msg.label });
  // The capture ends if the tab is closed or Chrome stops sharing it.
  for (const track of stream.getAudioTracks()) {
    track.addEventListener('ended', () => {
      if (sessions.get(msg.tabId)?.stream !== stream) return;
      void stop(msg.tabId).then(() =>
        chrome.runtime.sendMessage({ target: 'background', type: 'ended', tabId: msg.tabId }),
      );
    });
  }
}

async function stop(tabId: number): Promise<void> {
  const s = sessions.get(tabId);
  if (!s) return;
  sessions.delete(tabId);
  s.stream.getTracks().forEach((t) => t.stop());
  await s.engine.close().catch(() => undefined);
}

function stats(tabId: number): LiveStats | null {
  const s = sessions.get(tabId);
  if (!s) return null;
  const st = s.engine.stats();
  return {
    inputDb: Number.isFinite(st.inputDb) ? st.inputDb : -120,
    latencyMs: st.latencyMs,
    pitchStatus: s.engine.chain.pitchStatus,
    headroom: s.engine.chain.headroom(),
  };
}

async function handle(msg: OffscreenMessage): Promise<unknown> {
  switch (msg.type) {
    case 'start':
      await start(msg);
      return null;
    case 'stop':
      await stop(msg.tabId);
      return null;
    case 'sound': {
      const s = sessions.get(msg.tabId);
      if (!s) return null;
      s.engine.setSound(msg.sound, msg.tapeToPitch);
      s.engine.setVolume(msg.volume);
      s.label = msg.label;
      return null;
    }
    case 'stats':
      return stats(msg.tabId);
    case 'active':
      return [...sessions].map(([tabId, s]) => ({ tabId, label: s.label }));
  }
}

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
  const msg = raw as Partial<OffscreenMessage> | undefined;
  if (msg?.target !== 'offscreen') return false;
  handle(msg as OffscreenMessage).then(
    (data) => sendResponse({ ok: true, data } satisfies Reply<unknown>),
    (e: unknown) => sendResponse({ ok: false, error: errorText(e) } satisfies Reply<unknown>),
  );
  return true;
});
