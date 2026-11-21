/// <reference lib="webworker" />
import { encode } from './encode';
import type { EncodeMessage, EncodeRequest } from './formats';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<EncodeRequest>) => {
  try {
    let last = 0;
    const result = encode(e.data, (v) => {
      if (v - last >= 0.02 || v === 1) {
        last = v;
        scope.postMessage({ type: 'progress', value: v } satisfies EncodeMessage);
      }
    });
    scope.postMessage(
      { type: 'done', data: result.data, mime: result.mime } satisfies EncodeMessage,
      [result.data],
    );
  } catch (err) {
    scope.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies EncodeMessage);
  }
};
