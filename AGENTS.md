# Tank Frenzy RPi: notes for contributors and coding agents

Multiplayer browser tank game packaged as a **Home Assistant app** (formerly add-on) for a Raspberry Pi 4 (aarch64; amd64 also built). Forked from the main game at v1.8.0. User-facing docs: [README.md](README.md) (install), [DOCS.md](DOCS.md) (HA options, operation, troubleshooting), [GAMEPLAY.md](GAMEPLAY.md) (rules and features), [CHANGELOG.md](CHANGELOG.md), [SOUND_DESIGN.md](SOUND_DESIGN.md) and [audio/README.md](audio/README.md) (audio assets).

## Deployment facts

- Runs on the owner's Pi 4 under Home Assistant OS. Players reach it through a **Cloudflare Tunnel** at `https://tank-frenzy.sipekholiao.com` (tunnel service `http://<Pi IP>:8765`, WebSockets on, no HTTP Host Header override), not the Pi directly. Cloudflare's WAF blocks datacenter IPs, so the live site cannot be fetched from a cloud container.
- Two listeners: game port **8765** (LAN/tunnel, no HA login) and ingress port **8099** (HA sidebar, only accepts the Supervisor at `172.30.32.2`; never published on the host).
- Capacity: 4 players per room, at most 32 rooms. A worst-case test of 19 clients in 5 rooms, all firing, used about 0.7 Mbit/s per player (13 Mbit/s total) and about 16% of one core on this container (the Pi is slower but has headroom).
- Things never verified on real hardware: the Supervisor notify call, `CF-IPCountry` arriving through the tunnel, the HA app-list icon, and the admin page through the HA sidebar (`/hassio/ingress/tank_frenzy/<admin_path>`).

## File map

| File | Role |
| --- | --- |
| `server.cjs` | `createGameServer(options)`: HTTP routes, static allowlist (`files` map), admin routes, WebSocket protocol, 120 Hz tick loop, snapshot broadcast. `npm start` runs it standalone on port 8765. Exports `{createGameServer,countryOf}`. |
| `game-server.cjs` | `Room`: players, bots, phases, movement, shells, lasers, pickups, damage, scoring, rematch votes, `snapshot()`. Exports `{Room,hitRect,encodeState}`. |
| `bots.cjs` | Bot brain: `think(room,p,rayBox)` writes normal player input. `skills` (easy/normal/hard), `botNames`. |
| `leaderboard.cjs` | `Leaderboard(file,now)`: all-time totals (≤200 names) plus a 62-day match log (≤20000 matches); `top({period,country,count})`, `countries()`; atomic save (temp file then rename), debounced 1 s and again on close. |
| `addon.cjs` | HA entry point (`CMD` in Dockerfile). `readOptions('/data/options.json')` validates options; `homeAssistantNotifier()` posts to `http://supervisor/core/api/services/notify/<service>` with `SUPERVISOR_TOKEN`, at most once a minute. Starts both listeners with `leaderboardFile:'/data/leaderboard.json'`. |
| `map-generator.cjs` | Seeded random walls on a 5×4 grid of cells with connected lanes. |
| `shared.js` | `FIELD` constants shared by browser and server (version, sizes, limits, powers, palette, projection). UMD-style: `window.FIELD` / `require()`. |
| `client.js` | Whole browser client (vanilla JS, canvas): lobby, tutorial pager, leaderboard modal, input, rendering, effects, fullscreen, spectating. |
| `index.html` | Page markup and all CSS (inline `<style>`). |
| `admin.html` | Standalone admin UI (polls state, draws mini-maps, Watch live, End room). |
| `system-metrics.cjs` | Lazy one-second resource sampler shared by admin viewers: host CPU, available RAM, load averages, and separate game CPU/RSS. No background timer. |
| `music.js`, `sound-bank.js`, `audio/` | Music and effects. Audio files are cached as immutable: a changed MP3 needs a new filename plus updates to the manifest and the server allowlist. |
| `tutorial/*.webp` | How to Play screenshots, rendered by `tools/tutorial-screenshots.cjs`. |
| `icons/`, `manifest.webmanifest` | PWA icons and manifest. `icon.png` (128 px) and `logo.png` (250×100) are the HA app-list icon and logo. |
| `config.yaml`, `translations/en.yaml`, `repository.yaml`, `Dockerfile` | HA app manifest, option labels, repository metadata, image (`node:22-alpine`). |

**Adding a file the browser loads** means adding it to the `files` map in `server.cjs` *and* a `COPY` line in the `Dockerfile` (CI's container health check will not catch a missing asset; players will get 404s). A missing file on disk makes a static request hang in tests (the read stream errors and never ends the response).

## HTTP routes (server.cjs)

- `/health` → `{status:'ok',version}` (used by the HA watchdog and CI).
- `/rooms` → open rooms with players, settings, phase, `available` (human seats; 0 in `postgame`).
- `/leaderboard?period=day|week|month|all&country=XX` → `{players,countries,period,country,persistent}`.
- `/network-info` → LAN URLs, `publicUrl`, whether the request came through ingress.
- Admin root (`/admin`, or `/<admin_path>`): `GET /` admin.html, `GET /state`, `POST /watch` → `{pass,room}`, `POST /close` → 204, `GET /leaderboard` (all names), `POST /leaderboard/remove?name=` → 204/404, `POST /leaderboard/reset` → 204. POSTs require the header `X-Tank-Admin: 1` (CSRF guard). Ingress requests skip auth; otherwise HTTP Basic with `admin_password` (constant-time SHA-256 compare, 429 for one visitor after 10 failures a minute, or for everyone after 300). With no password, the admin root returns 404 on the game port. When `admin_path` is set, `/admin` is an ordinary 404.
- Ingress requests to `/` get `<base href="<ingress path>">` injected so relative asset URLs work under the sidebar. Every browser URL in the client must stay **relative** (`./audio/...`, `rooms`, `ws`).
- WebSocket upgrades only on `/ws`; on the game port the `Origin` host must equal `Host`.
- Every response carries a Content-Security-Policy (`securityHeaders`): own-origin scripts only, `frame-ancestors 'none'` (`'self'` for ingress so the HA sidebar can frame it), `Referrer-Policy: no-referrer`. `admin.html`'s single inline `<script>` is allowed by a SHA-256 hash computed at startup, so keep exactly one inline script there. New pages must not use inline scripts, inline event handlers or third-party URLs.
- Untrusted input: read message fields with `text()` or `typeof` checks, never `String(value)` (a JSON object like `{"toString":1}` throws). HTTP and WebSocket handlers are wrapped in `try/catch` so a mistake drops one connection, not the server.
- Fair use (`limits` in `server.cjs`): per visitor (`visitorOf`: `CF-Connecting-IP`, else the socket address; ingress is exempt) 32 connections, 16 not yet joined, 6 created arenas still open; 256 connections server-wide. Rooms idle in `waiting`/`postgame` for 15 minutes close.

## WebSocket protocol

Client → server (JSON, max 2048 bytes, max 150 messages/s):
- `{type:'join',room,name,mode:'create'|'join'|undefined,settings:{mode:'ffa'|'teams',bouncing,powers},token?}`. A `token` from an earlier `welcome` reconnects to the reserved tank (15 s reservation).
- `{type:'input',seq,x,y,aimX,aimY,fire}`. `seq` must increase; input is ignored outside the `playing` phase.
- `{type:'start'}` (owner only, while waiting), `{type:'rematch'}`, `{type:'bot',action:'add'|'remove'|'skill',skill}` (owner, waiting), `{type:'ping',sent}`, `{type:'leave'}`.
- `{type:'spectate',room,pass}`: hidden admin spectator; must be the first message.

Server → client: `welcome {id,token,slot,room,seq}`, `state` (snapshot), `spectating {room}`, `error {title?,message}` (then close), `pong {sent}`.

Snapshots (`Room.snapshot({withMap})` → `encodeState`): one `JSON.stringify` per room per broadcast, numbers rounded to tenths (angles `a`/`aim` to hundredths). Shells carry only `id,x,y,slot`. `map` is included only when it changed or once a second (`tick%60===0`); every snapshot has `mapId`, and `welcome` is followed by a full snapshot with the map. Client code must use `latest.mapId ?? latest.map?.id` and keep the last received map. Snapshots go out at 30 Hz (the 60 Hz interval sends on even ticks); simulation runs at 120 Hz. `events` (hit, destroyed, shot, bounce, pickup, laser, …) are sent once, then cleared.

Phases: `waiting` → `countdown` (3 s) → `playing` → `results` (20 s rematch vote; needs `floor(connected humans/2)+1`) → `postgame` (no new joins; room lives until everyone leaves).

## Game rules that code depends on

- The owner is the first connected human; ownership passes on leave/disconnect before the first start, then is cleared. Bots never own, vote or keep a room alive: the last human leaving removes them. A human joining a full room replaces the newest bot.
- Leaderboard: recorded once per match when `room.winner` first appears (`room.recorded`), only with at least two humans. Over 200 names, the fewest-match names are pruned first. Bots are skipped; names match case-insensitively; in teams the whole winning team wins. Periods use the server's local time zone; weeks start Monday. Country comes from `CF-IPCountry` (`/^[A-Z]{2}$/`, excluding `XX` and `T1`).
- Hidden spectators live in the server's `spectators` Map, never in `room.players`, so they never appear in counts, `/rooms` or snapshots. Watch passes are random hex, single room, 10-minute expiry; the client strips `?spectate=…&pass=…` from the address bar with `history.replaceState`.

## Home Assistant options

`public_url` (invite links), `notify_service` (`notify.xxx`, empty = off), `admin_password` (≥ 8 chars), `admin_path` (3–64 of `[A-Za-z0-9_-]`, must not reuse a game path such as `audio`, `icons`, `tutorial`, `rooms`, `ws`, `health`, `leaderboard`, `network-info`). An invalid value throws in `readOptions`, so the app fails to start and the reason is in its log. `public_url` must be http(s) with no credentials, query or fragment. `homeassistant_api: true` is only for notifications. `/data/leaderboard.json` is the only persistent state; rooms and matches are in memory.

## Tests

`npm test` runs `node --test tests/*.test.cjs` (about 155 tests, around 10 seconds). CI (`.github/workflows/verify.yml`) runs the tests, builds the Docker image on amd64 and aarch64, checks `/health` and `/rooms`, and runs `tools/admin-ui-check.cjs` in Chromium at desktop/tablet/phone widths. The UI job temporarily installs Playwright and uploads screenshots; it adds no game runtime dependency.

Harness quirks:
- `client.js` and `server.cjs` are loaded into `vm` sandboxes with hand-made fake DOM elements (children, `append`, `prepend`, `replaceChildren`, `classList`, events, `setAttribute`). They have no `querySelector`, `closest` or `dataset`; if new client code uses a browser API, add it to the fake (or guard the call), or the sandbox throws.
- Globals the sandbox needs must be passed in explicitly (`setTimeout`, `clearTimeout`, `history`, `HTMLInputElement`, `process`, `Buffer`, …).
- Objects created inside a sandbox fail `assert.deepEqual` against outer-realm objects; compare `JSON.stringify` output instead.
- Don't compare full `map` objects between snapshots (the map is intermittent); compare `mapId`.
- `tests/version.test.cjs` requires a three-part numeric version with no branch suffix, matching `FIELD.version`, `package.json` and both `package-lock.json` versions, plus a dated `## v<version> [YYYY-MM-DD]` heading in CHANGELOG.md.

## Release checklist

Use `MAJOR.MINOR.PATCH` for the game/app version:
- Increment **MAJOR** for a breaking or substantial redesign; reset MINOR and PATCH to 0.
- Increment **MINOR** for a new feature; reset PATCH to 0.
- Increment **PATCH** for a bug fix or small correction that adds no feature.
- Choose the bump from the largest change in a release. For example, after `19.0.0`, a feature is `19.1.0`, a fix is `19.0.1`, and a major change is `20.0.0`.
- Use the same plain `MAJOR.MINOR.PATCH` format on both `dev` and `main`; never append `-dev` (or another branch suffix) to the package, game, health or Home Assistant app version. The separate dev installation is distinguished by its Home Assistant slug `tank_frenzy_dev`, name and configurable host port; production keeps slug `tank_frenzy`. Advance the numeric version for each installable dev update. When promoting the tested dev commit to production, merge through a PR and retain the production app identity. Documentation-only edits do not require a version bump.

Every user-visible release bumps the version in all of these:
1. `shared.js` (`version`), `package.json`, `package-lock.json` (top-level `version` and `packages[""].version`).
2. `config.yaml` `version` (Supervisor only offers an update when this changes) and `Dockerfile` `ARG BUILD_VERSION`.
3. `README.md` ("App package version" line and the v1.9.0–x.y summary), `DOCS.md` (`/health` version), `GAMEPLAY.md` ("Current release").
4. `CHANGELOG.md`: one `## vx.y.z [YYYY-MM-DD]` heading per numeric game version, with user-visible and technical notes below it. Never put `-dev`, `App`, or descriptive text in the heading. Keep the full release history comparable on `dev` and `main` by synchronizing production notes back to `dev` after a release PR merges. Use the actual change date for new entries; older dates through v1.18.0 are archive import dates.

Then document the feature in GAMEPLAY.md (and DOCS.md for options/operation), and regenerate tutorial screenshots if visuals changed:

```bash
npm start   # in one terminal
npx -y -p playwright node tools/tutorial-screenshots.cjs [baseUrl] [outDir]   # ONLY=win.webp for one image
```

## Working conventions

- Code style: dense, compact JavaScript with few comments (match the surrounding code); CommonJS on the server (`.cjs`), no build step, one runtime dependency (`ws`).
- Server is authoritative; the client only sends input and renders. Keep new per-tick work bounded and keep snapshots small (they are the main cost).
- Verify UI changes in Chromium via Playwright (pre-installed; don't run `playwright install`) at desktop and phone sizes before pushing. When killing a local test server, use `pkill -f "^node server.cjs"` in its own command; a looser pattern also matches the shell running it.
- Git workflow the owner uses: test changes on `dev` (or a short feature branch), open a production PR to `main` when ready, and let the owner review and merge on GitHub. Keep the dev app's separate Home Assistant identity, and sync shared release notes back to `dev` after the merge.
