/**
 * Platform start-up hook. The desktop (Tauri) bridge is added here in phase 7; the web build
 * needs nothing extra at start-up (the PWA service worker registers from main.tsx).
 */
export async function startPlatform(): Promise<void> {
  await Promise.resolve();
}
