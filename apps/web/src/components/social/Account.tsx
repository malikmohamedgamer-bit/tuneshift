import { useState } from 'react';
import { Link } from 'react-router';
import { Cloud, LogOut, Mail, RefreshCw, User } from 'lucide-react';
import { formatRelative } from '@tuneshift/core';
import { Button, Segmented, Switch } from '@tuneshift/ui';
import { toast } from 'sonner';
import { EmptyState } from '../common';
import { useAuth } from '../../state/auth';
import { useSettings } from '../../state/settings';
import {
  saveProfile,
  setShareActivity,
  signInWithMagicLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  uploadAvatar,
  USERNAME_RE,
} from '../../lib/social';
import { syncNow } from '../../lib/sync';
import { pickImage } from '../../lib/images';

const input = 'h-10 w-full rounded-ctl border border-line bg-bg px-3 text-sm';

export function NotConfigured() {
  return (
    <EmptyState
      icon={<Cloud />}
      title="Sign-in not configured yet"
      body="Friends, sync, short share links and listening parties need a (free) Supabase project. Everything else works without it — your library stays on this device."
      action={
        <Link to="/settings/account" className="text-sm font-semibold text-accent-text underline">
          Add Supabase URL and key
        </Link>
      }
    />
  );
}

export function SignInForm() {
  const [mode, setMode] = useState<'magic' | 'password' | 'signup'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === 'magic') {
        await signInWithMagicLink(email.trim());
        toast.success('Check your email for a sign-in link');
      } else if (mode === 'password') {
        await signInWithPassword(email.trim(), password);
      } else {
        const r = await signUpWithPassword(email.trim(), password);
        toast.success(
          r.needsConfirmation
            ? 'Account created — confirm your email to finish'
            : 'Account created',
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="mx-auto flex max-w-sm flex-col gap-3 rounded-card border border-line bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="font-display text-xl font-bold">Sign in to Tuneshift</h2>
      <p className="text-sm text-muted">
        Sync your library across devices and listen with friends.
      </p>
      <Segmented
        label="Sign-in method"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'magic', label: 'Email link' },
          { value: 'password', label: 'Password' },
          { value: 'signup', label: 'Create account' },
        ]}
      />
      <label className="text-xs text-muted">
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
      </label>
      {mode !== 'magic' && (
        <label className="text-xs text-muted">
          Password
          <input
            type="password"
            required
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
        </label>
      )}
      <Button type="submit" variant="primary" disabled={busy} icon={<Mail size={15} />}>
        {mode === 'magic' ? 'Email me a link' : mode === 'password' ? 'Sign in' : 'Create account'}
      </Button>
    </form>
  );
}

export function ProfileSetup() {
  const profile = useAuth((s) => s.profile);
  const displayName = useSettings((s) => s.displayName);
  const [username, setUsername] = useState(profile?.username ?? '');
  const [name, setName] = useState(profile?.display_name ?? displayName);
  const [busy, setBusy] = useState(false);
  const valid = USERNAME_RE.test(username.trim().toLowerCase());
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        void saveProfile({ username, display_name: name })
          .then(() => toast.success('Profile saved'))
          .catch((err: unknown) =>
            toast.error(err instanceof Error ? err.message : 'Could not save'),
          )
          .finally(() => setBusy(false));
      }}
    >
      <label className="text-xs text-muted">
        Username (friends find you by this)
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value.toLowerCase())}
          placeholder="e.g. malik_beats"
          className={input}
          aria-invalid={!valid && username.length > 0}
        />
      </label>
      {!valid && username.length > 0 && (
        <p className="text-xs text-amber-300">3–24 characters: a–z, 0–9 and _</p>
      )}
      <label className="text-xs text-muted">
        Display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          className={input}
        />
      </label>
      <Button type="submit" variant="primary" disabled={!valid || busy}>
        Save profile
      </Button>
    </form>
  );
}

export function AccountPanel() {
  const status = useAuth((s) => s.status);
  const profile = useAuth((s) => s.profile);
  const session = useAuth((s) => s.session);
  const syncing = useAuth((s) => s.syncing);
  const lastSync = useAuth((s) => s.lastSync);
  const syncError = useAuth((s) => s.syncError);
  const shareActivity = useSettings((s) => s.shareActivity);
  const privateSession = useSettings((s) => s.privateSession);
  const set = useSettings((s) => s.set);
  if (status === 'unconfigured') return <NotConfigured />;
  if (status === 'loading') return <p className="text-sm text-muted">Loading account…</p>;
  if (status === 'signed-out') return <SignInForm />;
  if (status === 'needs-profile')
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <h2 className="font-display text-xl font-bold">Pick a username</h2>
        <ProfileSetup />
      </div>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Change avatar"
          className="h-16 w-16 overflow-hidden rounded-full bg-surface-hover"
          onClick={() =>
            void pickImage().then((f) =>
              f
                ? uploadAvatar(f)
                    .then(() => toast.success('Avatar updated'))
                    .catch((e: unknown) =>
                      toast.error(e instanceof Error ? e.message : 'Upload failed'),
                    )
                : undefined,
            )
          }
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="m-auto" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-lg font-bold">
            {profile?.display_name || profile?.username}
          </div>
          <div className="text-sm text-muted">
            @{profile?.username} · {session?.user.email}
          </div>
        </div>
        <Button variant="ghost" icon={<LogOut size={15} />} onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
      <details className="rounded-ctl border border-line p-3">
        <summary className="cursor-pointer text-sm font-semibold">Edit profile</summary>
        <div className="mt-3">
          <ProfileSetup />
        </div>
      </details>
      <div className="flex items-center gap-3 text-sm">
        <Button
          size="sm"
          icon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />}
          disabled={syncing}
          onClick={() => void syncNow()}
        >
          Sync now
        </Button>
        <span className="text-muted">
          {syncError
            ? `Sync problem: ${syncError}`
            : lastSync
              ? `Synced ${formatRelative(lastSync)}`
              : 'Not synced yet'}
        </span>
      </div>
      <div className="space-y-3 rounded-ctl border border-line p-3">
        <Switch
          label="Share what I'm listening to"
          description="Friends see your current song and sound."
          checked={shareActivity}
          onChange={(v) => void setShareActivity(v)}
        />
        <Switch
          label="Private session"
          description="Hide activity and pause history until you turn it off."
          checked={privateSession}
          onChange={(v) => set({ privateSession: v })}
        />
      </div>
    </div>
  );
}
