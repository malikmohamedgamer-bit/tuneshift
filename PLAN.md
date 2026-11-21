# Tuneshift — build plan

## File tree (target)

```
tuneshift/
  CLAUDE.md PLAN.md PROGRESS.md DECISIONS.md LATER.md README.md MANUAL_TESTS.md .env.example docs/SPEC.md
  package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.tools.json eslint.config.js .prettierrc.json
  vitest.config.ts playwright.config.ts
  assets/logo.svg                       # source logo (waveform "T", purple→pink)
  scripts/ make-demo-tracks.ts make-test-fixtures.ts zip-extension.ts synth.ts
  packages/
    core/src/   types.ts sound.ts presets.ts eq.ts queue.ts shuffle.ts smartPlaylist.ts match.ts lrc.ts
                shareCode.ts sync.ts theme.ts themes.ts color.ts stats.ts time.ts backup.ts rng.ts index.ts
    audio/src/  chain.ts engine.ts deck.ts ir.ts biquad.ts pitch.ts corsProbe.ts visualizer.ts loudness.ts
                wav.ts export/ (render.ts, encode.worker.ts, index.ts) index.ts
    audio/test/ presets.browser.test.ts (OfflineAudioContext), *.test.ts (pure DSP helpers)
    sources/src/ types.ts audius.ts jamendo.ts lrclib.ts local.ts registry.ts remixFinder.ts collections.ts
                 http.ts mocks/ (fixtures + MSW handlers)
    ui/src/     theme engine (applyTheme, adaptive accent), Slider, Switch, Button, PresetCard, EqEditor,
                SoundLabControls, Icon set, styles.css
  apps/
    web/        Vite + React app (routes, stores, Dexie db, player controller, platform bridges, PWA)
    desktop/    Tauri 2: src-tauri (Rust: tray, windows, shortcuts, SMTC, Discord, scan, WebView2 perms)
    extension/  MV3: manifest, service worker, offscreen doc (tab capture → EffectChain), popup, content script
  supabase/ migrations/*.sql seed.sql
  e2e/ *.spec.ts fixtures/
  .github/workflows/ ci.yml pages.yml desktop-release.yml
```

## Phases

P0 setup → P1 core + audio + local → P2 shell + themes → P3 sources → P4 player + library →
P5 Supabase → P6 PWA → P7 desktop → P8 extension → P9 polish/audit. Gate between phases:
`pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`, then commit + push.

## Risks and mitigations

| Risk                                                                         | Mitigation                                                                                                                              |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| No Rust/MSVC locally → desktop crate can't be compiled here                  | Windows-only code behind `#[cfg(windows)]`; CI job `cargo check/clippy/test` on windows-latest; iterate via `gh run view` (≤5 attempts) |
| Tooling majors newer than familiar (Vite 8, Vitest 5, RR 8, ESLint 10, TS 6) | Read installed types; typecheck gates; TS pinned to 6.0.3 for typescript-eslint                                                         |
| CORS-less hosts make Web Audio silent                                        | fetch range probe per host + element error fallback → Limited mode via a second, unrouted `<audio>`                                     |
| Mono files through ChannelSplitter come out left-only                        | chain input forced to 2-ch `speakers` up-mix before any M/S stage                                                                       |
| Limiter alone can overshoot −0.5 dBFS on transients                          | limiter + static safety clipper (ceiling −0.6 dBFS) after it                                                                            |
| signalsmith-stretch loads its worklet from a blob: URL (blocked by MV3 CSP)  | pitch stage loads lazily and degrades to "Live pitch unavailable" with a reason                                                         |
| No Supabase connector → backend can't be provisioned                         | migrations + client + local-first app; "Sign-in not configured yet" state; runtime URL/key entry in Settings; steps in LATER.md         |
| WebView2 getUserMedia prompt in Boost mode                                   | `with_webview` → `ICoreWebView2::add_PermissionRequested` auto-allow for the app origin (Windows only)                                  |
| iOS suspends Web Audio in background                                         | Background-safe mode hands playback to an unrouted `<audio>` while hidden                                                               |
| Overlay stealing game focus                                                  | created once, `focusable:false`, click-through, visibility via content opacity only                                                     |
