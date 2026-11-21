import { useSyncExternalStore } from 'react';
import { envIssues, getKeys, keySource, subscribeKeys, type KeyName } from './env';

const KEYS: { name: KeyName; label: string; enables: string; required: boolean }[] = [
  {
    name: 'audiusApiKey',
    label: 'Audius API key',
    enables: 'Higher Audius rate limits (Audius works without it)',
    required: false,
  },
  {
    name: 'jamendoClientId',
    label: 'Jamendo client ID',
    enables: 'The Jamendo Creative Commons catalog',
    required: false,
  },
  {
    name: 'supabaseUrl',
    label: 'Supabase URL',
    enables: 'Sign-in, sync and friends',
    required: false,
  },
  {
    name: 'supabaseAnonKey',
    label: 'Supabase anon key',
    enables: 'Sign-in, sync and friends',
    required: false,
  },
];

export function App() {
  useSyncExternalStore(subscribeKeys, getKeys);
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-gradient text-4xl font-bold">Tuneshift</h1>
      <p className="mt-2 text-muted">Setup check — every key is optional.</p>
      {envIssues.length > 0 && (
        <div role="alert" className="mt-4 rounded-ctl border border-line bg-surface p-4">
          {envIssues.map((i) => (
            <p key={i.variable}>
              <code>{i.variable}</code> {i.message}; it is ignored.
            </p>
          ))}
        </div>
      )}
      <ul className="mt-6 space-y-2">
        {KEYS.map((k) => (
          <li key={k.name} className="rounded-ctl bg-surface p-3">
            <strong>{k.label}</strong> —{' '}
            {keySource(k.name) === 'missing' ? 'not set' : `set (${keySource(k.name)})`}
            <div className="text-sm text-muted">{k.enables}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
