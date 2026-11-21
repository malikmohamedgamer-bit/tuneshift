import { useEffect, useMemo } from 'react';
import { RouterProvider } from 'react-router/dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { startSocial } from './lib/socialBoot';
import { makeRouter } from './router';
import { player } from './player/controller';
import { loadDemoTracks } from './lib/demo';
import { startPlatform } from './platform';
import { registerPwa } from './platform/pwa';

export function App() {
  const router = useMemo(() => makeRouter(), []);
  useEffect(() => {
    player.init();
    // Dev-only debugging handle (never in production builds).
    if (import.meta.env.DEV)
      (window as unknown as { __tuneshift?: unknown }).__tuneshift = { player };
    void loadDemoTracks().catch((e: unknown) => console.warn('[demo]', e));
    void player.restore();
    void startPlatform();
    void startSocial();
    void registerPwa();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
