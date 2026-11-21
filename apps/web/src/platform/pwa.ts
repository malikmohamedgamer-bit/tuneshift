import { create } from 'zustand';
import { toast } from 'sonner';
import { isIOS, isStandalonePwa } from './detect';

/**
 * PWA plumbing (spec §11.1): service worker registration with an update toast, offline-ready
 * notice, and the install prompt (Chromium `beforeinstallprompt`; iOS gets Add-to-Home-Screen
 * instructions because Safari has no prompt API).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallState {
  canPrompt: boolean;
  installed: boolean;
  iosHint: boolean;
}

export const useInstall = create<InstallState>(() => ({
  canPrompt: false,
  installed: typeof window !== 'undefined' && isStandalonePwa(),
  iosHint: typeof window !== 'undefined' && isIOS() && !isStandalonePwa(),
}));

let deferred: BeforeInstallPromptEvent | null = null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  useInstall.setState({ canPrompt: false, installed: outcome === 'accepted' });
  return outcome === 'accepted';
}

export async function registerPwa(): Promise<void> {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    useInstall.setState({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () =>
    useInstall.setState({ installed: true, canPrompt: false }),
  );
  if (import.meta.env.DEV || __BUILD_TARGET__ === 'desktop' || !('serviceWorker' in navigator))
    return;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      toast('A new version of Tuneshift is ready', {
        duration: Number.POSITIVE_INFINITY,
        action: { label: 'Reload', onClick: () => void update(true) },
      });
    },
    onOfflineReady() {
      toast.success('Tuneshift is ready to work offline');
    },
  });
}
