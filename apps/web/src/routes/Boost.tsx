import { ExternalLink, Monitor, Puzzle } from 'lucide-react';
import { APP_REPO_URL } from '@tuneshift/core';
import { EmptyState, PageHeader } from '../components/common';
import { isTauri } from '../platform/detect';
import { lazy, Suspense } from 'react';

const DesktopBoost = lazy(async () => ({
  default: (await import('../platform/boost/BoostScreen')).BoostScreen,
}));

/** Boost mode: desktop app only (spec §11.2). On the web it explains the options. */
export function Boost() {
  if (isTauri()) {
    return (
      <Suspense fallback={null}>
        <DesktopBoost />
      </Suspense>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title="Boost mode"
        subtitle="Sound Lab effects on Spotify, YouTube Music and other apps."
      />
      <EmptyState
        icon={<Monitor />}
        title="Boost mode lives in the Windows app"
        body="Browsers can't reach other apps' audio. The desktop app routes it through the free VB-Audio Virtual Cable and applies bass, EQ, reverb, 8D and pitch live (speed can't change on live audio)."
        action={
          <a
            className="inline-flex items-center gap-1 text-sm font-semibold text-accent-text underline"
            href={`${APP_REPO_URL}/releases`}
            target="_blank"
            rel="noreferrer"
          >
            Download for Windows <ExternalLink size={13} />
          </a>
        }
      />
      <EmptyState
        icon={<Puzzle />}
        title="Or use the browser extension"
        body="“Tuneshift Boost” for Chrome/Edge applies the Sound Lab to any tab, like Spotify Web or YouTube Music."
      />
    </div>
  );
}
