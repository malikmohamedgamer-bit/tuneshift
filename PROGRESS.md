# PROGRESS — read this first

Resume rule: "continue from PROGRESS.md". Update after every meaningful step.

## Environment inventory (2026-11-21)

| Item                | Value                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| OS                  | Windows 11 Home 10.0.26300 (Claude Code desktop, driven remotely)                                                                       |
| Node / npm          | v24.22.1 (C:\Program Files\nodejs) / 11.19.1                                                                                            |
| pnpm                | 10.24.0 (installed to user npm prefix, no admin)                                                                                        |
| Rust / cargo / MSVC | not installed → desktop crate checked & built on CI (windows-latest)                                                                    |
| Git                 | 2.56.0.windows.3                                                                                                                        |
| gh                  | 2.103.3, logged in as `malikmohamedgamer-bit` (scopes: repo, workflow, gist, read:org)                                                  |
| MCP connectors      | No GitHub MCP, **no Supabase MCP**. Others present are unrelated (Blender, Roblox Studio, Shopify, Drive, browser).                     |
| Network             | npm registry ✅, crates.io API ✅, docs.audius.org ✅, api.audius.co ✅ (key-free), lrclib.net ✅, api.jamendo.com ✅ (needs client_id) |

## Status

- **Done:** P0–P8. Desktop crate passes cargo check/clippy -D warnings/test on CI (windows-latest); extension builds, zips and passes 6 E2E tests in a real browser.
- **Now:** v0.1.0 release (tag → desktop-release.yml) → P9 polish (a11y, Lighthouse, MANUAL_TESTS.md, README.md, LATER.md).
- **Gate (latest):** typecheck ✅ lint ✅ unit 112 ✅ e2e 24 ✅ (18 web incl. axe on 8 screens + 6 extension). Shell JS 295.8 KB gz before load.
- **Local browser note:** Playwright's full Chromium can't start on this Windows Insider build (side-by-side error), so the extension E2E falls back to installed Edge locally; CI (Linux) uses Chromium.
- **Known polish items:** replace window.prompt (custom sleep minutes, paste sound/theme code) with modals; Lighthouse run; bundle-size check.

## Phases

- [x] P0 Setup — monorepo, tooling, CLAUDE.md, CI, env validation + missing-key screen
- [x] P1 Core + audio engine + local files (engine side; UI side ships in P2)
- [x] P2 App shell + themes
- [x] P3 Sources
- [x] P4 Player + library
- [x] P5 Supabase (code + SQL validated offline; live project = LATER.md)
- [x] P6 PWA (offline shell, install prompt + iOS hint, update toast, Background-safe mode; critical-path JS 296 KB gz)
- [x] P7 Desktop (Tauri) — Rust compiled on CI only (no local MSVC; installing it needs UAC)
- [x] P8 Extension
- [ ] P9 Polish & audit

## Feature checklist (by spec section)

### §3 Sources

- [x] SourceAdapter interface + registry (enable/disable without breakage)
- [x] Local: drag-drop, file picker, folder picker (FSA + webkitdirectory), handles in IndexedDB, OPFS copy + usage/delete
- [ ] Local (desktop): watched folders, recursive scan, rescan, asset protocol playback with CORS
- [x] Demo tracks script (3 original loops) committed under apps/web/public/demo + "Demo" collection
- [x] music-metadata tags + cover art, filename fallback
- [x] Audius adapter (key-free, optional key)
- [x] Jamendo adapter (disabled until key; Add key card)
- [x] Runtime API keys in Settings (validated, no rebuild)
- [x] LRCLIB lyrics (headers, 404, 429 Retry-After, IndexedDB cache)
- [x] CORS probe per host + Limited mode + "Full Sound Lab"/"Speed only" badges
- [x] Unified search (grouped, filters, recent searches)
- [x] Remix Finder

### §4 Audio engine

- [x] AudioContext on first gesture + "Tap to start audio"
- [x] Full signal chain (decks, pitch worklet, preamp, 10-band EQ, bass, compressor, reverb, widener, 8D, lofi, vocal reduce, master, limiter, analyser)
- [x] Ramped params, 30 ms bypass crossfades, auto headroom + meter
- [x] Tape speed + independent pitch (signalsmith-stretch)
- [x] Generated reverb IRs (6 rooms, cached), pre-delay, tone
- [x] 8D via oscillators (HRTF), radius, height wobble
- [x] Two decks, preload, equal-power crossfade 0–12 s, gapless
- [x] Loudness normalization (worker LUFS for local, RMS for remote, ReplayGain tags)
- [x] All Sound presets + EQ presets (exact values)
- [x] My Sounds (save/rename/duplicate/delete/reorder/favourite/export/import/share)
- [x] Sound assignment song > playlist > global + active indicator + reset
- [x] A/B compare (hold button / B)
- [x] Visualizer (bars, waveform, radial, ambient glow; pause hidden; reduced motion)
- [x] Export with effects (local only; WAV 16/24, MP3; worker progress)

### §5 Player

- [x] Transport, seek with hover time, volume/mute
- [x] Queue panel (now / next up / autoplay; drag reorder, remove, clear, play next, add, save as playlist; persisted)
- [x] Shuffle (random / smart), repeat off/all/one
- [x] Autoplay radio
- [x] Sleep timer (presets, end of track/queue, custom, 10 s fade)
- [x] A–B loop
- [x] Resume last track paused
- [x] Media Session (metadata, handlers, position state)
- [x] Stream failure retry → skip toast

### §6 Library

- [x] Likes, playlists (CRUD, cover upload/mosaic, drag reorder, duplicate, delete+undo), folders
- [x] Smart playlists (rule builder AND/OR, sort, limit, live)
- [x] Recently played + history (search, clear)
- [x] Local views: songs/albums/artists/folders, sort/filter, duplicates, missing files
- [x] Artist + album/playlist pages (Audius/Jamendo)
- [x] Stats + Wrapped (story, export image)
- [x] Import playlist from text/CSV (fuzzy match review)
- [x] Backup/restore JSON

### §7 Home / browse / now playing / lyrics

- [x] Home sections in order (continue, sped/slowed picks, trending, collections, friends, top sounds, made for you)
- [x] Browse (genres/moods, trending by genre, Jamendo featured)
- [x] Now playing panel + full screen
- [x] Lyrics (synced, auto-scroll, tap-to-seek, plain fallback, none state, offset per track, speed-aware, full screen, karaoke)

### §8 Friends (Supabase)

- [x] Migrations with RLS + indexes + share RPC + seed
- [x] Auth (magic link + password, username, avatar ≤2 MB resized)
- [x] Offline-first sync (queue, LWW)
- [x] Friends (search, requests, list)
- [x] Sharing (/s/<code>, short code, preview page)
- [x] Presence activity + privacy toggles
- [x] Listening parties (broadcast sync, drift correction, chat, reactions, pass control)

### §9 Themes

- [x] Token engine + Tailwind mapping
- [x] 12 built-in themes (AA verified)
- [x] Theme editor (tokens, gradient builder, animated bg, blur, radius, fonts, density, adaptive accent)
- [x] Layouts Classic / Compact / Focus
- [x] Custom themes save/export/import/share, per-playlist theme
- [x] Custom CSS (scoped) + reset escape hatch (Shift on load)

### §10 Settings / a11y / shortcuts / onboarding

- [x] All settings sections
- [x] Configurable shortcuts + ? cheat sheet
- [x] Command palette
- [ ] Accessibility (focus, ARIA, slider value text, announcements, reduced motion, text scale)
- [x] Onboarding (skippable)
- [x] Empty/loading/error states everywhere
- [x] Responsive phone layout (bottom nav, mini bar, swipe-up player, swipe gestures)

### §11 Platforms

- [x] PWA (offline shell, install prompt, update toast, Background-safe mode)
- [ ] GitHub Pages deploy (base, 404 fallback, scope)
- [x] Desktop: main window (title bar, state, tray-close), mini player, overlay, tray, global shortcuts, single instance, autostart, deep links, file associations
- [x] Desktop: Discord RPC, Boost mode (wizard, capture, latency, meter), SMTC, WebView2 permission
- [x] Desktop: icons, NSIS, release workflow
- [ ] Desktop: v0.1.0 tag → draft release built
- [x] Extension: tab capture boost (multi-tab, badge, cleanup), popup, My Sounds sync, share-code import, speed content script, zip

### §13 Tests

- [x] Vitest unit suites listed in §13
- [x] Audio OfflineAudioContext preset tests (a–f)
- [x] Playwright E2E flow + axe
- [x] Rust cargo tests (CI, windows-latest)
- [x] CI on every push
