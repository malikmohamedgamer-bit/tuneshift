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
