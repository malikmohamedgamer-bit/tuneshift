/** Fetch helpers shared by the adapters: timeouts, typed errors, 429 Retry-After handling. */

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly source: string,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'SourceError';
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

export interface FetchJsonOptions {
  source: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Retry once after Retry-After (capped) on 429. */
  retryOn429?: boolean;
  fetchImpl?: typeof fetch;
}

function parseRetryAfter(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (Number.isFinite(n)) return Math.max(0, n);
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, (at - Date.now()) / 1000) : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const f = opts.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    opts.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);
    let res: Response;
    try {
      res = await f(url, {
        headers: { Accept: 'application/json', ...opts.headers },
        signal: ctrl.signal,
      });
    } catch (e) {
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const timedOut = e instanceof DOMException && e.name === 'AbortError';
      throw new SourceError(
        timedOut
          ? `${opts.source} took too long to answer`
          : `Couldn't reach ${opts.source}. Check your connection.`,
        0,
        opts.source,
      );
    } finally {
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (res.status === 429) {
      const wait = parseRetryAfter(res.headers.get('Retry-After'));
      if (opts.retryOn429 && attempt === 0 && wait !== undefined && wait <= 10) {
        await sleep(wait * 1000);
        continue;
      }
      throw new SourceError(
        `${opts.source} is rate limiting requests — try again shortly`,
        429,
        opts.source,
        wait,
      );
    }
    if (!res.ok) {
      throw new SourceError(
        res.status === 404 ? 'Not found' : `${opts.source} error (${res.status})`,
        res.status,
        opts.source,
      );
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new SourceError(`${opts.source} sent an unreadable response`, res.status, opts.source);
    }
  }
  throw new SourceError(`${opts.source} is rate limiting requests`, 429, opts.source);
}

export function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p.toString();
}

/** Simple concurrency limiter so a busy screen doesn't burst past an API's rate limit. */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiting.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }
}
