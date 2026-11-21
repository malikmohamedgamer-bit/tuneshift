/** Keyboard shortcut definitions (spec §10) — configurable in Settings → Shortcuts. */

export interface ShortcutDef {
  id: string;
  label: string;
  keys: string;
  /** Fires on keydown and again on keyup (hold actions). */
  hold?: boolean;
}

export const SHORTCUTS: readonly ShortcutDef[] = [
  { id: 'playPause', label: 'Play / pause', keys: 'Space' },
  { id: 'seekBack', label: 'Seek back 5 s', keys: 'ArrowLeft' },
  { id: 'seekForward', label: 'Seek forward 5 s', keys: 'ArrowRight' },
  { id: 'prev', label: 'Previous track', keys: 'Shift+ArrowLeft' },
  { id: 'next', label: 'Next track', keys: 'Shift+ArrowRight' },
  { id: 'volUp', label: 'Volume up', keys: 'ArrowUp' },
  { id: 'volDown', label: 'Volume down', keys: 'ArrowDown' },
  { id: 'mute', label: 'Mute', keys: 'm' },
  { id: 'like', label: 'Like current song', keys: 'l' },
  { id: 'shuffle', label: 'Shuffle', keys: 's' },
  { id: 'repeat', label: 'Repeat mode', keys: 'r' },
  { id: 'search', label: 'Search', keys: '/' },
  { id: 'palette', label: 'Command palette', keys: 'Ctrl+k' },
  { id: 'lab', label: 'Open Sound Lab', keys: 'e' },
  { id: 'compare', label: 'Hold for original sound (A/B)', keys: 'b', hold: true },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `preset${i + 1}`,
    label: `Sound preset ${i + 1}`,
    keys: String(i + 1),
  })),
  { id: 'fullscreen', label: 'Full-screen now playing', keys: 'f' },
  { id: 'lyrics', label: 'Lyrics', keys: 'y' },
  { id: 'cheatsheet', label: 'Show shortcuts', keys: '?' },
];

/** Normalised combo string for a keyboard event, e.g. "Ctrl+k", "Shift+ArrowLeft", "?". */
export function comboFromEvent(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>,
): string {
  let key = e.key === ' ' ? 'Space' : e.key;
  if (key.length === 1) key = key.toLowerCase();
  const printableSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey && !printableSymbol) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function effectiveShortcuts(overrides: Record<string, string>): Map<string, ShortcutDef> {
  const byCombo = new Map<string, ShortcutDef>();
  for (const s of SHORTCUTS) byCombo.set(overrides[s.id] ?? s.keys, s);
  return byCombo;
}

export function prettyCombo(c: string): string {
  return c
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace(/\+/g, ' + ')
    .replace(/\b([a-z])\b/g, (m) => m.toUpperCase());
}

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (t.isContentEditable || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }
  return false;
}
