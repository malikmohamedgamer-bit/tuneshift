import { create } from 'zustand';
import { LiveInputEngine } from '@tuneshift/audio';
import { player } from '../../player/controller';
import { getSound, useSound } from '../../state/sound';
import { getSettings, useSettings } from '../../state/settings';

/**
 * Desktop Boost mode (spec §11.2): another app's audio arrives through VB-Audio Virtual Cable
 * ("CABLE Output" input device), runs through the same Sound Lab chain at low latency and plays
 * on the real speakers. Live processing only — nothing is recorded or exported.
 */

interface BoostState {
  on: boolean;
  starting: boolean;
  error: string | null;
  inputDb: number;
  latencyMs: number;
}

export const useBoost = create<BoostState>(() => ({
  on: false,
  starting: false,
  error: null,
  inputDb: -Infinity,
  latencyMs: 0,
}));

let engine: LiveInputEngine | null = null;
let stream: MediaStream | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
let unsubSound: (() => void) | null = null;
let unsubSettings: (() => void) | null = null;

export async function listAudioDevices(
  askPermission = false,
): Promise<{ inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] }> {
  if (askPermission) {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  }
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: all.filter((d) => d.kind === 'audioinput'),
    outputs: all.filter((d) => d.kind === 'audiooutput'),
  };
}

export const isCableInput = (d: MediaDeviceInfo) => /cable output/i.test(d.label);
export const isCableOutput = (d: MediaDeviceInfo) => /cable input/i.test(d.label);

export async function startBoost(): Promise<void> {
  if (useBoost.getState().on || useBoost.getState().starting) return;
  useBoost.setState({ starting: true, error: null });
  try {
    // Boost and normal playback are mutually exclusive.
    player.pause();
    const s = getSettings();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: s.boostInputDeviceId ? { exact: s.boostInputDeviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48000,
      },
    });
    engine = new LiveInputEngine({ sampleRate: 48000 });
    if (s.boostOutputDeviceId) await engine.setSinkId(s.boostOutputDeviceId).catch(() => undefined);
    engine.attach(stream);
    engine.setSound(getSound().settings);
    engine.setVolume(s.volume, s.muted);
    await engine.resume();
    unsubSound = useSound.subscribe((st) => engine?.setSound(st.settings));
    unsubSettings = useSettings.subscribe((st) => engine?.setVolume(st.volume, st.muted));
    meterTimer = setInterval(() => {
      if (!engine) return;
      const st = engine.stats();
      useBoost.setState({ inputDb: st.inputDb, latencyMs: st.latencyMs });
    }, 100);
    useBoost.setState({ on: true, starting: false });
  } catch (e) {
    await stopBoost();
    const msg =
      e instanceof DOMException && e.name === 'NotFoundError'
        ? 'The selected input device was not found. Is VB-Cable installed?'
        : e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'Audio input permission was denied.'
          : e instanceof Error
            ? e.message
            : String(e);
    useBoost.setState({ error: msg, starting: false });
  }
}

export async function stopBoost(): Promise<void> {
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  unsubSound?.();
  unsubSettings?.();
  unsubSound = unsubSettings = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (engine) await engine.close().catch(() => undefined);
  engine = null;
  useBoost.setState({ on: false, starting: false, inputDb: -Infinity, latencyMs: 0 });
}

export function boostHeadroom() {
  return engine?.chain.headroom() ?? null;
}

export function boostPitchStatus() {
  return engine?.chain.pitchStatus ?? 'idle';
}
