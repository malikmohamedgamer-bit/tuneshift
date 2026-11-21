import type { StretchNode } from 'signalsmith-stretch';

export type { StretchNode };

/**
 * Loads the Signalsmith Stretch AudioWorklet (MIT, WASM) for independent pitch shifting.
 * The library registers its worklet from a blob: URL; environments whose CSP blocks that (e.g.
 * some extension pages) reject here and callers degrade to "pitch unavailable".
 */
export async function createPitchNode(ctx: BaseAudioContext): Promise<StretchNode> {
  if (!('audioWorklet' in ctx) || !ctx.audioWorklet) {
    throw new Error('AudioWorklet is not supported in this browser');
  }
  const mod = await import('signalsmith-stretch');
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
