/**
 * CORS probe (spec §3): before routing a remote stream into Web Audio, check that its host
 * (following redirects) sends Access-Control-Allow-Origin. Without it the element would either
 * fail to load (crossOrigin set) or be silent in the graph. Results are cached per host.
 */

const STORAGE_KEY = 'tuneshift:cors-probe';
const TTL_MS = 7 * 24 * 3600 * 1000;

interface Entry {
  ok: boolean;
  at: number;
}

let memory: Record<string, Entry> | null = null;

function load(): Record<string, Entry> {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, Entry>;
  } catch {
    memory = {};
  }
  return memory;
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory ?? {}));
  } catch {
    // storage unavailable: keep the in-memory cache
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url, typeof location !== 'undefined' ? location.href : 'http://localhost').host;
  } catch {
    return '';
  }
}

export function isLocalUrl(url: string): boolean {
  if (/^(blob|data|asset|tauri|http:\/\/asset\.localhost|https:\/\/asset\.localhost)/i.test(url))
    return true;
  if (typeof location === 'undefined') return false;
  try {
    return new URL(url, location.href).origin === location.origin;
  } catch {
    return false;
  }
}

export function cachedCors(url: string): boolean | undefined {
  if (isLocalUrl(url)) return true;
  const e = load()[hostOf(url)];
  return e && Date.now() - e.at < TTL_MS ? e.ok : undefined;
}

export function rememberCors(url: string, ok: boolean): void {
  const h = hostOf(url);
  if (!h) return;
  load()[h] = { ok, at: Date.now() };
  save();
}

export function forgetCors(): void {
  memory = {};
  save();
}

/** Returns true when the URL can be processed by Web Audio. */
export async function probeCors(url: string, timeoutMs = 4000): Promise<boolean> {
  const cached = cachedCors(url);
  if (cached !== undefined) return cached;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let ok: boolean;
  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      headers: { Range: 'bytes=0-1' },
      signal: ctrl.signal,
    });
    ok = res.ok || res.status === 206;
    void res.body?.cancel();
  } catch (e) {
    // A TypeError is the CORS (or network) failure. A timeout is inconclusive: don't cache it.
    clearTimeout(timer);
    if (e instanceof DOMException && e.name === 'AbortError') return false;
    ok = false;
  }
  clearTimeout(timer);
  rememberCors(url, ok);
  return ok;
}
