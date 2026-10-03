# Changelog

Game and Home Assistant app versions use the same numeric format on dev and production; the separate installation is identified by its Home Assistant slug. The branches share this release history, and `config.yaml` gives each installed app's version. Dates use the earliest release or import commit available in this repository, shown in the Asia/Kuala_Lumpur time zone. For v1.1.0–v1.3.2, the original game release commits are unavailable here, so 2026-09-23 is the archive import date, not a claimed release date. The v1.5.0 notes first appear in the 2026-09-24 import of v1.6.0. The 19.x builds were originally distributed under those numbers; their entries below are relabeled as consecutive 1.19.x versions for a consistent history. Git history retains the original package numbers.

## v3.1.0 [2026-10-03]

- Keep your tank centred at every map edge and corner on mobile and PC, including respawns. Retain Full Map, add off-screen indicators on PC, and keep mouse aim aligned as the camera moves.
- Open Match Details in a dedicated panel inside the arena, showing kills, deaths, hit rate and damage without leaving fullscreen. Preserve the completed statistics if the rematch timer returns the group to the lobby; Back closes the panel and a new battle clears it.
- Extend Quick Play's human search window from eight to twelve seconds; four humans still reveal immediately and the five-second Ready timer is unchanged.
- Put your own tank, name and rank above the leaderboard filters. Remember your most recent tank for views without a ranked entry.
- Replace the home-screen name field with a top-right profile icon. Save commits a name change; Back discards the draft without changing the guest identity. Label the Join arena return action Back.
- Prevent text selection and image dragging on game surfaces while keeping name and invitation inputs editable and copyable. Clear stale selection when control gestures begin.
- Add regression coverage for corner-centred cameras, mouse aim, fullscreen details and expiry, profile editing, selection handling, and responsive browser flows.

## v3.0.0 [2026-10-03]

- Redesign the home screen around one prominent Play action, compact mode selection and direct Create arena / Join with code actions. Remove the empty directory panel; show public arenas only when available, with a retry action on errors.
- Use the quarry backdrop, larger tank portraits and a simplified Ready action for matchmaking. Preserve the existing search deadlines, adaptive AI and shared countdown.
- Put winner artwork and weekly rank progress first on results. Keep player reactions visible in a compact scorecard, reveal deaths, hit rate and damage through Match Details, and keep Play Again, Lobby and Leave accessible on small phones and landscape screens.
- Replace font-dependent menu and reaction icons with inline SVG artwork; use clear numeric ranks. Refine leaderboard spacing, filter tabs, name truncation and text contrast.
- Adapt the home layout for desktop, tablet, phone and short landscape screens, respect reduced motion, and update browser checks and the tutorial result image.
- Keep the existing scoring, guest profiles, room protocol and separate dev app identity.

## v2.0.0 [2026-10-03]

- Make Quick Play one tap: group same-mode arrivals for up to eight seconds, fill spare slots with adaptive AI, reveal four tanks with a five-second timer, and start immediately when all humans are ready.
- Create friend arenas immediately with remembered rules; join invitations directly. Add local QR invitations, host rule editing, friends-only privacy, readiness and balanced team swaps.
- Keep friend groups together between rounds; return to an editable lobby when the rematch window expires or a participant chooses Back to Lobby.
- Use natural AI callsigns with visible AI labels. Choose Quick Play difficulty from recent human performance, with easy-bot weighting and beginner protection.
- Record completed solo battles against AI. Separate guest identity from display names, preserve legacy totals and an untouched migration backup, deduplicate round recording, and retain departed players’ earned statistics when a round finishes.
- Default the leaderboard to This week, add a podium and personal rank, make phone rows expandable, use Malaysia reset times, and animate genuine weekly rank movement and statistic gains after matches.
- Add shared result reactions with a swipeable/mouse-wheel picker, three-second bubbles, cooldown and local mute.
- Show labelled AI starter targets separately from real regional player records; do not invent human population or countries.
- Add server, migration, lifecycle and mobile regressions plus real desktop/phone/landscape browser checks in CI. Keep the dev app’s separate slug and port.

## v1.22.2 [2026-09-29]

- Remove player names from the top battle score chips while retaining color, kills and accessible labels. Place the kill feed below the menu button.
- Stop drawing bullets on admin mini-maps and omit bullet coordinates from their twice-per-second admin payload; live gameplay snapshots are unchanged.

## v1.22.1 [2026-09-29]

- Make the embedded game gauge labels easier to read on narrow phones by enlarging and repositioning them, while retaining the exact one-core CPU value for screen readers.

## v1.22.0 [2026-09-29]

- Put game CPU and memory use inside their admin gauge readouts, including resident MiB for memory; remove repeated process lines and shorten the available-memory label.
- Keep the battle header focused on kills and a larger, unlabeled health bar for your own tank. Other tanks' health remains below their tanks on the map.
- Tolerate short mobile background/network interruptions: wait longer for snapshots and WebSocket pongs, reserve a disconnected tank for 90 seconds, retry longer, and reconnect promptly on return. Preserve the tank token across a same-tab reload; only Leave Arena explicitly releases the spot.

## v1.21.1 [2026-09-29]

- Prevent the bot skill selector from clipping its value on narrow phones and keep the waiting title compact.
- Check that both portrait and landscape results keep the Leave button inside the viewport.

## v1.21.0 [2026-09-29]

- Keep the mobile battlefield edge to edge during the countdown and after a match, with the compact status and menu floating over the map.
- Fit the create and join forms in one phone viewport, using a two-column layout in landscape and retaining internal overflow for unusually short screens.
- Compact the joined waiting room for four players and bot controls, so the Start Game button stays visible without page scrolling.

## v1.20.0 [2026-09-29]

- Show teal ALLY arrows for off-screen teammates in 2 vs 2 and keep enemy arrows red.
- Put readable health bars and numbers below visible tanks, including on narrow phones.
- Extend the close-view map to mobile safe-area edges and inset the score and menu chips.

## v1.19.11 [2026-09-29]

- Keep the health bar and health number below other tanks large enough to read in a narrow phone view.

## v1.19.10 [2026-09-29]

- Show teal ALLY arrows toward off-screen teammates in 2 vs 2, distinct from red ENEMY arrows.
- Draw each visible rival or teammate’s live health directly below their tank.
- In close view, use the left, right and bottom map area with slimmer camera margins; let the map reach mobile safe-area edges while inset score and menu chips stay readable.
- Keep the mobile score chip on one line by showing progress toward the target without repeating the remaining count below it.

## v1.19.9 [2026-09-29]

- Correct the app version after the accidental 19.x jump and relabel earlier changelog entries in chronological 1.19.x order. The original published package numbers remain in Git history.
- Keep the tested battlefield and Pi resource improvements, and preserve the existing Home Assistant app identity, host port and persistent leaderboard data across the update.

## v1.19.8 [2026-09-29]

- Compact the admin CPU and memory gauges: keep system and game values visible while removing repeated labels and unused vertical space.

## v1.19.7 [2026-09-28]

- Let the battlefield fill the active arena while the score, your health, opponent chips and menu float over just the map area they need, including mobile landscape.
- Clear live opponent health on victory, results, disconnection and return to the arena browser, so old match information cannot linger over the lobby.

## v1.19.6 [2026-09-28]

- Use the plain numeric version `1.19.6` on dev too; the Home Assistant dev slug still keeps that installation separate from production.
- Overlay game CPU and memory use on the corresponding Pi resource half-circle gauges. The orange segment starts at zero and shows the game's share of total host CPU or RAM; the exact one-core CPU and resident-memory readings remain below.
- Convert process CPU from one-core percentage to all-core capacity for the overlay, and resident bytes to a share of total RAM. Hide the segment when the denominator or game reading is unavailable.

## v1.19.5 [2026-09-28]

- Remove the artwork pause/play button so the lobby illustration stays unobstructed; hidden-tab and reduced-motion pauses still work.
- Protect the game from malformed requests and messages that could previously stop the server for everyone.
- Limit excessive connections and idle arenas while retaining space for players sharing one network.
- Prevent one visitor's password guesses from locking out the owner; add leaderboard name removal and reset to the admin page.
- Count leaderboard results only when at least two people play, and keep frequent players from being displaced by new names.
- Add browser security headers to restrict scripts, framing and referrer information.
- Promote the 1.19.5-dev hardening and admin changes alongside the 1.19.4 lobby animation and live battle strip.
- Preserve the production Home Assistant slug `tank_frenzy`, default host port `8765`, app name and `/data/leaderboard.json` across the upgrade.
- Security: a single crafted message or web request could stop the game server for everyone. Malformed input now closes only its own connection.
- Fair-use limits so one visitor cannot fill the server: 6 open arenas and 32 connections per address (16 not yet in an arena), 256 in total; arenas idle in the waiting room or after a match close after 15 minutes.
- Admin sign-in slows only the address that guesses wrong (10 tries a minute), so strangers can no longer lock you out.
- Leaderboard: only matches with at least two people count, a flood of made-up names can no longer push out regular players, and the admin page can remove a name or reset the leaderboard.
- Browser security headers: a Content-Security-Policy that allows only the game's own files, no framing by other sites, and no referrer.
- `text()` for untrusted message fields and a `typeof` check for bot skills; `try/catch` around the HTTP and WebSocket handlers; a missing static file now ends its response.
- `visitorOf()` (`CF-Connecting-IP`, else socket address) with per-visitor connection, pending and arena limits; `closeRoom()` shared by admin End arena and the 15-minute idle close.
- `securityHeaders()` on every response; the admin inline script is allowed by a startup SHA-256 hash.
- `Leaderboard.remove()` / `reset()` and admin routes `GET /leaderboard`, `POST /leaderboard/remove`, `POST /leaderboard/reset`; prune by fewest matches first.

## v1.19.4 [2026-09-28]

- Bring the tested lobby artwork to production: independent tank sprites over a clean quarry, recoil, muzzle flame, expanding burst ring, sparks and smoke, and shaded shells that fly at a constant speed before fading out.
- Add a compact live battle strip for your kills, kills remaining to win, and every other tank’s kills and health. Team matches use the combined team score and mark teammates.
- Keep the artwork pause control, hidden-tab pause and reduced-motion behavior. Purple shots pass behind the foreground blue tank.
- Ship the new WebP background and transparent tank atlas with the game, serve them through the static allowlist, and exercise the responsive animation in browser CI.
- Preserve the production Home Assistant slug `tank_frenzy`, host port `8765`, app name and leaderboard data across the upgrade.
- Fade each flying shell gradually over the final part of its flight while retaining its uniform travel speed.
- Strengthen the muzzle burst with a brighter layered flame, an expanding shock ring and extra sparks, visible only during firing.
- Animate opacity separately from a linear projectile transform; keep pause and reduced-motion behavior for the new blast ring.

## v1.19.3 [2026-09-28]

- Separate the quarry background and transparent tank silhouettes so recoil has no duplicate tank underneath.
- Add short flickering muzzle flames, sparks and fading smoke; draw shaded pointed shells at a constant speed.
- Layer the distant tanks and their shots behind the foreground tanks so purple shells pass behind the blue tank.
- Reuse one transparent sprite atlas and one clean background; animate only browser transforms and opacity, with pause and reduced-motion support.

## v1.19.2 [2026-09-28]

- Remove the baked-in flashes from the lobby picture so tanks only appear to fire during animated shots.
- Give each tank stronger recoil; show larger shells traveling more slowly between volleys.
- Keep a live battle strip on screen with your kills, kills left to win, and every other tank's kills and health; team games track the team score and mark allies.
- Keep the pause control and reduced-motion behavior, with all effects rendered in the browser.
- Serve a clean idle WebP image as the animated hero's background while preserving the original illustration for reference.

## v1.19.1 [2026-09-27]

- Animate the existing lobby artwork with gentle tank recoil, staggered muzzle flashes and shell streaks.
- Add an artwork pause control; stop motion outside the lobby, in hidden tabs and when reduced motion is requested.
- Align the game badge, health endpoint and Home Assistant app version using the MAJOR.MINOR.PATCH-dev convention.
- Use SVG masks and CSS transforms with the existing banner asset; add no server simulation or animation downloads.

## v1.18.0 [2026-09-27]

- Use transparent left/right touch zones with floating thumb indicators, and keep the live aim line steady during laser shots.
- Put in-game actions behind a compact icon menu; hide the arena code during play and use "arena" in player-facing text.
- Let arena creators set a 5–50 kill win target, default 10, for free-for-all or team matches.
- Center and shrink the mobile tutorial card and add safe-area space above the iPhone lobby logo.
- Validate the per-arena kill target on the server; include it in discovery and snapshots, and use it for winning and rematches.
- Keep existing `?room=` links and WebSocket fields compatible while changing interface terminology.

## v1.17.0 [2026-09-27]

- Point mobile close-view players toward off-screen opponents with labeled arrows at the view edge; hide arrows in Full Map, for allies and destroyed tanks, and after a match.
- Mark allies and enemies with distinct rings and names in 2 vs 2, and split the end-of-match scoreboard by Orange and Blue teams with their scores.
- Add client-side camera-edge marker geometry and 2 vs 2 relationship cues without extra network data or server work. Group result rows by team, preserving the free-for-all board.
- Cover off-screen visibility, team identification and grouped results with regression tests.

## v1.16.0 [2026-09-27]

- Add Damage and Deaths columns to the persistent leaderboard, keeping K/D and the existing period and region filters. Damage counts actual enemy health lost, not excess laser damage or hits blocked by shields.
- Preserve previous leaderboard totals; historical damage that was not recorded starts at zero.
- Track per-match damage dealt on the server, reset it on rematch, and save it in both all-time totals and recent match logs. Expose damage and deaths in `/leaderboard` without enlarging 30 Hz game snapshots.
- Migrate old saved leaderboards and match logs without a damage field, defaulting their missing values to zero; add combat, persistence and period regression tests.

## v1.15.0 [2026-09-26]

- Replace the admin's plain resource numbers with system CPU and memory gauges, showing game usage separately.
- Show Pi load over 1, 5 and 15 minutes with per-core values, reference markers, and a recent 60-second trend.
- Exclude reclaimable cache from Linux memory usage; label unavailable and stale readings clearly. Share one resource sample per second across admin viewers.
- Add `system-metrics.cjs`: lazy host CPU deltas, Linux available-memory accounting, process usage, load averages and one-second caching. Preserve legacy admin fields and include the module in the container.
- Add responsive SVG gauges and a bounded load-history chart to `admin.html`; prevent overlapping refreshes and time out stalled requests.

## v1.14.0 [2026-09-26]

- About 70% less network traffic: snapshots are encoded once per room, numbers are rounded, shells carry only what the browser draws, and the map is resent once a second instead of 30 times.
- Private admin page (`/admin` or your own `admin_path`, never linked from the game) with live mini-maps, scores and server load for every room, hidden-spectator **Watch live** and End room. Free through the Home Assistant sidebar; on the public address only with the new `admin_password` option.
- Leaderboard views for today, this week, this month and all time, filtered by the country Cloudflare reports. Recent match history is kept for 62 days in `/data/leaderboard.json`.
- App-list icon and logo for Home Assistant. One or two rooms no longer stretch to fill the room list.
- Leaner snapshots (`encodeState`, optional map with `mapId`), `/admin` with `admin.html`, and leaderboard periods and regions.

## v1.13.0 [2026-09-26]

- All-time leaderboard saved as `/data/leaderboard.json`: wins, matches, kills and deaths by player name, shown from the 🏆 button. Written atomically; bots are not ranked.
- New `notify_service` option: a Home Assistant notification (via the Supervisor API, `homeassistant_api: true`) when someone opens a room, with a tap-to-join link when `public_url` is set. At most one a minute.
- Option names and descriptions in the Configuration tab (`translations/en.yaml`).
- 🏆 leaderboard (`/leaderboard`, new `leaderboard.cjs`) and a room-created hook used by the Home Assistant app for notifications.

## v1.12.0 [2026-09-26]

- Computer-controlled bots: the room starter adds or removes up to three bots in the waiting room and sets Easy, Normal or Hard skill.
- Bots use normal player input and rules, aim with skill-based error and target leading, steer around walls, unstick themselves and fetch nearby power-ups.
- People joining a full room replace a bot; bots never own rooms, vote on rematches or keep empty rooms alive.
- Bots with three skill levels, controlled from the waiting room. New `bots.cjs`; the room directory lists open seats by people and marks bots.

## v1.11.0 [2026-09-26]

- Room browser: saved player name, Quick Play, and one-tap Join on every room row with its players and rules. Round icon buttons for effects and music.
- Kill feed with streak banners, an end-of-match scoreboard (kills, deaths, hit rate) and a low-health heartbeat.
- Rematch needs a majority of connected players instead of everyone; a non-voter leaving can complete it.
- Desktop waiting rooms and battles fit the window. Removed the map label, bottom help cards, footer and masthead slogans.
- Add to Home Screen: web app manifest and icons; landscape lock on Android when fullscreen starts.
- Fix the Room Code pattern, which browsers rejected as invalid. Add `tools/tutorial-screenshots.cjs` and regenerate the tutorial images.
- Quick Play, one-tap Join, remembered name, kill feed and streaks, scoreboard, heartbeat, majority rematch, home-screen app support and a one-screen desktop battle view.
- Destroyed events carry the attacker and streak; snapshots carry shots, hits, streak and the rematch vote target.

## v1.10.0 [2026-09-26]

- Redesign the room browser to fit one screen without scrolling: artwork beside the room panel on wide screens, above it on phones. Only the room list scrolls.
- Turn How to Play into eight pages with Back/Next buttons, page dots, arrow keys and swipes; add a Getting Hit page and split power-ups into tokens and effects.
- Add hit effects: flames around the screen edges, a stronger shake, rising damage numbers, smoke and a shockwave on destruction, vibration on Android and a low-health smoulder.
- Improve touch use: no double-tap zoom on buttons, 40px+ touch targets in the room browser and tutorial.
- One-screen room browser; paged How to Play guide with swipe and arrow keys.
- Fiery screen-edge hit flash, damage numbers, destruction shockwave, Android vibration and low-health smoulder. Hit events now carry their damage.

## v1.9.0 [2026-09-26]

- Show the quarry artwork as a large header in the room browser. Forms, waiting rooms and battles now share one compact tagline instead of switching between large and small headers.
- Add a How to Play guide with game screenshots: how to win, PC and phone controls, finding your tank, bouncing bullets and each power-up.
- Draw a thick translucent halo in your color around your own tank.
- Place Leave Room beside Rematch on the result card.
- Enter fullscreen automatically on Create & Join, Join Arena and Start Game where the browser allows it; leaving the room exits fullscreen.
- Serve the six tutorial WebP images through the sidebar and LAN listeners.
- Large illustrated room-browser header; one compact tagline on every other screen.
- How to Play guide with screenshots of controls, bouncing bullets, power-ups and the win screen.
- Own-tank halo, Leave Room on the result card and automatic fullscreen when joining or starting.

## v1.8.0 [2026-09-26]

- Show the animated winner card in the arena and require every connected player to vote within 20 seconds for a rematch.
- Keep results open after the deadline, reject new joins to ended rooms, and freeze gameplay while voting.
- Preserve authenticated Home Assistant ingress and LAN multiplayer paths; align app and game versions.
- Replace the small bottom victory line with a large centered result card, player outcome, rematch tally and countdown.
- Remove automatic restarts. Only unanimous votes from connected players during the 20-second window launch a new map and round.
- Keep expired results visible until players leave; prevent late joins and freeze movement/aim controls while voting.

## v1.7.1 [2026-09-26]

- Keep the Create and Join forms visible without scrolling on narrow screens. Preserve the tagline in a compact line and hide inactive arena chrome while the form is open.
- Keep the room browser and active game layouts unchanged; retain Home Assistant ingress and LAN multiplayer paths.
- Use a dedicated compact phone layout for Create and Join, with the tagline on one line, tighter form spacing and a return to the top of the page.
- Leave the room browser and active game views unchanged.

## v1.7.0 [2026-09-24]

- Match the Home Assistant app and game version numbers.
- Raise music gain to 0.30, loop within the active phrases and preload battle music during the countdown.
- Add separate original MP3s for the 3–2–1 countdown and battle start, served through sidebar and LAN access.
- Raise background music gain from 0.10 to 0.30 and loop its active phrase without replaying the intro or faded ending.
- Select and preload A or C during countdown; play three rising numbered countdown ticks and a separate battle-start recording.

## v1.6.0 [2026-09-24]

- Home Assistant app package 1.1.0: Sync the current main-game release, including the approved B pre-game music, random A/C battle music and four selected combat effects.
- Serve seven additional versioned MP3s through both the authenticated sidebar and LAN game, retaining the ingress prefix and WebSocket behavior.
- Remove unrelated project references from the published documentation.
- Install the approved Cannon A for normal and machine-gun fire, Ricochet C for bounces, Power-up A for pickups and Destruction C for tank explosions. Keep the previous samples as per-asset fallbacks.
- Preserve double cannon and other unaffected cues, voice limits, spatial playback and mute.

## v1.5.0 [2026-09-24]

- Play B — Overdrive before battles, including waiting and countdown.
- Select A — Iron Advance or C — Steel Pressure locally for each battle; cache decoded tracks and use one looping music source.
- Preserve independent music/effects controls and browser autoplay behavior.

## v1.4.0 [2026-09-23]

### Pickups and aiming

- Aligned pickup artwork with its actual ground position instead of projecting it above the collection center.
- Increased collection radius from 40 to 60 world units for easier approaches from every direction. Nearby pickups cannot be collected through walls.
- Added one local-only dashed aiming centerline from the muzzle for every weapon. Double cannon shells travel parallel on either side. The guide stops at cover or the map edge; it does not predict ricochets or moving-tank collisions.
- Kept the guide hidden during waiting, countdowns, death and results. No aiming messages or server simulation were added.

### Music

- Replaced the simple music loop with an original 16-bar arcade battle arrangement: drums, pulsing bass, sustained chords, brass-style melody and phrase-ending fills.
- Battle music plays at 128 BPM; the splash/waiting arrangement is a calmer 112 BPM. Both remain below sound-effect volume, with independent saved music/effects switches.
- Music still renders once per track locally, then uses one looping source. Two cached mono buffers total about 5.4 MiB; no music downloads or server audio processing are required.

## v1.3.2 [2026-09-23]

- Reduced laser damage from 5 to 4 per hit. A full-health, unprotected tank now survives two laser hits with 2 health and is destroyed by the third.
- Updated the power-up guide, current rules and damage regression tests. Screen shake and other laser behavior are unchanged.

## v1.3.1 [2026-09-23]

### Combat

- Increased active-shell limits by 50%: 24 → 36 per player and 96 → 144 per room. This reduces cap-related firing pauses with bouncing enabled; reload cooldowns and shell lifetimes are unchanged.
- Double cannon now fires two parallel shells from separate barrel origins instead of a spreading volley. Both barrels share the same heading and independently stop spawning forward when obstructed by cover.
- Shared barrel spacing between simulation and tank rendering; updated the power-up guide and current rules.

## v1.3.0 [2026-09-23]

### Rooms and rounds

- Added a waiting-room player list after creating/joining an unstarted room. The creator starts the first game; start control transfers to the next connected player if they leave or disconnect beforehand.
- After the first start there is no owner. New rounds restart automatically, and rooms are removed when the last player leaves or disconnected reservations expire.
- Added a large shared 3–2–1 countdown before every round, with movement, aiming, firing, damage and pickups frozen on the server until it ends. Countdown input cannot queue shots for later.
- Mid-match joins and respawns now receive three seconds of protection that remains active while moving or firing. Spawn protection and ten-second Immortal both slowly fade the tank artwork in/out; reduced-motion mode uses steady translucency.

### Audio and naming

- Enabled local firing audio. Normal and machine-gun fire share the cannon sample; double cannon uses the paired-shot sound once per volley. All power-up collections use one shared chime.
- Renamed Double Gun to Double Cannon in the interface and current documentation.
- Added quiet original cartoon music for splash/waiting screens and battle, generated and looped locally without server processing or music downloads.
- Added independent Music and Effects switches to the top menu and splash screen, with browser-saved preferences. Hidden pages stop both channels; music resumes if enabled when returning.
- Music uses one looping source and two cached mono buffers. Existing sound-effect voice limits remain in place.

## v1.2.0 [2026-09-23]

### Audio

- Added the approved cartoon sound samples: layered destruction, cannon pops, paired double-gun pops, machine-gun ticks, laser zaps, metallic ricochets, interception sparks and hull impacts.
- Added the previewed menu, match-start, victory and defeat cues. Immortal, Restore and Speed have distinct pickup sounds; weapon pickups use their matching weapon sound.
- Packed the approved sounds into one cached 170 KiB MP3 asset. Machine-gun fire uses one tick from the auditioned burst per real shot; the two events from a double shot trigger only one paired sound.
- Added distance attenuation, subtle stereo positioning, small shot/ricochet pitch variation, and quieter combat/engine audio beneath result fanfares.
- Limited sample playback to 12 simultaneous voices with priority for important cues and rate limits for noisy bursts. Original synth effects remain as bounded fallbacks while the audio loads or if loading fails.
- Sound Off, leaving, and hiding the page stop active effects, including long explosions and queued synth notes. Loading a sound never replays an old event later.
- Preserved muted normal local firing, the local engine sound and existing laser audibility.

### Performance

- Samples download and decode once per page session after audio is activated. All mixing runs in the browser. No gameplay snapshot fields, simulation timers or per-room server work were added.

## v1.1.1 [2026-09-23]

### Fixed

- Corrected the SVG viewport for the active-power badge and all six power-guide icons. Symbols were offset into the bottom-right corner and clipped, leaving mostly a colored tile instead of the collected power's shape.
- Explicitly sized each symbol instance so its full shape is centered within the badge. Preserved icon animation and the remaining-time display.

### Documentation

- Added `SOUND_DESIGN.md` to explore a cartoon arcade sound direction. Audio behavior is unchanged in this patch.

## v1.1.0 [2026-09-23]

### Added

- Version badge in the bottom-right corner of the main room browser.
- **Immortal** pickup: star icon, 10 seconds of protection from incoming damage, and animated stars around the tank. Moving and firing remain available. Collecting another timed power replaces it.
- **Restore** pickup: red heart icon and instant restoration to maximum health. Preserves an existing timed power without extending its duration; shows a brief heart on collection.
- This repository changelog.

### Changed

- Tank health doubled from 5 to 10. Normal shells still deal 1 damage. Spawning and respawning restore 10 health.
- Five compact HUD pips each hold two health, with half-filled pips for odd health values.
- Laser damage increased from 2 to 5. A full-health, unprotected tank now takes two laser hits.
- A laser clears every enemy bullet intersecting its path before the first tank or cover. Friendly and own bullets remain untouched.
- Power-up guide now explains all six pickups.

### Fixed

- Laser visuals start at the barrel opening, using the same projected muzzle and aim as the rendered turret, including interpolation and touch aiming.
- A laser stops at the first enemy tank, including an invulnerable tank, and cannot fire through nearby cover when its barrel overlaps it.
- Preserved and regression-tested 2 vs 2 pass-through: bullets and lasers pass through teammates; teammates' bullets do not intercept one another.

### Performance

- Existing four-player, two-pickup and 96-shell room limits remain in place. Laser bullet clearing is a bounded scan per laser shot; Immortal and Restore add no background jobs.

## v1.0.0 [2026-09-23]

- Package Tank Frenzy v1.4.0 for 64-bit Raspberry Pi and AMD64 Home Assistant OS.
- Add repository installation, a multi-architecture Dockerfile, health checks and startup/shutdown handling.
- Support authenticated sidebar access on an internal ingress listener and LAN play on host port 8765.
- Keep assets, sound, room discovery and WebSockets under the ingress prefix; support a configured invitation URL.
- Include installation/update instructions and CI container builds for both architectures.
- Verify 88 automated checks, including mixed ingress/LAN multiplayer. Physical Pi play still requires target-device verification.
- Tank Frenzy branding, cartoon battlefield and illustrated lobby, animated power icons and countdowns.
- Menu, round-start, pickup, victory and defeat audio cues; louder destruction effects.
- Free-for-All and 2 vs 2 rooms, room discovery, player previews, and optional bouncing bullets and powers.
- Laser, double gun, speed and machine gun pickups.
- Enemy bullet interception, leave confirmation, and a compact mobile HUD with a following camera and twin-stick controls.
