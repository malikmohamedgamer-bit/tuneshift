import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  share_activity: boolean;
}

export type AuthStatus = 'unconfigured' | 'loading' | 'signed-out' | 'needs-profile' | 'signed-in';

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  syncing: boolean;
  lastSync: number | null;
  syncError: string | null;
}

export const useAuth = create<AuthState>(() => ({
  status: 'loading',
  session: null,
  profile: null,
  syncing: false,
  lastSync: null,
  syncError: null,
}));

export const getAuth = () => useAuth.getState();
export const setAuth = (p: Partial<AuthState>) => useAuth.setState(p);
