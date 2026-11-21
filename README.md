# Tuneshift

A personal music app with a live **Sound Lab**: Sped Up, Slowed + Reverb, Nightcore, bass boost, 8D, lo-fi, karaoke and more, applied in real time to your own files, the bundled demo tracks and free legal streams (Audius, Jamendo). It ships as:

- **Web app / installable PWA** (`apps/web`)
- **Windows desktop app** (`apps/desktop`, Tauri 2): always-on-top mini player, game overlay, tray, global shortcuts, Discord status, and **Boost mode** for other apps' audio via VB-Cable
- **Chrome/Edge extension "Tuneshift Boost"** (`apps/extension`, MV3): the same Sound Lab on any tab, live

Non-commercial. Tuneshift never downloads, rips, proxies or records audio from YouTube, Spotify, Apple Music, TikTok or SoundCloud, and Boost mode/the extension process live sound only.

## Quick start

```powershell
pnpm install
```

```powershell
pnpm dev
```

Open http://localhost:5173. No keys are needed: local files, demo tracks and Audius work out of the box. Optional public keys go in `.env.local` (see `.env.example`) or **Settings → Sources / Account** at runtime.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web app dev server |
| `pnpm build` | Production web build (base `/tuneshift/`) + 404 fallback |
| `pnpm typecheck` / `pnpm lint` | TypeScript strict / ESLint + Prettier |
| `pnpm test` | Vitest: unit tests + OfflineAudioContext preset tests in Chromium |
| `pnpm e2e` | Builds web + extension, then Playwright (app flow, axe, PWA, extension) |
| `pnpm ext:build` | Builds the extension to `apps/extension/dist` and zips `tuneshift-boost-extension.zip` |
| `pnpm desktop:dev` / `pnpm desktop:build` | Tauri dev / NSIS build (needs Rust + MSVC build tools) |
| `pnpm demo:make` / `pnpm fixtures:make` | Regenerate the bundled demo tracks / test audio |

## Architecture

```
packages/core     DOM-free logic: sound settings + presets, queue, smart playlists, share codes,
                  sync merge, themes, stats, backup
packages/audio    Web Audio engine: EffectChain (EQ, bass, compressor, reverb, widener, 8D,
                  lo-fi, vocal reduce, limiter), 2-deck AudioEngine (crossfade, gapless,
                  normalization), LiveInputEngine, Signalsmith pitch worklet, export
packages/sources  Audius, Jamendo, LRCLIB and local-file adapters, collections, MSW mocks
packages/ui       Shared React controls, Sound Lab controls, theme engine
apps/web          The app (React 19, React Router, zustand, TanStack Query, Dexie, Tailwind v4)
apps/desktop      Tauri 2 shell (Rust): windows, tray, shortcuts, SMTC, Discord, folder scan
apps/extension    MV3 service worker + offscreen Sound Lab + popup + page-speed script
supabase/         Migration (RLS on every table), seed, config, SQL tests
```

Signal chain, sync design, desktop windows and extension design are explained in `DECISIONS.md`; status and the feature checklist are in `PROGRESS.md`.

## Sources and limits

- **Audius**: free, no key required (an API key only raises limits). Streams play with the full Sound Lab when the host allows CORS; otherwise "Limited mode" (speed/pitch only).
- **Jamendo**: needs a free client_id. Creative Commons; the licence badge and track link are shown.
- **LRCLIB**: synced lyrics, no key.
- **Local files**: full Sound Lab always; on desktop, watched folders are scanned by Rust.
- YouTube/Spotify/etc. are only linked to ("Find a remix"). For effects on them use desktop Boost mode or the extension.

## Deployment

- **CI** (`.github/workflows/ci.yml`): typecheck, lint, unit, E2E and the extension zip on Ubuntu; `cargo check/clippy/test --locked` on Windows.
- **Web** (`pages.yml`): builds with base `/tuneshift/` and deploys to GitHub Pages once Pages is enabled (see `LATER.md`).
- **Desktop** (`desktop-release.yml`): on a `v*` tag or manual run, builds the NSIS installer with tauri-action and attaches the extension zip to a **draft** GitHub Release.

## Extension: load unpacked

1. `pnpm ext:build` (or download `tuneshift-boost-extension.zip` from a release and unzip it).
2. `chrome://extensions` or `edge://extensions` → **Developer mode** → **Load unpacked** → `apps/extension/dist` (or the unzipped folder).
3. Open a tab with audio → click the Tuneshift icon → **Boost this tab**.

## Known limitations

- Desktop installer is unsigned (SmartScreen: More info → Run anyway).
- Exclusive-fullscreen games can cover the overlay; use borderless windowed.
- iOS pauses Web Audio when locked, so Background-safe mode keeps tape speed only.
- Supabase features (friends, sync, parties, short links) need your own free project.
- More in `LATER.md`.

## Docs

`docs/SPEC.md` (the brief) · `PLAN.md` · `PROGRESS.md` · `DECISIONS.md` · `LATER.md` · `MANUAL_TESTS.md` · `CLAUDE.md`
