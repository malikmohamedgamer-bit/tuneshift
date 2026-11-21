import { useLiveQuery } from 'dexie-react-hooks';
import {
  BUILT_IN_THEMES,
  builtInTheme,
  createId,
  defaultTheme,
  nextStamp,
  ThemeSchema,
  type Theme,
} from '@tuneshift/core';
import { db, type ThemeRecord } from '../db/db';
import { useSettings } from './settings';

export function useCustomThemes(): ThemeRecord[] {
  return useLiveQuery(async () => (await db.themes.toArray()).filter((t) => !t.deleted), [], []);
}

export function useAllThemes(): Theme[] {
  const custom = useCustomThemes();
  return [...BUILT_IN_THEMES, ...custom];
}

/** The theme to apply: settings.themeId (built-in or custom), falling back to the default. */
export function useActiveTheme(override?: string | null): Theme {
  const themeId = useSettings((s) => s.themeId);
  const id = override || themeId;
  const custom = useLiveQuery(() => (builtInTheme(id) ? undefined : db.themes.get(id)), [id]);
  return builtInTheme(id) ?? (custom && !custom.deleted ? custom : defaultTheme());
}

export async function saveCustomTheme(t: Theme): Promise<ThemeRecord> {
  const parsed = ThemeSchema.parse({ ...t, builtIn: false });
  const rec: ThemeRecord = {
    ...(parsed as Theme),
    builtIn: false,
    updatedAt: nextStamp(),
    dirty: 1,
  };
  await db.transaction('rw', db.themes, db.syncQueue, async () => {
    await db.themes.put(rec);
    await db.syncQueue.add({ table: 'themes', id: rec.id, op: 'upsert', updatedAt: rec.updatedAt });
  });
  return rec;
}

export async function deleteCustomTheme(id: string): Promise<void> {
  const cur = await db.themes.get(id);
  if (!cur) return;
  const updatedAt = nextStamp();
  await db.transaction('rw', db.themes, db.syncQueue, async () => {
    await db.themes.put({ ...cur, deleted: true, updatedAt, dirty: 1 });
    await db.syncQueue.add({ table: 'themes', id, op: 'delete', updatedAt });
  });
  if (useSettings.getState().themeId === id)
    useSettings.getState().set({ themeId: defaultTheme().id });
}

export function newThemeFrom(base: Theme, name: string): Theme {
  return {
    ...base,
    id: `custom-${createId().slice(0, 8)}`,
    name,
    builtIn: false,
    tokens: { ...base.tokens },
    gradient: { stops: [...base.gradient.stops], angle: base.gradient.angle },
  };
}
