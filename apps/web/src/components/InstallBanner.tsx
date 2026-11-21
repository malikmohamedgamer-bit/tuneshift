import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button, IconButton } from '@tuneshift/ui';
import { promptInstall, useInstall } from '../platform/pwa';

const DISMISS_KEY = 'tuneshift:install-dismissed';

/** Small, dismissible install banner (shown after a minute of use, never when installed). */
export function InstallBanner() {
  const { canPrompt, installed, iosHint } = useInstall();
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 60_000);
    return () => clearTimeout(t);
  }, []);
  if (installed || dismissed || !ready || (!canPrompt && !iosHint)) return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // storage unavailable
    }
  };
  return (
    <div
      role="region"
      aria-label="Install Tuneshift"
      className="fixed inset-x-3 bottom-36 z-40 mx-auto flex max-w-md items-center gap-3 rounded-card border border-line bg-bg-elevated p-3 shadow-theme md:bottom-28"
    >
      <img
        src={`${import.meta.env.BASE_URL}icons/icon-192.png`}
        alt=""
        className="h-10 w-10 rounded-ctl"
      />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">Install Tuneshift</div>
        <div className="text-xs text-muted">
          {iosHint ? (
            <>
              Tap <Share size={12} className="inline" aria-label="Share" /> then “Add to Home
              Screen”.
            </>
          ) : (
            'Opens like an app, works offline.'
          )}
        </div>
      </div>
      {canPrompt && (
        <Button
          size="sm"
          variant="primary"
          icon={<Download size={14} />}
          onClick={() => void promptInstall()}
        >
          Install
        </Button>
      )}
      <IconButton label="Dismiss install banner" size="sm" onClick={dismiss}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
