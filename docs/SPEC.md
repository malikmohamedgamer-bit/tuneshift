# BUILD PROMPT — "Tuneshift" (personal music app with a live Sound Lab)

> Verbatim copy of the build spec given at the start of the build session (2026-11-21). Section numbers are referenced from PROGRESS.md, DECISIONS.md and LATER.md.

## 0. How you (Claude Code) must work — READ ALL OF THIS FIRST

You are building a complete, production-quality app from start to finish in this one session, fully autonomously. I am away from my computer and checking in from my phone. Treat this as an unattended run:

- Do not ask me questions. When something is ambiguous, pick the most sensible option, write it in DECISIONS.md (one line: decision + reason) and keep going.
- Never do anything that needs me to verify, approve, click, sign in, pay or be at a computer (see 0.2). If a feature needs that, still write all of its code and tests, make the app handle the missing piece gracefully, and add exact finish-up steps to LATER.md. Then move on.
- The only reason to stop early is a hard blocker you've retried and can't route around. In that case, write it in PROGRESS.md, keep going with everything that doesn't depend on it, and mention it in the final summary.

### 0.1 Working method (follow exactly)

1. Read this whole document before writing any code. Then create these files:
   - PLAN.md: file tree, phases, risks.
   - CLAUDE.md: commands, architecture rules, the "Never do" list from section 2, the phase checklist, and the rule "read PROGRESS.md first".
   - PROGRESS.md: a checklist of every phase and every numbered feature in this spec.
   - DECISIONS.md and LATER.md.
2. Keep PROGRESS.md current after every meaningful step (done / in progress / next). It lets work continue exactly where it stopped if your context gets compacted or a new session has to resume ("continue from PROGRESS.md"). Copy this spec into the repo as docs/SPEC.md at the start, so it is never lost.
3. Work phase by phase (section 12). At the end of each phase:
   - Run `pnpm typecheck && pnpm lint && pnpm test && pnpm e2e` (whatever exists so far).
   - Fix every failure before moving on. Never skip, comment out or weaken a test to make it pass, unless the test itself was wrong; if so, log the reason in DECISIONS.md.
   - `git commit -m "phase N: <summary>"` and push (0.3).
4. Verify, don't assume. Before using any npm/cargo package or external API, confirm it exists and check its current API (install it and read its types/README, or read its docs). If something named here doesn't exist, is unmaintained or doesn't work, use the closest maintained alternative and log it. Pin exact versions in package.json / Cargo.toml and commit lockfiles.
5. No placeholders. No `TODO: implement`, no stub functions, no fake data in production paths, no dead buttons. Every control works, or shows a clear disabled state with a one-line reason (e.g. "Add a Jamendo key in Settings to enable").
6. Quality bar: TypeScript strict everywhere, no `any` without a justifying comment, ESLint + Prettier clean, user-visible error toasts at every network/audio boundary, an error boundary around every route, and no console errors in normal use.
7. Finish with README.md, MANUAL_TESTS.md, an up-to-date LATER.md, and a final chat summary (section 14).

### 0.2 "No verification needed" rules — HARD rules for this session

You must not do any of the following in this session. Each has a planned "later" path instead:

- ❌ Anything needing admin rights / Windows UAC pop-ups, installing drivers, or rebooting. Do not download or install VB-Audio Virtual Cable. Build the in-app Boost setup wizard (section 11.2) and put the VB-Cable steps in LATER.md.
- ❌ Installing system-wide software that triggers prompts. Use only what's already installed, plus things that install without any prompt in user scope: npm/pnpm packages, rustup in user scope, cargo crates, Playwright browsers (`pnpm exec playwright install chromium`; on Linux add `--with-deps` only if it works without a password).
- ❌ Creating accounts, signing in to new services, entering passwords, solving CAPTCHAs, or anything requiring email/phone confirmation. Jamendo and Discord keys are deferred (LATER.md). Check whether Audius needs a key (section 3). If it does, defer that too.
- ❌ Spending money or choosing paid tiers anywhere.
- ❌ Anything that needs me to click in a browser (OAuth consent screens, "Load unpacked" for the extension, installing the desktop app). Produce the build artifacts and write the steps in LATER.md.
- ✅ Allowed: everything inside the repo; using tools/connectors already connected and authenticated in this session (0.3); GitHub Actions doing builds on GitHub's servers.

### 0.3 Use what I already have connected

Before Phase 0, inventory your environment and write the results at the top of PROGRESS.md: OS, Node/pnpm/Rust/Git versions, whether gh is logged in, which MCP tools/connectors are available (look specifically for GitHub and Supabase), and network access to npm/crates.io/docs sites.

- **GitHub (connected):** using whichever is already authenticated (gh CLI, a GitHub MCP tool, or an existing git remote/credentials), create a private repo named `tuneshift` under my account, or use the repo this session was started in if there is one, and push after every phase. If no GitHub access is authenticated, commit locally and add "push to GitHub" steps to LATER.md. Never ask me to log in.
- **Supabase (connected):** if a Supabase MCP tool/connector is available:
  1. List my organizations and projects. If a project named tuneshift exists, use it. Otherwise create one on the free plan in the region closest to Sydney (ap-southeast-2) — only if the free plan allows another project. Never pick a paid option; if creating would cost money or needs confirmation, skip it and use LATER.md.
  2. Apply all migrations from `supabase/migrations/` through the tool, then run the tool's security/performance advisors and fix every RLS warning.
  3. Get the project URL and the anon/publishable key (never the service-role key) and write them to `.env.local` (gitignored). For CI, use GitHub Actions secrets if you can set them with authenticated gh; otherwise list them in LATER.md.
  4. If the tool can update auth settings, set the Site URL and redirect URLs (section 8). Otherwise put the exact values in LATER.md.
  If no Supabase tool is available, write everything (migrations, seed, client code) and put the click-by-click setup in LATER.md. The app must work fully local-first without Supabase: friends features show a "Sign-in not configured yet" state.
- **Hosting without new accounts:** deploy the web app to GitHub Pages through a GitHub Actions workflow (`.github/workflows/pages.yml`), and enable Pages via the authenticated `gh api` (build_type=workflow) if possible. Set Vite base to `/tuneshift/`. Add an SPA fallback (copy index.html to 404.html in the build) so deep links work. Vercel/Netlify configs are optional extras in LATER.md.
- **Windows desktop build without my PC:** add `.github/workflows/desktop-release.yml` that builds the Tauri app on a windows-latest runner with `tauri-apps/tauri-action`, when a tag `v*` is pushed or the workflow is run manually, and uploads the NSIS installer to a GitHub Release (draft). After Phase 7 passes, push tag `v0.1.0` if pushing is authenticated, and check the run status with `gh run watch`/`gh run view`. Fix failures until it's green, up to 5 attempts, then log the remaining issue in PROGRESS.md and LATER.md.
- If this session is itself on Windows with Rust + MSVC already installed, also run `pnpm desktop:build` locally. If it isn't, don't install them; rely on CI. Keep Windows-only Rust code behind `#[cfg(windows)]` so `cargo check` passes on any OS, and add a CI job that runs `cargo check`/`cargo clippy` for the desktop crate on windows-latest.
- **Extension:** build it and zip `apps/extension/dist` as `tuneshift-boost-extension.zip`, attached to the same GitHub Release. Put the "Load unpacked" steps in LATER.md.

### 0.3b If this session is running on my Windows PC (Claude Code Remote Control)

I'm driving this session from my phone through Remote Control. I can approve tool permissions from my phone, but I can't see or click anything on the desktop. So:

- Work in `%USERPROFILE%\Projects\tuneshift` (create it if missing) unless the session already started inside a project folder.
- Use PowerShell-compatible commands, or the Git Bash that Claude Code uses. Mind Windows paths, CRLF (add a `.gitattributes` with `* text=auto eol=lf`), and long paths.
- Missing Node.js/pnpm: don't use installers that need admin. Download the official Node LTS Windows x64 .zip from nodejs.org (verify its SHA-256 against the published SHASUMS256.txt). Extract it to `%LOCALAPPDATA%\Programs\node`, add that folder to the user PATH and to the current shell, then run `corepack enable` (use `--install-directory` pointing to that folder if needed) and `corepack prepare pnpm@latest --activate`.
- Rust/MSVC: if cargo and the MSVC linker are already installed, build the desktop app locally. If not, don't install the Visual Studio Build Tools (that needs admin). Let the GitHub Windows runner build the installer.
- Never open GUI windows that need a click (installers, dialogs, browsers for OAuth). Dev servers and Playwright run headless.
- Don't leave long-running processes going when you finish. Stop dev servers.
- For GitHub, use what's already authenticated: Git Credential Manager, gh, or a GitHub MCP connector. For Supabase, use a Supabase MCP connector if this session has one. Otherwise follow the fallbacks in 0.3.

### 0.4 LATER.md format

A checklist, grouped and ordered, each item with exact phone-friendly steps and where to paste values (Settings screen or env var). It must include at least: Jamendo client_id; Audius key (if needed); Supabase setup/auth URLs (if not done); Discord client ID (optional); installing VB-Cable + routing Spotify to "CABLE Input" for Boost mode; installing the desktop app from the GitHub Release; loading the extension; anything from section 0.2 you skipped; every known limitation that needs my action.

## 1. What the app is

Tuneshift is a personal music app for me and a few friends (non-commercial). It's inspired by a TikTok app called "Mixr". Copy its experience, not its name or code.

- A dark, gradient, rounded UI with a home screen ("Good afternoon, <name>"), collections as gradient cards, recently played, a now-playing panel and a bottom transport bar.
- A Sound Lab where everything applies live to the current song: speed, pitch, bass, reverb, 8D, a 10-band EQ, presets and saved custom sounds.
- A floating mini player and a pill-shaped now-playing overlay (song · artist · active preset badge like "Sped Up + Bass") that float over games on Windows.

It ships as:
1. Web app / installable PWA (desktop browsers + phones, including iPhone via Safari "Add to Home Screen").
2. Windows desktop app (Tauri 2) with an always-on-top mini player, game overlay, tray, global shortcuts and Boost mode for other apps.
3. Chrome/Edge extension ("Tuneshift Boost") that applies the Sound Lab (minus true speed) to any browser tab, e.g. Spotify Web or YouTube Music.

Not in scope: native iOS/Android apps, and Spotify/Apple Music/YouTube API integrations.

## 2. Legal and technical rules — NEVER do these

- Never download, rip, proxy, cache or record audio from YouTube, Spotify, Apple Music, TikTok or SoundCloud. No yt-dlp, Invidious, Piped or similar. No "workarounds".
- Never record or export audio captured in Boost mode. Boost mode processes live output only.
- Never put secrets in client code. Only public keys (Supabase anon key, Audius API key, Jamendo client_id) go in VITE_ env vars. Never use the Supabase service-role key in any app.
- Export/render of edited audio is allowed only for the user's own local files.
- Show source attribution: artist name + link to the track page on Audius/Jamendo, plus Jamendo's license badge.
- Keep the app non-commercial. No payments or Premium tier.

## 3. Music sources (adapter architecture)

Every source implements one interface, so a source can be disabled without breaking anything:

```ts
type SourceId = 'local' | 'audius' | 'jamendo';

interface SourceCapabilities {
  fullEffects: boolean;   // Web Audio graph works (CORS ok / local blob)
  tapeSpeed: boolean;     // playbackRate + preservesPitch=false works (always true for <audio>)
  export: boolean;        // only 'local'
  shareable: boolean;     // can a friend play it? (false for 'local')
}

interface SourceAdapter {
  id: SourceId;
  displayName: string;
  capabilities: SourceCapabilities;
  search(q: string, opts: { type: 'track'|'artist'|'album'|'playlist'; limit: number; offset: number }): Promise<SearchPage>;
  getTrack(id: string): Promise<Track>;
  resolveStreamUrl(track: Track): Promise<string>;   // fresh URL each play (URLs may expire)
  trending?(opts: { genre?: string; time?: 'week'|'month'|'allTime' }): Promise<Track[]>;
  getArtist?(id: string): Promise<Artist>;
  getAlbumOrPlaylist?(id: string): Promise<Collection>;
}
```

1. **Local files (`local`)** — full Sound Lab + export.
   - Web: drag-and-drop, a file picker, and a folder picker (File System Access API where supported, `<input webkitdirectory>` fallback). Store FileSystemHandles in IndexedDB so files can be re-opened after reload (ask permission again when needed). For browsers without handles, copy files into OPFS (with a storage-usage display and a delete option).
   - Desktop (Tauri): pick watched folders, scan recursively for mp3/m4a/aac/flac/wav/ogg/opus, rescan on demand, play via Tauri's asset protocol (convertFileSrc), with CORS configured so Web Audio works.
   - Built-in demo tracks: so the app is fully usable with zero keys and zero files, write a script (`scripts/make-demo-tracks.ts`) that synthesises 3 short original loops (~45 s each: a phonk-style beat, a lo-fi chord loop, an EDM pluck) with OfflineAudioContext or a Node synth. Encode them to small .m4a/.mp3 files, commit them under `apps/web/public/demo/`, and show them as a "Demo" collection. They're original, so there are no licensing issues. Use them in E2E tests too.
   - Read tags and cover art with music-metadata (browser build, parseBlob). Fall back to the filename for title/artist.
2. **Audius (`audius`)** — the main catalog (tons of remixes, sped-up/slowed edits, phonk, EDM, lo-fi). Use the official Audius API (check docs.audius.org for the current API-key requirements and SDK). Use `VITE_AUDIUS_API_KEY` and an app name of "Tuneshift". Respect artists who disabled API access (the API simply won't return them).
3. **Jamendo (`jamendo`)** — Creative Commons catalog. Use API v3.0 with `VITE_JAMENDO_CLIENT_ID`. Non-commercial use only. No key exists yet, so Jamendo ships disabled with an "Add key" card until I add one (LATER.md).

API keys are optional at build time. The app must build, run and pass every test with no keys at all (tests use MSW mocks). Keys can come from env vars or from Settings → Sources → API keys, where I can paste them at runtime. Keys are stored locally, validated with a test request, and take effect without a rebuild. For Audius: read docs.audius.org first. If read/stream endpoints work key-free with an app_name, Audius works out of the box (best case, so test this with a real request if the network allows). If a key is required, Audius shows the "Add key" card and the steps go in LATER.md.

4. **Lyrics — LRCLIB** (https://lrclib.net/api/get and /api/search, no key). Send a User-Agent/Lrclib-Client header with the app name and version. Handle 404 (no lyrics) and 429 (respect Retry-After). Cache results in IndexedDB.

**CORS-aware playback (critical):**
- Always set `audio.crossOrigin = 'anonymous'` before setting `src`.
- On the first play from each remote host, run a CORS probe: route the element into Web Audio and check an AnalyserNode for non-silent output within ~1.5 s, or do an equivalent fetch HEAD/range check for Access-Control-Allow-Origin. Cache the result per host.
- If the host fails CORS, fall back to Limited mode for that source: play the `<audio>` element directly to the speakers. Tape-style presets (Sped Up, Nightcore, Slowed) still work through playbackRate + preservesPitch=false. Grey out EQ/bass/reverb/8D with the tooltip "This source doesn't allow audio processing".
- Store the capability result on the adapter at runtime. Show a small badge on tracks: "Full Sound Lab" or "Speed only".

**Search:** one search box queries every enabled source in parallel. Results are grouped (Top result, Songs, Artists, Playlists/Albums), each with a source badge. Add filters by type and source, and keep recent searches.

**Remix Finder:** on any track, a "Find versions" button searches Audius for "<title>" + sped up | slowed | nightcore | remix | 8d | phonk | reverb | bass boosted. Show the results grouped by version type, de-duplicated.

## 4. Audio engine (packages/audio) — the heart of the app

Use one AudioContext per app instance. Create and resume it on the first user gesture, and show a "Tap to start audio" state if it's suspended.

### 4.1 Signal chain

```
DeckA <audio> ─┐                                     (crossfade gains)
DeckB <audio> ─┴─► MediaElementSource ×2 ─► deckGain A/B ─► mixBus
mixBus ─► [pitch-shift worklet (bypassed when pitch=0 or tape mode)]
       ─► preamp (Gain)
       ─► EQ: 10 × BiquadFilter (32 lowshelf, 64…8k peaking Q≈1.0, 16k highshelf)
       ─► bassBoost (lowshelf ~90 Hz, separate from EQ)
       ─► compressor (DynamicsCompressor, bypassable)
       ─► reverb send: dry Gain + [Convolver ─► wet Gain] summed
       ─► stereo widener (mid/side via ChannelSplitter/Merger + gains)
       ─► 8D stage (PannerNode panningModel='HRTF', position driven by LFO oscillators → positionX/positionZ AudioParams)
       ─► lofi stage (lowpass + subtle wow/flutter + crackle noise, bypassable)
       ─► vocal-reduce stage (mid/side cancel, bypassable, "Karaoke")
       ─► masterGain (volume, with ReplayGain/normalization offset)
       ─► limiter (DynamicsCompressor: threshold −1 dB, ratio 20, attack 0.001, release 0.1)
       ─► Analyser (visualizer) ─► destination
```

- Bypass stages by rewiring or by setting them to neutral values. Changing graph topology while playing must not click: crossfade the change over ~30 ms.
- Every parameter change uses setTargetAtTime or linear ramps (time constant ~0.02–0.05 s). Never jump values. There must be no zipper noise or clicks.
- Auto headroom: when the summed EQ + bass boost exceeds +6 dB, lower the preamp automatically so the limiter rarely works hard. Show a small "headroom" meter.

### 4.2 Speed and pitch

- Tape mode (default; how Mixr-style presets sound): `el.playbackRate = rate; el.preservesPitch = false;` (also set the webkitPreservesPitch / mozPreservesPitch vendor variants). Speed and pitch move together. Range 0.5–2.0×.
- Independent mode (a toggle: "Keep pitch" / separate pitch slider): tempo via playbackRate with preservesPitch = true, and pitch (−12…+12 semitones, 0.1 steps) via an AudioWorklet pitch shifter. First choice: signalsmith-stretch (MIT, WASM, has a Web Audio wrapper; verify the npm package). Fallback: SoundTouch's AudioWorklet build. Log the choice in DECISIONS.md.
- The progress bar, time display, A–B loop and lyrics must account for playbackRate (show song time, and optionally "real time left" in a tooltip).

### 4.3 Reverb

Generate impulse responses at runtime from exponentially decaying stereo noise, so no IR files need licensing. Room types: Room (0.8 s), Hall (2.5 s), Plate (1.6 s, brighter), Church (4.5 s), Stadium (6 s), Dreamy (3.5 s, low-passed). Cache the generated buffers. Controls: amount (wet 0–100%), room type, pre-delay (0–100 ms via DelayNode), tone (low-pass on the wet path).

### 4.4 8D

An HRTF panner orbiting the listener. Controls: speed (0.02–0.5 Hz, default 0.12), width/radius, and an optional height wobble. Drive it with OscillatorNodes connected to positionX/positionZ (90° phase offset), not with requestAnimationFrame, so it keeps running smoothly when the tab is in the background.

### 4.5 Crossfade, gapless, normalization

- Two decks (A/B). Preload the next track ~15 s before the end. Crossfade 0–12 s (setting; 0 = gapless), using equal-power curves.
- Gapless: start the next deck precisely at the end when crossfade is 0.
- Loudness normalization (setting: off / track / album, target −14 LUFS): compute integrated loudness for local files in a Web Worker on first play (or use ReplayGain tags if present) and cache it. Remote tracks use a fast RMS estimate from the first seconds, with a smoothed adjustment.

### 4.6 Presets (exact values)

A SoundSettings object fully describes a sound:

```ts
interface SoundSettings {
  version: 1;
  speed: number;            // 0.5–2.0
  pitchMode: 'tape' | 'independent';
  pitchSemitones: number;   // independent mode only
  preampDb: number;         // −12..+12
  eqEnabled: boolean;
  eqMode: 'graphic' | 'parametric';
  eqGains: number[];        // 10 values, dB, −12..+12, bands [32,64,125,250,500,1k,2k,4k,8k,16k]
  parametric?: { freq: number; q: number; gainDb: number; type: BiquadFilterType }[]; // up to 10
  bassBoostDb: number;      // 0..+15
  compressor: { enabled: boolean; threshold: number; ratio: number; attack: number; release: number; knee: number };
  reverb: { amount: number; room: 'room'|'hall'|'plate'|'church'|'stadium'|'dreamy'; preDelayMs: number; tone: number };
  eightD: { enabled: boolean; speedHz: number; radius: number; heightWobble: boolean };
  widener: number;          // 0 = off, 1 = normal, up to 2
  lofi: { enabled: boolean; amount: number };
  vocalReduce: { enabled: boolean; amount: number };
}
```

Built-in Sound presets (Sound Lab cards with subtitles, exactly like the reference):

| Preset | Subtitle | Settings (everything else neutral) |
|---|---|---|
| Normal | Original sound | speed 1, all flat |
| Bass Boosted | Heavy low end | bassBoostDb 9, eqGains Bass Boost curve |
| Sped Up | 1.25× + higher pitch | speed 1.25, tape |
| Sped Up + Bass | TikTok edit sound | speed 1.25, tape, bassBoostDb 8 |
| Nightcore | 1.4× bright & fast | speed 1.4, tape, eq 8k +2, 16k +3, bassBoostDb 2 |
| Slowed + Reverb | 0.8× dreamy | speed 0.8, tape, reverb {amount 0.38, room 'dreamy', preDelayMs 20, tone 0.6}, eq 8k −1, 16k −2 |
| 8D Audio | Spins around you | eightD {enabled, speedHz 0.12, radius 1}, reverb {amount 0.15, room 'room'} |
| Club | Bass + room echo | bassBoostDb 7, reverb {amount 0.22, room 'hall'}, compressor on (threshold −18, ratio 4), widener 1.3 |

Also add: Phonk Drift (speed 1.1, bassBoostDb 10, EQ Phonk, widener 1.2), Lo-fi Chill (speed 0.9, lofi 0.6, reverb 0.2 room), Vinyl (lofi 0.4), Concert Hall (reverb 0.35 hall), Car Speakers (EQ Car, bass 6), Karaoke (vocalReduce 0.9).

Built-in EQ presets (10-band dB values, 32 Hz → 16 kHz):
- Flat [0,0,0,0,0,0,0,0,0,0]
- Bass Boost [6,5,4,2,0,0,0,0,0,0]
- Phonk [7,6,3,0,-2,-1,1,3,4,3]
- Car [5,4,2,0,-1,0,1,2,3,2]
- Vocal [-2,-2,-1,1,3,4,4,2,0,-1]
- Treble [0,0,0,0,0,1,3,5,6,6]
- Loudness [5,4,2,0,-1,-1,0,2,4,5]
- Headphones [3,2,1,0,-1,0,1,2,3,2]
- plus Rock, Pop, Hip-Hop, EDM, Acoustic, Podcast/Spoken, Late Night (quiet, compressed) — pick sensible curves.

**My Sounds:** "Adjust the sliders below, then save your sound here" — a name field + Save. Saved sounds can be renamed, duplicated, deleted, reordered, favourited, exported/imported as JSON, and shared as a short code/link (section 8). Sounds can be assigned: per song ("always play this song with X"), per playlist, as the global default. Priority: song > playlist > global. Show which one is active, with a "reset to default" option.

**A/B compare:** hold a button (or press B) to hear the original sound while held.

### 4.7 Visualizer

Using the Analyser: bars (spectrum), waveform, circular/radial (pulsing around the cover art), and an "ambient glow" mode where the background gradient reacts to bass. Run it at 60 fps when visible, pause it when hidden, and respect prefers-reduced-motion.

### 4.8 Export (local files only)

"Export with effects" renders a local file through an OfflineAudioContext copy of the graph:
- Tape speed uses AudioBufferSourceNode.playbackRate.
- 8D uses a scheduled automation curve instead of an oscillator if needed.
- Output is WAV (16/24-bit) and MP3 (via a maintained WASM/JS LAME encoder; verify it), with a progress bar running in a Worker.
- The export button never appears for non-local tracks.

## 5. Player features

- Play/pause, previous (restart if > 3 s in), next, seek bar with hover time, volume + mute, keyboard shortcuts (section 10).
- Queue panel: Now playing, Next up (manual adds), then autoplay. Supports drag to reorder, remove, clear, "Play next", "Add to queue", and save queue as playlist. The queue persists across reloads.
- Shuffle (true random, or smart shuffle that avoids the same artist back-to-back) and repeat (off / all / one).
- Autoplay radio: when the queue ends, continue with similar tracks from Audius (same genre/mood/artist and trending), toggleable.
- Sleep timer: 5/10/15/30/45/60/90 min, end of track, end of queue, or custom. Fades out over the last 10 s.
- A–B loop on the seek bar.
- Resume the last track and position on launch (paused).
- Media Session API: title, artist, album, artwork (multiple sizes), and play/pause/next/prev/seekto/seekforward/seekbackward handlers, plus position state, so it works with lock screens, keyboard media keys and Windows SMTC.
- When a stream fails, retry once with a fresh URL, then auto-skip with a toast: "Couldn't play X — skipped".

## 6. Library

- Liked songs (heart anywhere), Playlists (create, rename, description, custom cover (upload) or auto-mosaic, reorder by drag, duplicate, delete with undo), Playlist folders.
- Smart playlists: rule builder (source, artist, genre, liked, play count, last played, date added, duration, has saved sound) with AND/OR, sort and limit. Updates live.
- Recently played, full listening history (searchable, clearable).
- Local library views: Songs, Albums, Artists, Folders, with sort/filter everywhere, duplicate detection and "missing file" handling.
- Artist and album/playlist pages for Audius/Jamendo (header with art, play/shuffle buttons, track list, "Find versions").
- Stats + "Tuneshift Wrapped": top songs/artists/genres/presets by week/month/year/all-time, minutes listened, a most-used-sound-preset badge and a listening-clock heatmap. Wrapped is a swipeable story-style recap that can be exported as an image.
- Import playlist from text/CSV: paste "Artist – Title" lines or upload a CSV (e.g. an Exportify export). The app fuzzy-matches against Audius/Jamendo (title + artist + duration tolerance) and shows the matched / unmatched results for review.
- Backup/restore the whole library + settings + sounds + themes to a JSON file.

## 7. Home, browse, now playing, lyrics

- Home ("Good morning/afternoon/evening, <name>"), with sections in this order: Continue listening (recent tiles); "Sped up & slowed picks"; Trending on Audius (week); Collections (gradient cards: Phonk, EDM Anthems, Hip-Hop, Lo-fi & Chill, Sped Up, Slowed + Reverb, Nightcore, Remixes, Chill R&B, Gaming Mix, Workout, Late Night, built from Audius genre/mood/search queries and Jamendo tags, each with a track count); Friends are listening (if signed in); "Your top sounds" (one-tap presets); Made for you (daily mixes from history: three mixes by top genres).
- Browse: genres and moods grid, Audius trending by genre, Jamendo featured.
- Now playing: right panel on desktop widths; a full-screen view on mobile and on demand. Big artwork, a blurred art background, title/artist (clickable), like button, the current preset badge, quick preset chips, "Open Sound Lab", the queue and lyrics tabs, and a visualizer toggle.
- Lyrics: synced (LRC) with smooth auto-scroll, the current line highlighted, and tap-line-to-seek. There's a plain-text fallback and a "no lyrics found" state. Add an offset adjust (±5 s, saved per track). Timing must scale with playback speed. Include a full-screen lyrics mode and a karaoke mode (lyrics + vocal reduce).

## 8. Friends features (Supabase) — included from the start

The app must work fully without signing in (local-first). Signing in adds sync and social features.

- Auth: Supabase email magic link + email/password, unique username, display name and avatar (upload to Supabase Storage, ≤ 2 MB, resized client-side).
- Sync: likes, playlists (non-local tracks only; local tracks sync as metadata with a "local only" marker), My Sounds, themes, settings and history. It works offline-first: IndexedDB (Dexie) is the source of truth, with a sync queue that pushes and pulls when online. Conflicts resolve with last-write-wins per record using updated_at.
- Friends: search by username, send/accept/decline/remove requests, and a friends list.
- Sharing: share a Sound, Playlist or Theme with a link `/s/<code>` or a short code (also importable via paste). Public link pages show a preview with an "Add to my library" button. Shared playlists only include shareable tracks.
- Friend activity: a "Friends are listening" sidebar/section using Supabase Realtime Presence, showing the current track + preset badge, with "Listen along" and "Copy their sound". There's a privacy toggle (share activity on/off, plus private-session mode).
- Listening parties: the host creates a room with a code. Guests join, and playback syncs via a Realtime Broadcast channel: the host sends {trackId, source, positionMs, playing, speed, serverTime}, and guests correct drift > 300 ms with tiny rate nudges or seeks. Party chat and emoji reactions are included, and the host can pass control. Only shareable sources (Audius/Jamendo) can be queued in a party.
- Database: write SQL migrations in `supabase/migrations/` for profiles, friendships, playlists, playlist_tracks, sounds, themes, likes, history, shares and party_rooms. Row Level Security on every table: users can read and write only their own rows. Friends can read each other's profiles and activity. Share-link rows are readable by anyone with the code via an RPC that returns only that item. Add indexes. Include `supabase/seed.sql` for local dev.
- Supabase auth URLs: Site URL = the GitHub Pages URL (`https://<my-github-username>.github.io/tuneshift/`). Redirect URLs = that URL, `http://localhost:5173/**`, `http://127.0.0.1:5173/**`, and the Tauri deep link `tuneshift://auth`. Set them via the Supabase tool if possible (section 0.3), otherwise list them in LATER.md. Handle the auth callback in all three environments (web, PWA, desktop).

## 9. Themes — fully customizable

- The theme engine is built on CSS custom properties (design tokens): `--bg, --bg-elevated, --surface, --surface-hover, --border, --text, --text-muted, --accent, --accent-2, --accent-contrast, --gradient-hero, --radius-sm/md/lg/xl, --blur, --font-sans, --font-display, --shadow, --density`. Tailwind reads these variables.
- Built-in themes (12): Midnight Bloom (default: near-black #0d0b14, purple #8b5cf6 → pink #ec4899 gradients, like the reference), Neon Night, Sunset, Ocean, Forest, Cherry Blossom (soft pink + white petals accent), AMOLED Black, Mono, Y2K Chrome, Vaporwave, Light, and High Contrast (accessibility).
- Theme editor: colour pickers for every token with a live preview; gradient builder (2–4 stops, angle); animated gradient background toggle; glass/blur amount; corner radius; font choice (5 bundled open-licence fonts + system); density (compact/comfortable); "Adaptive accent from album art" toggle (extract the dominant/vibrant colour from the current cover, ensure WCAG AA contrast, and animate the transition).
- Layouts: Classic (sidebar + main + now-playing panel), Compact, and Focus (art + controls only).
- Save multiple custom themes, plus export/import/share codes, and apply per-playlist themes (optional).
- Custom CSS box (advanced, sandboxed to the app root), with a "reset to safe theme" escape hatch (also triggered by holding Shift while the app loads).

## 10. Settings, accessibility, shortcuts, onboarding

- Settings sections: Account; Playback (crossfade, gapless, normalization, autoplay, resume); Audio (default sound, output device picker via setSinkId where supported, Limited-mode info); Sources (enable/disable each, local folders); Lyrics; Appearance (themes); Desktop (mini player, overlay, tray, startup, shortcuts, Discord); Boost mode; Privacy (activity sharing, clear history); Data (backup/restore, storage usage, clear cache); About.
- Keyboard shortcuts (configurable, with a ? cheat-sheet overlay): Space play/pause, ←/→ seek 5 s, Shift+←/→ prev/next, ↑/↓ volume, M mute, L like, S shuffle, R repeat, / or Ctrl+K search, E open Sound Lab, B hold for A/B, 1–8 apply Sound preset 1–8, F full-screen now playing, Y lyrics.
- Command palette (Ctrl+K): search songs plus actions ("Apply Nightcore", "Toggle 8D", "Sleep timer 30 min").
- Accessibility: full keyboard navigation, visible focus rings, ARIA labels on every control, sliders operable by keyboard with value text ("Bass boost 8 decibels"), screen-reader announcements for track changes, prefers-reduced-motion respected, scalable text (90–130%), and the High Contrast theme.
- Onboarding (first launch, skippable): name → pick a theme → choose sources / add local music → quick Sound Lab demo → optional sign-in. It also explains "Full Sound Lab" vs "Speed only" badges and Boost mode in plain words.
- Empty, loading and error states for every screen (skeleton loaders, friendly empty states with an action button).
- Responsive: phone layout with bottom nav (Home, Search, Library, Sound Lab, Friends), a mini player bar above the nav, a swipe-up full player, and swipe gestures (left/right on the art to skip, down to close).

## 11. Platforms

### 11.1 Web / PWA (apps/web)

- React + TypeScript + Vite, React Router, Zustand (state), TanStack Query (remote data), Dexie (IndexedDB), Tailwind CSS (token-driven), Radix UI primitives or shadcn/ui for accessible components, Framer Motion for animation, and vite-plugin-pwa (offline shell, install prompt, update toast).
- iPhone background behaviour: iOS Safari suspends Web Audio when the screen locks or the app is backgrounded. Implement Background-safe mode (auto-enabled on iOS, toggle elsewhere): when the page is hidden, smoothly hand playback over to the plain `<audio>` element output (tape speed/pitch presets keep working through playbackRate) and resume the full graph when visible again. Explain this in a small info tooltip.
- Deploy target: GitHub Pages via Actions (section 0.3), with `base: '/tuneshift/'`, a 404.html SPA fallback, and a PWA scope/start_url that matches the base path. Test the production build locally with `vite preview --base /tuneshift/` in Playwright.

### 11.2 Windows desktop (apps/desktop, Tauri 2)

- Wraps the same web build. Audio plays only in the main window's webview. Other windows are controllers synced via Tauri events (state broadcast at ~4 Hz plus on change; commands sent back).
- Main window: custom title bar (drag region, min/max/close), remembers size and position (tauri-plugin-window-state). Close → minimise to tray (setting). Playback must continue when the window is hidden: hide it, never destroy it.
- Mini player window: frameless, rounded, always on top, ~340×110, draggable, resizable between compact and expanded (shows queue), with cover, title/artist, progress, prev/play/next, like, and a preset chip menu. Opacity setting, "snap to corner", and a remembered position.
- Game overlay (now-playing pill): transparent, frameless, always on top, skipTaskbar, non-focusable (must never steal focus from a game), click-through by default, top-centre (position configurable). It shows art · title · artist · Tuneshift + the active preset badge, slides in on track change, and auto-hides after N seconds (setting: always / on change / off). Create it once at startup and toggle visibility through content/opacity, not by repeatedly calling show() (which can steal focus). Document that exclusive-fullscreen games may cover it, and recommend borderless-windowed mode.
- System tray: play/pause, next, prev, current song, preset submenu, show/hide mini player, show/hide overlay, Boost mode toggle, quit.
- Global shortcuts (tauri-plugin-global-shortcut, configurable): media keys + defaults Ctrl+Alt+Space (play/pause), Ctrl+Alt+→/← (next/prev), Ctrl+Alt+B (cycle presets), Ctrl+Alt+M (toggle mini player), Ctrl+Alt+O (toggle overlay).
- tauri-plugin-single-instance, tauri-plugin-autostart (launch on startup, start minimised), tauri-plugin-deep-link (`tuneshift://` for auth + share links), file associations for audio files ("Open with Tuneshift").
- Discord Rich Presence (optional, off by default; the client ID is deferred to LATER.md and can be pasted in Settings): needs DISCORD_CLIENT_ID. Shows the song, artist, preset and elapsed time. Use a maintained Rust crate and verify it.
- **Boost mode (desktop) — effects on other apps' audio:**
  - Setup wizard: (1) install the free VB-Audio Virtual Cable (download button to the official vb-audio.com page; never bundle it in the installer; detect whether it's already installed); (2) in Windows Settings → System → Sound → Volume mixer / "App volume and device preferences", set Spotify's (or any app's) output to CABLE Input; (3) in Tuneshift, pick CABLE Output as the Boost input device.
  - Implementation: `getUserMedia({ audio: { deviceId, echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:2, sampleRate:48000 } })` in the main webview → MediaStreamAudioSourceNode → the same Sound Lab graph (minus speed/tape; pitch via the worklet is allowed) → output device. Handle WebView2 media permission in Tauri so it's granted for this origin without a prompt each launch (verify the Tauri 2 / wry approach).
  - Low-latency settings (latencyHint: 'interactive'), a latency readout, an input level meter, and a big on/off switch. Boost mode and normal playback are mutually exclusive; pause Tuneshift playback when Boost turns on.
  - Now-playing from other apps: read Windows SMTC (GlobalSystemMediaTransportControlsSessionManager via the windows crate) to show the other app's title/artist/art in the Boost screen, mini player and overlay, with play/pause/next/prev buttons that send SMTC commands. If SMTC isn't available, hide this gracefully.
  - Speed controls are disabled in Boost mode, with the tooltip "Speed can't be changed on live audio from other apps".
- Build: `pnpm desktop:dev`, `pnpm desktop:build` → NSIS installer (unsigned is fine; mention the SmartScreen "More info → Run anyway" step in LATER.md). The Windows installer is built by `.github/workflows/desktop-release.yml` on GitHub's Windows runner (section 0.3), so it doesn't need my PC. App icon: generate an SVG logo (a stylised waveform forming a "T", with the purple→pink gradient) and create all icon sizes with `tauri icon`.

### 11.3 Browser extension (apps/extension, "Tuneshift Boost", Chrome/Edge MV3)

- Shares packages/audio, so the presets/EQ/effects are identical.
- Capture: the toolbar popup "Boost this tab" button (or a keyboard command) → service worker calls `chrome.tabCapture.getMediaStreamId({ targetTabId })` → creates an offscreen document (reason USER_MEDIA) → `getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId } } })` → Sound Lab graph → destination. The captured tab is muted by Chrome, so output must always be routed to the speakers. Supports multiple boosted tabs, a badge on the icon for boosted tabs, and stops cleanly when the tab closes or navigates.
- Popup UI (compact, uses the same themes): on/off, preset cards, 10-band EQ, bass, reverb, 8D, widener, live pitch (worklet), My Sounds (stored in chrome.storage.sync), and import of a sound via share code from the main app.
- Page speed control (content script, optional toggle): on pages with `<audio>/<video>` elements (e.g. YouTube, YouTube Music, SoundCloud), set playbackRate and the preservesPitch toggle for Sped Up / Slowed / Nightcore tape effects — the same thing popular "video speed controller" extensions do. It must not modify page content, hide ads or download anything. Mark Spotify Web as "speed not supported" (its player resets it).
- Build with Vite + a CRX/MV3 plugin (verify one that supports MV3 offscreen documents) or a manual multi-entry Vite config. `pnpm ext:build` outputs `apps/extension/dist`, and the README explains "Load unpacked" in Chrome/Edge.

## 12. Repo layout and phases

```
tuneshift/
  CLAUDE.md  PLAN.md  PROGRESS.md  DECISIONS.md  LATER.md  README.md  MANUAL_TESTS.md  .env.example  docs/SPEC.md
  package.json (pnpm workspaces)  pnpm-workspace.yaml  tsconfig.base.json  eslint + prettier configs
  packages/
    core/      # types (Track, Artist, Collection, Playlist, SoundSettings, Theme, …), queue engine, shuffle, smart playlist rules, matching, LRC parser, sync engine, zod schemas
    audio/     # graph, presets, worklets, IR generator, visualizer, export, CORS probe
    sources/   # local, audius, jamendo, lrclib adapters + MSW mocks
    ui/        # shared React components + theme engine (used by web, desktop, extension)
  apps/
    web/  desktop/ (src-tauri)  extension/
  supabase/ migrations/  seed.sql
  e2e/       # Playwright
  .github/workflows/ ci.yml  pages.yml  desktop-release.yml
```

Phases (commit after each; all checks green before continuing):

- **P0 Setup:** monorepo, tooling, CLAUDE.md, CI (typecheck, lint, unit, e2e on web), env handling with zod validation and a friendly "missing key" screen.
- **P1 Core + audio engine + local files:** the full signal chain, all presets, My Sounds, A/B, visualizer, export. Acceptance: play a local file; every preset audibly applies (OfflineAudioContext tests below); no clicks when moving sliders.
- **P2 App shell + themes:** layouts, all screens with empty states, the theme engine + editor + 12 themes, responsive mobile layout, onboarding.
- **P3 Sources:** Audius + Jamendo adapters, unified search, Remix Finder, CORS probe + Limited mode, artist/album pages, home + browse collections, lyrics.
- **P4 Player + library:** queue, crossfade/gapless, normalization, sleep timer, A–B loop, likes, playlists, folders, smart playlists, history, stats + Wrapped, CSV import, backup/restore, Media Session, shortcuts + command palette.
- **P5 Supabase:** migrations with RLS, auth, sync engine, friends, sharing links, presence, listening parties.
- **P6 PWA:** offline shell, install prompt, Background-safe mode.
- **P7 Desktop (Tauri):** windows, mini player, overlay, tray, shortcuts, deep links, single instance, autostart, Boost mode + SMTC, Discord RPC, installer + release workflow.
- **P8 Extension:** tab capture Boost, popup, speed content script.
- **P9 Polish & audit:** accessibility pass (axe in Playwright), performance (Lighthouse ≥ 90 on PWA performance/accessibility/best practices; first load < 300 KB gzipped JS for the shell, with code-split routes), cross-check every item in this spec as a checklist in MANUAL_TESTS.md, final README.

## 13. Testing requirements

- Vitest unit tests: queue engine (shuffle, smart shuffle, repeat modes, play next, reorder), smart playlist rule evaluation, fuzzy matching, LRC parsing + speed-scaled timing, preset schema validation/migration, sync conflict resolution, share-code encode/decode, theme contrast checks (every built-in theme passes WCAG AA for text/background), and adapter response parsing (with MSW fixtures).
- Audio tests (run in a real browser via Playwright or Vitest browser mode): render 2 s of a test tone/pink noise through OfflineAudioContext for every built-in preset. Assert: (a) the output isn't silent; (b) the peak never exceeds −0.5 dBFS (limiter works); (c) Bass Boosted raises energy < 150 Hz vs Normal; (d) Nightcore output duration ≈ input/1.4 with a raised pitch (FFT peak shift); (e) 8D produces time-varying L/R balance; (f) the reverb tail extends past the input end.
- Playwright E2E (web): onboarding → load a bundled royalty-free test audio file (generate one with a script, a sine-melody WAV committed to e2e/fixtures) → play → apply each preset → save a My Sound → reload → the sound persists → switch themes → create a playlist → queue reorder → lyrics view with mocked LRCLIB → search with mocked Audius → Limited-mode badge appears when the CORS probe is mocked to fail. Include an axe accessibility scan on the main screens.
- Tauri: Rust `cargo test` for any Rust logic (SMTC mapping, window config). Note manual tests for the overlay/tray in MANUAL_TESTS.md.
- CI must run typecheck, lint, unit and web E2E on every push.

## 14. Done means

- `pnpm install && pnpm dev` runs the web app. `pnpm build` makes a production web build. `pnpm ext:build` builds and zips the extension. `pnpm test` and `pnpm e2e` pass. `pnpm typecheck` and `pnpm lint` are clean. `cargo check` passes for the desktop crate (on CI's Windows runner at least).
- CI (ci.yml) is green on GitHub. pages.yml has deployed the web app (if pushing was possible), so the GitHub Pages URL loads, onboarding works, and a bundled demo track plays with every preset. desktop-release.yml has produced a draft Release with the Windows installer + extension zip (if pushing was possible).
- Every feature in this document works or shows a clearly explained disabled state. Nothing was faked. No console errors in normal use.
- PROGRESS.md shows every item checked off, or explains why it isn't. LATER.md is complete and phone-friendly.
- The README covers setup, scripts, architecture, sources and their limits, deployment, and known limitations: no effects on Spotify/YouTube inside the app, Boost mode can't change speed, iPhone background mode, fullscreen games and the overlay.
- Final chat message (short, in plain language, because I'm reading on my phone):
  1. What works right now, plus the live link (GitHub Pages) and the Release link.
  2. Test results (counts).
  3. The LATER.md items, as a short numbered list.
  4. Anything that didn't get finished, and why.
  5. Three suggested next improvements.
