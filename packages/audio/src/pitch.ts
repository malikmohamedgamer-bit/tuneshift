// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient types for an untyped dependency; must load when other packages compile this file
/// <reference path="./signalsmith.d.ts" />
import type { StretchNode } from 'signalsmith-stretch';

export type { StretchNode };

let workletUrl: string | undefined;

/**
 * Use a packaged copy of SignalsmithStretch.mjs as the worklet module instead of the library's
 * generated blob: URL. Needed where CSP forbids blob: scripts (MV3 extension pages, which also
 * need 'wasm-unsafe-eval').
 */
export function setPitchWorkletUrl(url: string | undefined): void {
  workletUrl = url;
}

/**
 * Loads the Signalsmith Stretch AudioWorklet (MIT, WASM) for independent pitch shifting.
 * By default the library registers its worklet from a blob: URL; if CSP blocks that and no
 * packaged URL was set, this rejects and callers degrade to "pitch unavailable".
 */
export async function createPitchNode(ctx: BaseAudioContext): Promise<StretchNode> {
  if (!('audioWorklet' in ctx) || !ctx.audioWorklet) {
    throw new Error('AudioWorklet is not supported in this browser');
  }
  const mod = await import('signalsmith-stretch');
  if (workletUrl) mod.default.moduleUrl = workletUrl;
  const node = await mod.default(ctx, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    channelCount: 2,
    channelCountMode: 'explicit',
    channelInterpretation: 'speakers',
  });
  await node.configure({ blockMs: null, preset: 'cheaper' });
  await node.start();
  return node;
}
