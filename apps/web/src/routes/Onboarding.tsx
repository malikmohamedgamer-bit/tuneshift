import { useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, Monitor, Sparkles } from 'lucide-react';
import { BUILT_IN_THEMES, presetSettings, SOUND_PRESETS } from '@tuneshift/core';
import { Badge, Button, cn, Switch } from '@tuneshift/ui';
import { useSettings } from '../state/settings';
import { useSound } from '../state/sound';
import { player } from '../player/controller';
import { useDemoTracks } from '../lib/queries';
import { AddMusicButtons } from './Library';
import { SignInForm, NotConfigured } from '../components/social/Account';
import { useAuth } from '../state/auth';
import { prefersReducedMotion } from '../state/settings';

const STEPS = ['Welcome', 'Theme', 'Music', 'Sound Lab', 'Account'] as const;

/** First-launch onboarding (spec §10): skippable at every step. */
export function Onboarding() {
  const nav = useNavigate();
  const s = useSettings();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(s.displayName);
  const demo = useDemoTracks();
  const label = useSound((x) => x.label);
  const auth = useAuth((x) => x.status);
  const finish = () => {
    s.set({ onboarded: true, displayName: name.trim() || s.displayName });
    void nav('/', { replace: true });
  };
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : finish());
  return (
    <div className="relative grid min-h-full place-items-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0 bg-hero opacity-25" aria-hidden="true" />
      <div
        className="relative w-full max-w-xl rounded-panel border border-line bg-bg-elevated p-6 shadow-theme md:p-8"
        data-testid="onboarding"
      >
        <div className="mb-6 flex items-center justify-between">
          <ol className="flex gap-1.5" aria-label="Onboarding progress">
            {STEPS.map((st, i) => (
              <li
                key={st}
                aria-current={i === step ? 'step' : undefined}
                className={cn('h-1.5 w-8 rounded-full', i <= step ? 'bg-hero' : 'bg-surface-hover')}
              >
                <span className="sr-only">{st}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="text-sm text-muted hover:text-fg"
            onClick={finish}
            data-testid="skip-onboarding"
          >
            Skip
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={prefersReducedMotion() ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {step === 0 && (
              <>
                <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-14 w-14" />
                <h1 className="font-display text-3xl font-extrabold">
                  Welcome to <span className="text-gradient">Tuneshift</span>
                </h1>
                <p className="text-muted">
                  Your music with a live Sound Lab: sped up, slowed + reverb, bass boost, 8D, a
                  10-band EQ and your own saved sounds.
                </p>
                <label className="block text-sm font-semibold">
                  What should we call you?
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={40}
                    placeholder="Your name"
                    className="mt-1 h-11 w-full rounded-ctl border border-line bg-bg px-3"
                    data-testid="onboarding-name"
                    onKeyDown={(e) => e.key === 'Enter' && next()}
                  />
                </label>
              </>
            )}
            {step === 1 && (
              <>
                <h2 className="font-display text-2xl font-extrabold">Pick a look</h2>
                <p className="text-sm text-muted">
                  You can build your own theme later in Settings → Appearance.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {BUILT_IN_THEMES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => s.set({ themeId: t.id })}
                      aria-pressed={s.themeId === t.id}
                      className={cn(
                        'overflow-hidden rounded-ctl border text-left',
                        s.themeId === t.id ? 'border-fg ring-2 ring-accent' : 'border-line',
                      )}
                      style={{ background: t.tokens.bg }}
                    >
                      <div
                        className="h-8"
                        style={{
                          backgroundImage: `linear-gradient(${t.gradient.angle}deg, ${t.gradient.stops.join(', ')})`,
                        }}
                      />
                      <div
                        className="truncate px-2 py-1.5 text-xs font-semibold"
                        style={{ color: t.tokens.text }}
                      >
                        {t.name}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 className="font-display text-2xl font-extrabold">Where's your music?</h2>
                <div className="space-y-3">
                  <Switch
                    label="Audius"
                    description="Free catalog with tons of remixes, sped-up & slowed edits, phonk, EDM and lo-fi."
                    checked={s.sourcesEnabled.audius}
                    onChange={(v) => s.set({ sourcesEnabled: { ...s.sourcesEnabled, audius: v } })}
                  />
                  <Switch
                    label="Jamendo"
                    description="Creative Commons catalog — needs a free key (Settings → Sources)."
                    checked={s.sourcesEnabled.jamendo}
                    onChange={(v) => s.set({ sourcesEnabled: { ...s.sourcesEnabled, jamendo: v } })}
                  />
                  <Switch
                    label="Your files"
                    description="MP3, M4A, FLAC, WAV… they stay on this device."
                    checked={s.sourcesEnabled.local}
                    onChange={(v) => s.set({ sourcesEnabled: { ...s.sourcesEnabled, local: v } })}
                  />
                </div>
                <AddMusicButtons compact />
                <div className="rounded-ctl border border-line bg-surface p-3 text-sm text-muted">
                  <p className="mb-1 font-semibold text-fg">Two badges you'll see</p>
                  <p>
                    <Badge tone="accent">Full Sound Lab</Badge> every effect works.{' '}
                    <Badge tone="warn">Speed only</Badge> the music host blocks audio processing, so
                    only speed presets (Sped Up, Nightcore, Slowed) apply.
                  </p>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <h2 className="font-display text-2xl font-extrabold">Try the Sound Lab</h2>
                <p className="text-sm text-muted">
                  Play an original demo loop and tap a preset — it changes live.
                </p>
                <Button
                  variant="primary"
                  icon={<Sparkles size={16} />}
                  disabled={!demo.data?.length}
                  onClick={() =>
                    void player.playTracks(demo.data ?? [], 0, {
                      name: 'Demo',
                      kind: 'collection',
                      id: 'demo',
                    })
                  }
                  data-testid="onboarding-play-demo"
                >
                  Play a demo loop
                </Button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {SOUND_PRESETS.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        player.applySound(
                          presetSettings(p.id),
                          { kind: 'preset', id: p.id },
                          p.name,
                        )
                      }
                      className="relative rounded-ctl p-2 text-left text-xs font-bold text-white"
                      style={{
                        backgroundImage: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})`,
                      }}
                    >
                      {p.name}
                      {label === p.name && (
                        <Check size={13} className="absolute right-1.5 top-1.5" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="flex items-start gap-2 rounded-ctl border border-line bg-surface p-3 text-sm text-muted">
                  <Monitor size={18} className="mt-0.5 shrink-0" />
                  <p>
                    <span className="font-semibold text-fg">Boost mode</span> (Windows app) and the{' '}
                    <span className="font-semibold text-fg">Tuneshift Boost</span> browser extension
                    bring these effects to Spotify, YouTube Music and other apps — everything except
                    true speed change.
                  </p>
                </div>
              </>
            )}
            {step === 4 && (
              <>
                <h2 className="font-display text-2xl font-extrabold">
                  Listen with friends (optional)
                </h2>
                <p className="text-sm text-muted">
                  Sign in to sync across devices, see what friends play and start listening parties.
                  You can skip this — everything else works without an account.
                </p>
                {auth === 'unconfigured' ? (
                  <NotConfigured />
                ) : auth === 'signed-in' ? (
                  <p className="text-sm font-semibold text-emerald-300">You're signed in.</p>
                ) : (
                  <SignInForm />
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
        <div className="mt-8 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>
            Back
          </Button>
          <Button
            variant="primary"
            icon={<ArrowRight size={16} />}
            onClick={next}
            data-testid="onboarding-next"
          >
            {step === STEPS.length - 1 ? 'Start listening' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
