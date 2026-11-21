/// <reference lib="webworker" />
import { integratedLoudness } from '@tuneshift/audio/loudness';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<{ channels: Float32Array[]; sampleRate: number }>) => {
  try {
    scope.postMessage({ ok: true, lufs: integratedLoudness(e.data.channels, e.data.sampleRate) });
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
