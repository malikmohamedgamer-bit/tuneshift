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

- **Now:** P2 app shell + themes (includes the UI half of P1: local file import, Sound Lab, My Sounds, A/B, visualizer, export UI)
- **Next:** P3 sources UI (search, artist/album pages, lyrics)
- **Done:** P1 engine/DSP (EffectChain, AudioEngine, LiveInputEngine, IRs, loudness, WAV/MP3 export, CORS probe, visualizer, 29 audio tests incl. OfflineAudioContext a–f), sources package (Audius/Jamendo/LRCLIB/local adapters, registry, remix finder, collections, MSW mocks, 15 tests), 3 original demo loops, E2E WAV fixture. P0 (tooling, core package + 54 unit tests, env validation, CI + Pages workflows, icons)

## Phases

- [x] P0 Setup — monorepo, tooling, CLAUDE.md, CI, env validation + missing-key screen
- [x] P1 Core + audio engine + local files (engine side; UI side ships in P2)
- [ ] P2 App shell + themes
- [ ] P3 Sources
- [ ] P4 Player + library
- [ ] P5 Supabase
- [ ] P6 PWA
- [ ] P7 Desktop (Tauri)
- [ ] P8 Extension
- [ ] P9 Polish & audit

## Feature checklist (by spec section)

### §3 Sources

- [ ] SourceAdapter interface + registry (enable/disable without breakage)
- [ ] Local: drag-drop, file picker, folder picker (FSA + webkitdirectory), handles in IndexedDB, OPFS copy + usage/delete
- [ ] Local (desktop): watched folders, recursive scan, rescan, asset protocol playback with CORS
- [x] Demo tracks script (3 original loops) committed under apps/web/public/demo + "Demo" collection
- [ ] music-metadata tags + cover art, filename fallback
- [x] Audius adapter (key-free, optional key)
- [x] Jamendo adapter (disabled until key; Add key card)
- [ ] Runtime API keys in Settings (validated, no rebuild)
- [x] LRCLIB lyrics (headers, 404, 429 Retry-After, IndexedDB cache)
- [ ] CORS probe per host + Limited mode + "Full Sound Lab"/"Speed only" badges
- [ ] Unified search (grouped, filters, recent searches)
- [ ] Remix Finder

### §4 Audio engine

- [ ] AudioContext on first gesture + "Tap to start audio"
- [x] Full signal chain (decks, pitch worklet, preamp, 10-band EQ, bass, compressor, reverb, widener, 8D, lofi, vocal reduce, master, limiter, analyser)
- [x] Ramped params, 30 ms bypass crossfades, auto headroom + meter
- [x] Tape speed + independent pitch (signalsmith-stretch)
- [x] Generated reverb IRs (6 rooms, cached), pre-delay, tone
- [x] 8D via oscillators (HRTF), radius, height wobble
- [ ] Two decks, preload, equal-power crossfade 0–12 s, gapless
- [ ] Loudness normalization (worker LUFS for local, RMS for remote, ReplayGain tags)
- [x] All Sound presets + EQ presets (exact values)
- [ ] My Sounds (save/rename/duplicate/delete/reorder/favourite/export/import/share)
- [ ] Sound assignment song > playlist > global + active indicator + reset
- [ ] A/B compare (hold button / B)
- [ ] Visualizer (bars, waveform, radial, ambient glow; pause hidden; reduced motion)
- [ ] Export with effects (local only; WAV 16/24, MP3; worker progress)

### §5 Player

- [ ] Transport, seek with hover time, volume/mute
- [ ] Queue panel (now / next up / autoplay; drag reorder, remove, clear, play next, add, save as playlist; persisted)
- [ ] Shuffle (random / smart), repeat off/all/one
- [ ] Autoplay radio
- [ ] Sleep timer (presets, end of track/queue, custom, 10 s fade)
- [ ] A–B loop
- [ ] Resume last track paused
- [ ] Media Session (metadata, handlers, position state)
- [ ] Stream failure retry → skip toast

### §6 Library

- [ ] Likes, playlists (CRUD, cover upload/mosaic, drag reorder, duplicate, delete+undo), folders
- [ ] Smart playlists (rule builder AND/OR, sort, limit, live)
- [ ] Recently played + history (search, clear)
- [ ] Local views: songs/albums/artists/folders, sort/filter, duplicates, missing files
- [ ] Artist + album/playlist pages (Audius/Jamendo)
- [ ] Stats + Wrapped (story, export image)
- [ ] Import playlist from text/CSV (fuzzy match review)
- [ ] Backup/restore JSON

### §7 Home / browse / now playing / lyrics

- [ ] Home sections in order (continue, sped/slowed picks, trending, collections, friends, top sounds, made for you)
- [ ] Browse (genres/moods, trending by genre, Jamendo featured)
- [ ] Now playing panel + full screen
- [ ] Lyrics (synced, auto-scroll, tap-to-seek, plain fallback, none state, offset per track, speed-aware, full screen, karaoke)

### §8 Friends (Supabase)

- [ ] Migrations with RLS + indexes + share RPC + seed
- [ ] Auth (magic link + password, username, avatar ≤2 MB resized)
- [ ] Offline-first sync (queue, LWW)
- [ ] Friends (search, requests, list)
- [ ] Sharing (/s/<code>, short code, preview page)
- [ ] Presence activity + privacy toggles
- [ ] Listening parties (broadcast sync, drift correction, chat, reactions, pass control)

### §9 Themes

- [ ] Token engine + Tailwind mapping
- [ ] 12 built-in themes (AA verified)
- [ ] Theme editor (tokens, gradient builder, animated bg, blur, radius, fonts, density, adaptive accent)
- [ ] Layouts Classic / Compact / Focus
- [ ] Custom themes save/export/import/share, per-playlist theme
- [ ] Custom CSS (scoped) + reset escape hatch (Shift on load)

### §10 Settings / a11y / shortcuts / onboarding

- [ ] All settings sections
- [ ] Configurable shortcuts + ? cheat sheet
- [ ] Command palette
- [ ] Accessibility (focus, ARIA, slider value text, announcements, reduced motion, text scale)
- [ ] Onboarding (skippable)
- [ ] Empty/loading/error states everywhere
- [ ] Responsive phone layout (bottom nav, mini bar, swipe-up player, swipe gestures)

### §11 Platforms

- [ ] PWA (offline shell, install prompt, update toast, Background-safe mode)
- [ ] GitHub Pages deploy (base, 404 fallback, scope)
- [ ] Desktop: main window (title bar, state, tray-close), mini player, overlay, tray, global shortcuts, single instance, autostart, deep links, file associations
- [ ] Desktop: Discord RPC, Boost mode (wizard, capture, latency, meter), SMTC, WebView2 permission
- [ ] Desktop: icons, NSIS, release workflow, v0.1.0 tag
- [ ] Extension: tab capture boost (multi-tab, badge, cleanup), popup, My Sounds sync, share-code import, speed content script, zip

### §13 Tests

- [ ] Vitest unit suites listed in §13
- [x] Audio OfflineAudioContext preset tests (a–f)
- [ ] Playwright E2E flow + axe
- [ ] Rust cargo tests
- [ ] CI on every push
