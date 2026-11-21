# Decisions (one line each: decision — reason)

## Environment & tooling

- Project lives in `C:\Users\Malik\Projects\tuneshift` — the session started in an unrelated Roblox project, so §0.3b's default path applies.
- pnpm 10.24.0 installed with `npm i -g` into the user npm prefix (%APPDATA%\npm) — Node is in Program Files, so `corepack enable` would need admin; npm user prefix needs no prompt.
- TypeScript pinned to 6.0.3 (not 7.0.2) — typescript-eslint 8.73 supports `typescript <6.1.0`.
- Vite 8.3.8 / Vitest 5.1.1 / React 19.3 / React Router 8.5 / ESLint 10 / Tailwind 4.3 — current stable majors, peer ranges verified with `npm view`.
- `noUncheckedIndexedAccess` left off — DSP code indexes typed arrays in hot loops; `strict` stays on.
- Workspace packages are source-only TS consumed by Vite (no per-package build) — one compile path, no stale dist.
- Rust is not installed and MSVC is absent, so no local `cargo` — per §0.3 the desktop crate is checked/built on GitHub's windows-latest runner.
- No Supabase MCP connector in this session — backend steps go to LATER.md; app is local-first with runtime Supabase URL/key entry.

## Sources

- Audius works key-free (`app_name=Tuneshift`, verified live 2026-11-21: trending, search and stream 200, stream redirect chain sends `Access-Control-Allow-Origin: *`) — ships enabled; optional key is sent as `api_key` query param.
- Audius stream URL = `https://api.audius.co/v1/tracks/{id}/stream?app_name=Tuneshift` (re-signed on every request) — the final storage URL expires after 300 s, so we never cache it; retry adds a cache-buster.
- Jamendo ships disabled until a client_id is pasted (verified: API returns "Invalid Client Id" without one).

## Hosting
- GitHub Pages cannot be enabled: the account is on GitHub Free, which only serves Pages from public repos, and the spec asks for a private repo — I did not make anything public. `pages.yml` checks whether Pages is on and skips green until it is; LATER.md has the one-step fix.

## Audio engine
- Pitch shifter: `signalsmith-stretch` 1.3.2 (MIT, WASM AudioWorklet; verified API from its README/source) — first choice per spec; it loads its worklet from a blob: URL, so where CSP blocks that the chain reports "pitch unavailable" instead of failing.
- MP3 encoder: `@breezystack/lamejs` 1.2.7 — maintained ESM/TS fork of lamejs (the original npm `lamejs` 1.2.1 has the MPEGMode bug and no ESM).
- Limiter (spec values) + a static soft clipper after it (linear to 0.9, ceiling 0.935 ≈ −0.58 dBFS) — DynamicsCompressor at 20:1 can still overshoot −0.5 dBFS on hot transients; the clipper guarantees the ceiling without touching normal material.
- Stage bypass = parallel dry/wet gains crossfaded over 30 ms (setTargetAtTime τ=10 ms); heavy branches (convolver, HRTF panner, worklet, lo-fi) are disconnected 250 ms after going silent to save CPU, reconnected before fading in — no topology change while audible.
- Chain input is a 2-channel "speakers" up-mix GainNode — otherwise ChannelSplitter (discrete) would put mono files on the left only through the M/S stages.
- Reverb room changes crossfade between two ConvolverNodes (A/B) to avoid clicks when the IR buffer changes.
- Vocal reduce keeps < 150 Hz intact via an LR4 crossover and cancels the centre above it (keeps the bass/kick).
- 8D in offline export uses the same OscillatorNodes (they render fine in OfflineAudioContext), so no separate automation curve was needed.
- Export of independent-pitch sounds: the buffer source's playbackRate shifts pitch too, so the worklet is given `pitchSemitones − 12·log2(speed)`.
- Limited mode uses a second, unrouted <audio> per deck (an element can never be un-routed once createMediaElementSource is called); Background-safe mode hands playback between the two elements on visibility changes.
- CORS probe = `fetch(url, {mode:'cors', Range: bytes=0-1})` per host (follows redirects, cached 7 days) + element-error fallback — equivalent to the spec's HEAD/range check and cheaper than an analyser probe.
- Live inputs (desktop Boost, extension): tempo can't change, so tape-style speed is turned into the equivalent worklet pitch shift (Nightcore still sounds higher, just not faster).
- Auto headroom = −(peak EQ+bass boost − 6 dB) when the peak exceeds +6 dB, computed analytically from the Web Audio biquad formulas (same maths draws the EQ curve).
- Demo loops synthesised in Node by `scripts/synth.ts` (our own oscillators/envelopes, no samples) and encoded at 112 kbps MP3 with lamejs.
- P1's UI half (file import screens, Sound Lab controls, My Sounds UI, visualizer UI, export dialog) ships with the P2 app shell instead of a throwaway P1 UI — avoids building the screens twice.

## App structure
- Phases 3 (sources UI) and 4 (player + library) landed inside the phase-2 commit — the screens and the player controller were built together; later phase commits cover what remained.
- Icons: `lucide-react` 1.77 (ISC) instead of hand-drawn SVGs — consistent, accessible, tree-shaken.
- Drag reordering: `motion`'s Reorder (already used for animation) + Alt+↑/↓ keyboard moves and "Move up/down" menu items for accessibility — avoids a separate DnD library.
- Router: React Router 8 `createBrowserRouter` with `basename` = Vite BASE_URL; every route has an errorElement; unknown paths render a not-found page inside the shell.
- Local cover art lives in IndexedDB and is referenced by `idb-cover:<id>` tokens resolved to object URLs (no huge data URLs in track records).
- Browsers without File System Access copy dropped files into OPFS (persisted); browsers with neither keep the File for the session only and say so.
- Sound persistence semantics: a preset picked in the Sound Lab stays on for the next songs ("your pick") unless a song/playlist assignment overrides it; "Reset to default" drops the pick.
- `window.prompt/confirm` replaced by an in-app `askText`/`confirmAction` dialog service (themed, accessible).
- Audius artwork hosts sometimes return 502/503: the Artwork component retries the same path on the API's `mirrors` hosts before falling back to a gradient.

## Supabase (phase 5)
- Synced tables keep the client's LWW stamp in `updated_at` (ms) and a server `synced_at` (trigger) as the pull cursor — pulls are immune to device clock skew; merges are LWW per record with tombstones.
- Folders, smart playlists, sound assignments, lyrics offsets and portable settings share one `user_records(kind, id, data)` table — fewer tables, same RLS rule.
- Friend activity uses Realtime Presence on private `activity:<uid>` channels; RLS on `realtime.messages` lets only accepted friends read them. Parties use private `party:<code>` channels gated by `party_members` (joined through the `join_party` RPC).
- Share links: offline codes (`ts1.<kind>.<deflate+base64url>.<checksum>`) work with no server at all; short codes need Supabase and resolve through the `get_share` SECURITY DEFINER RPC that returns only the requested row.
- No live Postgres/Supabase was available: SQL is syntax-checked in CI with `libpg-query` (the real Postgres 18 parser, WASM), and the sync engine is tested against an in-memory fake client.
- Supabase URL + anon key can be pasted at runtime (Settings → Account) — the Pages build needs no secrets; service-role keys are rejected by a JWT `role` / `sb_secret_` check.

## PWA & performance (phase 6)
- Service worker: vite-plugin-pwa `generateSW`, `registerType: 'prompt'` → an update toast with Reload; demo loops cached at runtime (CacheFirst + range requests), cover art StaleWhileRevalidate, streamed audio never cached.
- Precache only Latin font subsets; other scripts' subsets load on demand.
- Bundle budget: supabase-js loads only when a project is configured; the MP3 encoder only inside the export worker (formats split from the encoder); full-screen player, queue view, command palette and dialogs are lazy (idle or on first use). Measured with `scripts/measure-bundle.mjs`: 296 KB gz requested before the load event (target < 300 KB).
- Install: Chromium `beforeinstallprompt` (banner after 60 s of use + Settings → About); iOS shows Add-to-Home-Screen steps (no prompt API).

## Desktop (phase 7)
- Tauri 2.12.7 with plugins single-instance (deep-link feature), window-state, global-shortcut, autostart, deep-link, dialog, opener; all versions pinned exactly. The desktop frontend is the same web app built with `--mode desktop` (no service worker, base `/`), output `apps/web/dist-desktop`.
- Windows-only Rust (`windows` 0.62.2 for SMTC, `webview2-com` 0.39.1 for the permission handler) is behind `#[cfg(windows)]`; the CI `desktop-crate` job runs cargo check/clippy `-D warnings`/test on windows-latest. Rust could not be built locally without a system-wide MSVC Build Tools install (a UAC prompt, forbidden), so CI is the compiler.
- Audio always plays in the main window. The mini player and overlay are separate webviews (`index.html?window=mini|overlay`) that render small controller UIs from a ~4 Hz `ts://state` broadcast and send `ts://command` events back. This keeps one audio graph and makes the secondary windows cheap.
- Overlay: created once at startup, `focus: false`, `focusable: false`, `skipTaskbar`, always-on-top, click-through via `set_ignore_cursor_events`; it is never re-shown — visibility (always / on change / off) is CSS opacity only, so it can't steal focus from a game.
- Media keys: handled by WebView2's Media Session → Windows SMTC integration (already wired for the web app), not by global shortcuts, so a key press never toggles twice. Global shortcuts are only the configurable Ctrl+Alt combos.
- Close button hides to the tray when "Close to tray" is on (default); Quit is in the tray menu.
- Local files on desktop are scanned by Rust (walkdir, audio extensions only, no symlink following) and played via the asset protocol, whose scope is empty in the config and widened at runtime per watched folder / opened file (`allow_asset_dir`, `allow_asset_file`), re-applied on every launch. The asset protocol sends CORS headers, so local files always get the full Sound Lab.
- Boost mode (desktop): `getUserMedia` on the chosen input device (e.g. CABLE Output) with echo cancellation/noise suppression/AGC off, through the same EffectChain via LiveInputEngine (latency hint "interactive"), out to the default device. WebView2's mic permission prompt is auto-allowed only for media-capture kinds via `PermissionRequested`. Nothing captured is recorded or exported.
- Discord Rich Presence via `discord-rich-presence` 1.1.0, only when the user enables it and pastes their own Application ID (no shared ID is bundled); cleared in Private session.
- Release: `desktop-release.yml` uses `tauri-apps/tauri-action@v0` on windows-latest, NSIS (current-user install, no admin), draft release, on tag `v*` or manual dispatch; the extension zip is attached by `gh release upload`. The installer is unsigned (no paid certificate), so SmartScreen warns once.

## Extension (phase 8)
- Built with a manual multi-entry Vite script (`apps/extension/build.mjs`) instead of a CRX plugin: popup + offscreen pages share chunks, the service worker is one ES module, the content script one IIFE. Fewer moving parts and no plugin MV3-offscreen uncertainty.
- One offscreen document (reason USER_MEDIA) holds one `LiveInputEngine` per boosted tab (separate AudioContexts), so several tabs can be boosted with different sounds. It closes when the last boost stops.
- The service worker keeps boosted tabs in `chrome.storage.session` (it can be stopped while idle) and reconciles with the offscreen document when asked. A boost stops when its tab closes, its capture track ends, or it navigates to another origin; same-origin navigation (e.g. the next YouTube video) keeps it.
- Permissions: tabCapture, offscreen, storage, scripting, activeTab — no host permissions. Page speed is injected on demand into the active tab through activeTab; after a full page reload the user re-opens the popup to re-apply it (documented).
- Pitch worklet: MV3 extension pages forbid blob: scripts, so the Signalsmith worklet module ships as a file (`worklet/signalsmith-stretch.mjs`, set via `setPitchWorkletUrl`) and the CSP adds only `'wasm-unsafe-eval'`. Verified in a real browser by an E2E test that renders a pitch shift under the extension CSP.
- Speed on live tab audio: without page speed, tape speed becomes a pitch shift (as in desktop Boost) and the speed slider is disabled with the reason; with page speed on, the page's own player runs at the chosen speed (`preservesPitch` = Keep pitch) and the engine stops converting speed to pitch so it isn't applied twice. Spotify Web is marked "speed not supported".
- My Sounds live in `chrome.storage.sync`, one key per sound (8 KB item limit), max 60. Share codes: offline `ts1.` codes import directly; short links need the app (they're resolved through Supabase), and the popup says so.
- Extension E2E: Playwright loads the unpacked build in full Chromium; locally (where that binary can't start) it falls back to Edge. Tab capture itself needs a real toolbar click, so it's covered in MANUAL_TESTS.md.

## Polish (phase 9)
- Lighthouse was run with Lighthouse 13.6.0 against the production build in Edge (Playwright's full Chromium can't start on this Windows Insider build). Desktop preset: 98/98/100. Mobile preset: 81/98/100 — LCP on a first visit is the onboarding text, which waits for the ~296 KB gz app shell under simulated slow 4G + 4× CPU. Accepted for v0.1.0 (target met on desktop, critical JS under the 300 KB budget); prerendering the onboarding/home shell is the next step if mobile matters.
- Shell budget kept under 300 KB gz by lazy-loading the desktop title bar and the lyrics tab.
