# Tuneshift — instructions for Claude Code sessions

**Read `PROGRESS.md` first.** It says what is done, in progress and next. The full spec is `docs/SPEC.md`
(section numbers are used everywhere). Decisions and their reasons live in `DECISIONS.md`; things that
need the owner's action live in `LATER.md`.

## Commands (pnpm 10, Node ≥ 22)

| Command                                   | What it does                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `pnpm install`                            | install the workspace                                                              |
| `pnpm dev`                                | web app at http://localhost:5173                                                   |
| `pnpm build`                              | production web build (base `/tuneshift/`) → `apps/web/dist` (+ 404.html fallback)  |
| `pnpm typecheck`                          | `tsc` in every package                                                             |
| `pnpm lint`                               | ESLint (zero warnings) + Prettier check                                            |
| `pnpm format`                             | Prettier write                                                                     |
| `pnpm test`                               | Vitest: unit projects (node) + audio browser project (Chromium via Playwright)     |
| `pnpm e2e`                                | builds, then Playwright E2E against `vite preview` at `/tuneshift/`                |
| `pnpm ext:build`                          | builds the MV3 extension → `apps/extension/dist` + `tuneshift-boost-extension.zip` |
| `pnpm desktop:dev` / `pnpm desktop:build` | Tauri 2 (needs Rust + MSVC; CI builds on windows-latest)                           |
| `pnpm demo:make` / `pnpm fixtures:make`   | regenerate the original demo loops / E2E WAV fixture                               |

Phase gate (run before every phase commit): `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e`.

## Architecture rules

- Monorepo: `packages/core` (pure TS: types, schemas, queue, matching, LRC, sync, themes, share codes),
  `packages/audio` (Web Audio graph, presets via core, IRs, visualizer, export, CORS probe),
  `packages/sources` (local/audius/jamendo/lrclib adapters + MSW mocks), `packages/ui` (shared React
  components + theme engine), `apps/web` (React app, also the Tauri frontend), `apps/desktop` (Tauri 2),
  `apps/extension` (MV3 "Tuneshift Boost").
- Packages are source-only TS (`exports` → `src/*.ts`); Vite compiles them. No build step per package.
- `packages/core` must stay DOM-free (it runs in Node tests, workers and the extension service worker).
- One `EffectChain` (packages/audio) is used everywhere: realtime player, offline export, offline tests,
  desktop Boost mode and the extension. Never fork the DSP.
- Every AudioParam change is ramped (`setTargetAtTime`/linear ramps). Stage bypass = 30 ms dry/wet
  crossfade, never an abrupt reconnect while audio flows.
- Dexie (IndexedDB) is the source of truth; Supabase is optional sync on top (LWW by `updatedAt`).
- Every source goes through the `SourceAdapter` interface; the UI never calls a source API directly.
- Platform specifics (Tauri, extension) sit behind `apps/web/src/platform/*`, loaded only when present.
- TypeScript strict, no `any` without a justifying comment, ESLint + Prettier clean, error boundary on
  every route, user-visible toasts at every network/audio boundary, no console errors in normal use.
- Exact versions only (`.npmrc save-exact`); commit lockfiles. Verify a package's API before using it.

## Never do (spec §2 and §0.2)

- Never download, rip, proxy, cache or record audio from YouTube, Spotify, Apple Music, TikTok or
  SoundCloud. No yt-dlp, Invidious, Piped or similar.
- Never record or export audio captured in Boost mode (desktop or extension).
- Never put secrets in client code. Only public keys (Supabase anon key, Audius API key, Jamendo
  client_id) in `VITE_` vars. Never use a Supabase service-role key anywhere.
- Export with effects is only for the user's own local files.
- Always show attribution (artist + link to the Audius/Jamendo page, Jamendo licence badge).
- Non-commercial: no payments, no premium tier.
- No admin/UAC actions, no driver installs (VB-Cable), no account creation/sign-in, no paid tiers, nothing
  that needs a human click. Put those steps in `LATER.md` instead.
- No placeholders, stubs, fake production data or dead buttons; a disabled control states why.
- Never skip/weaken a test to make it pass (unless the test was wrong; log it in DECISIONS.md).

## Phase checklist

- [ ] P0 Setup · [ ] P1 Core + audio + local · [ ] P2 Shell + themes · [ ] P3 Sources
- [ ] P4 Player + library · [ ] P5 Supabase · [ ] P6 PWA · [ ] P7 Desktop · [ ] P8 Extension
- [ ] P9 Polish & audit

(The live, detailed checklist is PROGRESS.md.) Branch: `main`; commit `phase N: <summary>`, push after each
phase. Keep PROGRESS.md current after every meaningful step.
