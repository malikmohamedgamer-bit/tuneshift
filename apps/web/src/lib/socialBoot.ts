import { subscribeKeys } from '../env';
import { initAuth } from './social';
import { startSync, stopSync } from './sync';
import { startActivity, stopActivity } from './activity';
import { setAuth } from '../state/auth';
import { isSupabaseConfigured } from './supabase';

let booted = false;

/** Start auth + sync + presence when Supabase is configured; re-run when keys change. */
export async function startSocial(): Promise<void> {
  if (!booted) {
    booted = true;
    subscribeKeys(() => {
      if (isSupabaseConfigured()) window.location.reload();
      else setAuth({ status: 'unconfigured', session: null, profile: null });
    });
  }
  await initAuth(
    () => {
      startSync();
      void startActivity();
    },
    () => {
      stopSync();
      void stopActivity();
    },
  );
}
