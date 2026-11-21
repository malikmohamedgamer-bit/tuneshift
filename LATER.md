# LATER — things only you can do

Everything here needs a sign-in, a click in a browser, an admin prompt or a decision. The app works without any of it: local files, the bundled demo tracks and Audius (no key needed) play with the full Sound Lab today.

## 1. Free keys (5 minutes)

- [ ] **Jamendo client_id** (turns on Jamendo search and the Jamendo half of Browse)
  1. Open https://devportal.jamendo.com and sign up (free, non-commercial).
  2. "My Applications" → "Add application" → any name, e.g. Tuneshift.
  3. Copy the **Client ID**.
  4. Paste it in the app: **Settings → Sources → API keys → Jamendo client ID**. It works at once on that device.
  5. Optional, for every device / the hosted site: GitHub → tuneshift repo → **Settings → Secrets and variables → Actions → New repository secret**, name `VITE_JAMENDO_CLIENT_ID`.
- [ ] **Audius API key** (optional — Audius already works without one; a key only raises rate limits)
  1. https://audius.org/settings → "Developer apps" → create an app → copy the API key.
  2. **Settings → Sources → API keys → Audius API key**, or the GitHub secret `VITE_AUDIUS_API_KEY`.

## 2. Supabase (friends, sync, sharing short links, parties)

All the code and the database migration are ready; it only needs a project.

- [ ] Create the project
  1. https://supabase.com → sign in → **New project** (Free plan), any name, pick a region near you, save the database password somewhere safe.
- [ ] Apply the database
  1. Project → **SQL Editor** → New query.
  2. Paste the whole file `supabase/migrations/20261121000000_init.sql` from the repo → **Run**. (Optional: run `supabase/seed.sql` too.)
- [ ] Auth settings
  1. **Authentication → URL Configuration** → Site URL: `https://malikmohamedgamer-bit.github.io/tuneshift/`
  2. Redirect URLs — add all of:
     - `https://malikmohamedgamer-bit.github.io/tuneshift/auth/callback`
     - `http://localhost:5173/auth/callback`
     - `tuneshift://auth`
  3. **Authentication → Providers**: Email (magic link) is on by default. Google/Discord are optional and need their own OAuth apps.
- [ ] Connect the app
  1. Project → **Settings → API** → copy the **Project URL** and the **anon / publishable** key. Never copy the service-role key.
  2. In the app: **Settings → Account → Server (Supabase)** → paste the project URL and the anon key.
  3. For the hosted site: add GitHub secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## 3. Put the web app online (GitHub Pages)

The repo is private, and GitHub's Free plan only serves Pages from public repos. The deploy workflow is ready and skips itself until Pages is on.

- [ ] Either make the repo public (**Settings → General → Danger Zone → Change visibility**), or upgrade the account.
- [ ] **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- [ ] **Actions → "Deploy web app to GitHub Pages" → Run workflow** (or push any commit).
- [ ] Open https://malikmohamedgamer-bit.github.io/tuneshift/ → finish onboarding → play a demo track with a few presets.

## 4. Windows desktop app

- [ ] Install it
  1. GitHub → tuneshift → **Releases** → draft **Tuneshift v0.1.0** → **Publish release** (drafts are only visible to you).
  2. Download `Tuneshift_0.1.0_x64-setup.exe` and run it. It installs just for you — no admin prompt.
  3. It isn't code-signed (that costs money), so SmartScreen may say "Windows protected your PC": click **More info → Run anyway**.
- [ ] **Discord status** (optional)
  1. https://discord.com/developers/applications → **New Application** → name it "Tuneshift" (Discord shows this name).
  2. Copy the **Application ID**.
  3. Tuneshift desktop → **Settings → Desktop → Discord client ID** → paste the ID → turn on **Discord Rich Presence**. Discord must be running.
- [ ] **Boost mode for Spotify / other apps** (needs a free virtual audio cable; Tuneshift never bundles it)
  1. Download VB-Audio Virtual Cable from the official site https://vb-audio.com/Cable/ and install it (it asks for admin and a reboot — that's why I couldn't do it).
  2. Windows **Settings → System → Sound → Volume mixer** → find Spotify (it must be playing) → set its **Output device** to **CABLE Input**.
  3. Tuneshift → **Boost** (sidebar) → input device **CABLE Output**, output device your speakers/headphones → press the big power button (**Turn Boost mode on**).
  4. If the meter stays at −∞, Spotify isn't routed to the cable yet (step 2), or press Play in Spotify.
  - Boost processes live sound only. Nothing is ever recorded.

## 5. Browser extension (Chrome / Edge)

- [ ] Download `tuneshift-boost-extension.zip` from the same release (or from the latest CI run's artifacts) and unzip it to a folder you'll keep.
- [ ] Open `chrome://extensions` (Edge: `edge://extensions`) → turn on **Developer mode** → **Load unpacked** → choose the unzipped folder.
- [ ] Pin it (puzzle icon → pin). Open a tab playing audio → click the icon → **Boost this tab**.
- [ ] Optional: change the keyboard shortcut at `chrome://extensions/shortcuts` (default Alt+Shift+B).

## 6. Things I couldn't verify myself (please try once)

- [ ] Run through `MANUAL_TESTS.md` — especially desktop (mini player, overlay over a game, tray, global shortcuts, file associations) and extension tab capture. The code compiles and passes automated tests, but these need a real click/desktop.
- [ ] The desktop app was compiled only on GitHub's Windows runner: installing Rust's MSVC build tools on this PC needs an admin prompt.

## Known limitations (no action needed, just so you know)

- **YouTube / Spotify / Apple Music / TikTok / SoundCloud** are never streamed, downloaded or recorded by Tuneshift. "Find a remix" opens their own pages. To add effects to them, use desktop **Boost mode** or the **extension** (live processing only).
- **Limited mode:** if a stream host blocks cross-origin audio, the track plays with speed/pitch only (no EQ/reverb/8D). Local files and the demos always get the full Sound Lab.
- **iPhone/iPad:** Safari pauses Web Audio when the screen locks, so Tuneshift switches to Background-safe mode (tape speed only) when the app goes to the background.
- **Lighthouse (mobile, simulated slow 4G):** performance ≈ 81; desktop 98. Accessibility 98 and best practices 100 on both.
- **Exclusive-fullscreen games** can cover the overlay — use borderless-windowed mode.
- **Extension page speed:** after a full page reload, open the popup once to re-apply the speed. Not offered on Spotify Web (its player resets it).
- **Extension share codes:** full `ts1.` codes import directly; short links need the app.
