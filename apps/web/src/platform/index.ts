import { isTauri } from './detect';

/**
 * Platform start-up: inside the desktop app the Tauri bridge (windows, tray, shortcuts, deep
 * links, Discord) is loaded lazily, so the web bundle never pulls it in.
 */
export async function startPlatform(): Promise<void> {
  if (!isTauri()) return;
  const { startDesktop } = await import('./tauri');
  await startDesktop();
}
