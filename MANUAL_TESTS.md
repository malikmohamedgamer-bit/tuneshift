# Manual tests

Every spec item as a checklist. **[auto]** = covered by an automated test (unit, OfflineAudioContext, Playwright or cargo); the rest need a person, a real device or an account. Tick as you go.

## §3 Sources
- [ ] Search "lofi": grouped results with Audius/Jamendo/local badges (**[auto]** with mocked Audius).
- [ ] Every Audius/Jamendo track shows the artist name + a link to its page; Jamendo shows its licence badge.
- [ ] Browse: the 12 collections load and play; Radio from a track keeps playing similar tracks.
- [ ] "Find a remix" opens YouTube/Spotify/SoundCloud search pages in a new tab — nothing is streamed from them.
- [ ] Without a Jamendo key: Settings says how to enable it; with a key: Jamendo results appear.

## §4 Audio engine
- [ ] **[auto]** Every preset's exact values; independent pitch; mono input; click-free changes (OfflineAudioContext tests a–f).
- [ ] Listen: switching presets mid-song has no clicks or volume jumps; Nightcore is brighter and faster, Slowed + Reverb is darker and roomy.
- [ ] 8D Audio pans smoothly around the head on headphones.
- [ ] Vocal reduce (Karaoke) lowers vocals on a typical pop track.
- [ ] Crossfade 0–12 s and gapless album playback both sound right; ReplayGain/normalization keeps loud and quiet tracks even.
- [ ] A/B compare toggles between your sound and the original instantly.
- [ ] Visualizer (bars, wave, radial) follows the music; off when reduced motion is on.
- [ ] Export a local file with effects as WAV and MP3; the file plays elsewhere and sounds like the preview. Export is not offered for streamed tracks.
- [ ] **[auto]** Limited-mode badge when a host blocks CORS; the track still plays with tape speed.

## §5 Player
- [ ] Shuffle, repeat (off/all/one), queue drag-reorder (**[auto]** reorder), play next / add to queue, autoplay after the queue ends.
- [ ] Sleep timer (15/30/60/end of track/custom) fades out and stops.
- [ ] Lock screen / Windows media flyout shows title, artist, artwork; play/pause/next/prev/seek work from there and from keyboard media keys.
- [ ] Resume after reload restores the track, position and sound (**[auto]** sound persists).

## §6 Library
- [ ] Drop files and a folder (**[auto]** single file); Chrome/Edge "Add folder" remembers the folder after a restart and rescans.
- [ ] Tags and embedded cover art are read; ReplayGain is used.
- [ ] Liked songs, playlists (**[auto]** create), smart playlists, history, stats and Wrapped look right with real listening data.
- [ ] Backup → restore on another browser brings back the library, playlists, sounds and themes.

## §7 Home, browse, lyrics
- [ ] Home greeting with your name (**[auto]**), recently played, made-for-you shelves.
- [ ] Lyrics: synced lines scroll and highlight; offset adjustment is remembered per track (**[auto]** with mocked LRCLIB).

## §8 Friends (needs Supabase — LATER.md §2)
- [ ] Magic-link sign-in on web; on desktop the `tuneshift://auth` link returns to the app.
- [ ] Add a friend by username; accept/decline; see their now-playing (hidden in Private session).
- [ ] Sync: like a song on one device → appears on another within seconds; offline edits sync on reconnect.
- [ ] Share a sound/theme/playlist as a short link and as an offline code (**[auto]** offline round-trip).
- [ ] Listening party: host + guest stay in sync (play/pause/seek/skip/sound); host leaving hands over.

## §9 Themes
- [ ] **[auto]** Theme switch. All 12 built-in themes are readable (contrast checked in unit tests).
- [ ] Theme editor: every token, gradient builder, glass, radius, fonts, density; adaptive accent animates with the cover art.
- [ ] Custom CSS applies only inside the app; holding **Shift** while loading (or `?safe`) restores the safe theme.

## §10 Settings, accessibility, onboarding
- [ ] **[auto]** axe: no serious/critical issues on 8 screens + onboarding + extension popup.
- [ ] Keyboard only: every control reachable, visible focus, skip link, shortcuts (Space, ←/→, 1–8 presets, Ctrl+K).
- [ ] Screen reader (NVDA/Narrator): sliders announce values; track changes are announced.
- [ ] Text scale 200% and reduced motion: nothing overlaps; no animations.
- [ ] Onboarding is skippable (**[auto]** completes).

## §11.1 Web / PWA
- [ ] **[auto]** Manifest scope/start_url at `/tuneshift/`; offline shell boots; deep links fall back to the SPA.
- [ ] Install banner on Chrome/Edge; Add-to-Home-Screen steps on iPhone; update toast after a new deploy.
- [ ] iPhone: locking the screen keeps music playing (Background-safe mode).
- [ ] Lighthouse: desktop 98/98/100 measured; mobile 81/98/100 (see LATER.md).

## §11.2 Windows desktop (install from the release — LATER.md §4)
- [ ] **[auto]** cargo check, clippy `-D warnings` and unit tests for snapping, tray presets, folder scan, SMTC names, Discord validation.
- [ ] Main window: custom title bar (drag, double-click maximize, min/max/close); size/position remembered; close hides to tray when "Close to tray" is on.
- [ ] Second launch focuses the running app; opening an .mp3/.flac "Open with Tuneshift" plays it.
- [ ] Watched folder: add, play (full Sound Lab — badge says Full), rescan after adding a file; missing files are marked.
- [ ] Mini player (Ctrl+Alt+M or title-bar button): always on top, draggable, snap to each corner, opacity setting, expand to show the queue, preset menu, like.
- [ ] **Overlay:** start a game in borderless-windowed mode → change track → the pill slides in at the top-centre and hides after N seconds; clicking through it reaches the game; **the game never loses focus**. Try "always" and "off" modes and other positions.
- [ ] Tray: left-click shows/hides; menu has play/pause, next, previous, presets, mini player, overlay, Boost, quit; tooltip shows the track.
- [ ] Global shortcuts work while a game is focused; a clash shows a toast; media keys toggle once (not twice).
- [ ] Launch at startup on/off.
- [ ] Discord status shows track, artist and preset; clears when paused or in Private session.
- [ ] Boost mode with VB-Cable: meter moves, latency shown, presets apply live to Spotify; mini player/overlay show Spotify's track (SMTC) and its prev/play/next control Spotify.
- [ ] `tuneshift://` share link opens the app on the share page.

## §11.3 Extension (load unpacked — LATER.md §5)
- [ ] **[auto]** MV3 manifest without host permissions; popup presets/My Sounds/import/themes; service worker refuses browser pages; pitch worklet + WASM under the extension CSP; page speed script.
- [ ] YouTube video → icon → **Boost this tab**: badge ON, sound changes with presets, EQ, bass, reverb, 8D, widener, pitch; the input meter moves.
- [ ] Boost two tabs at once with different sounds; "Also boosted" lists the other tab and can stop it.
- [ ] Closing the tab or going to another site stops the boost and clears the badge; the next YouTube video (same site) keeps it.
- [ ] Alt+Shift+B toggles Boost on the current tab.
- [ ] Page speed on YouTube/YouTube Music/SoundCloud: Sped Up, Slowed, Nightcore change the real speed; "Keep pitch" keeps the pitch. Spotify Web shows "speed not supported".
- [ ] My Sounds appear on another computer signed in to the same browser profile.
- [ ] Nothing is recorded or downloaded (no download prompts, no files).

## §2 Rules (spot checks)
- [ ] No feature downloads/records audio from YouTube, Spotify, Apple Music, TikTok or SoundCloud.
- [ ] Boost mode and the extension never save audio.
- [ ] No payments or premium anywhere.
