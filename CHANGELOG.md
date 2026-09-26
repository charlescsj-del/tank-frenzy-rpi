# Changelog

App package versions follow `config.yaml`. Game versions below follow `shared.js`, `package.json` and `package-lock.json`.

## App 1.13.0 — Tank Frenzy v1.13.0

- All-time leaderboard saved as `/data/leaderboard.json`: wins, matches, kills and deaths by player name, shown from the 🏆 button. Written atomically; bots are not ranked.
- New `notify_service` option: a Home Assistant notification (via the Supervisor API, `homeassistant_api: true`) when someone opens a room, with a tap-to-join link when `public_url` is set. At most one a minute.
- Option names and descriptions in the Configuration tab (`translations/en.yaml`).

## App 1.12.0 — Tank Frenzy v1.12.0

- Computer-controlled bots: the room starter adds or removes up to three bots in the waiting room and sets Easy, Normal or Hard skill.
- Bots use normal player input and rules, aim with skill-based error and target leading, steer around walls, unstick themselves and fetch nearby power-ups.
- People joining a full room replace a bot; bots never own rooms, vote on rematches or keep empty rooms alive.

## App 1.11.0 — Tank Frenzy v1.11.0

- Room browser: saved player name, Quick Play, and one-tap Join on every room row with its players and rules. Round icon buttons for effects and music.
- Kill feed with streak banners, an end-of-match scoreboard (kills, deaths, hit rate) and a low-health heartbeat.
- Rematch needs a majority of connected players instead of everyone; a non-voter leaving can complete it.
- Desktop waiting rooms and battles fit the window. Removed the map label, bottom help cards, footer and masthead slogans.
- Add to Home Screen: web app manifest and icons; landscape lock on Android when fullscreen starts.
- Fix the Room Code pattern, which browsers rejected as invalid. Add `tools/tutorial-screenshots.cjs` and regenerate the tutorial images.

## App 1.10.0 — Tank Frenzy v1.10.0

- Redesign the room browser to fit one screen without scrolling: artwork beside the room panel on wide screens, above it on phones. Only the room list scrolls.
- Turn How to Play into eight pages with Back/Next buttons, page dots, arrow keys and swipes; add a Getting Hit page and split power-ups into tokens and effects.
- Add hit effects: flames around the screen edges, a stronger shake, rising damage numbers, smoke and a shockwave on destruction, vibration on Android and a low-health smoulder.
- Improve touch use: no double-tap zoom on buttons, 40px+ touch targets in the room browser and tutorial.

## App 1.9.0 — Tank Frenzy v1.9.0

- Show the quarry artwork as a large header in the room browser. Forms, waiting rooms and battles now share one compact tagline instead of switching between large and small headers.
- Add a How to Play guide with game screenshots: how to win, PC and phone controls, finding your tank, bouncing bullets and each power-up.
- Draw a thick translucent halo in your color around your own tank.
- Place Leave Room beside Rematch on the result card.
- Enter fullscreen automatically on Create & Join, Join Arena and Start Game where the browser allows it; leaving the room exits fullscreen.
- Serve the six tutorial WebP images through the sidebar and LAN listeners.

## App 1.8.0 — Tank Frenzy v1.8.0

- Show the animated winner card in the arena and require every connected player to vote within 20 seconds for a rematch.
- Keep results open after the deadline, reject new joins to ended rooms, and freeze gameplay while voting.
- Preserve authenticated Home Assistant ingress and LAN multiplayer paths; align app and game versions.

## App 1.7.1 — Tank Frenzy v1.7.1

- Keep the Create and Join forms visible without scrolling on narrow screens. Preserve the tagline in a compact line and hide inactive arena chrome while the form is open.
- Keep the room browser and active game layouts unchanged; retain Home Assistant ingress and LAN multiplayer paths.

## App 1.7.0 — Tank Frenzy v1.7.0

- Match the Home Assistant app and game version numbers.
- Raise music gain to 0.30, loop within the active phrases and preload battle music during the countdown.
- Add separate original MP3s for the 3–2–1 countdown and battle start, served through sidebar and LAN access.

## App 1.1.0 — Tank Frenzy v1.6.0

- Sync the current main-game release, including the approved B pre-game music, random A/C battle music and four selected combat effects.
- Serve seven additional versioned MP3s through both the authenticated sidebar and LAN game, retaining the ingress prefix and WebSocket behavior.
- Remove unrelated project references from the published documentation.

## App 1.0.0 — Home Assistant / Raspberry Pi

- Package Tank Frenzy v1.4.0 for 64-bit Raspberry Pi and AMD64 Home Assistant OS.
- Add repository installation, a multi-architecture Dockerfile, health checks and startup/shutdown handling.
- Support authenticated sidebar access on an internal ingress listener and LAN play on host port 8765.
- Keep assets, sound, room discovery and WebSockets under the ingress prefix; support a configured invitation URL.
- Include installation/update instructions and CI container builds for both architectures.
- Verify 88 automated checks, including mixed ingress/LAN multiplayer. Physical Pi play still requires target-device verification.

## 1.13.0

- 🏆 leaderboard (`/leaderboard`, new `leaderboard.cjs`) and a room-created hook used by the Home Assistant app for notifications.

## 1.12.0

- Bots with three skill levels, controlled from the waiting room. New `bots.cjs`; the room directory lists open seats by people and marks bots.

## 1.11.0

- Quick Play, one-tap Join, remembered name, kill feed and streaks, scoreboard, heartbeat, majority rematch, home-screen app support and a one-screen desktop battle view.
- Destroyed events carry the attacker and streak; snapshots carry shots, hits, streak and the rematch vote target.

## 1.10.0

- One-screen room browser; paged How to Play guide with swipe and arrow keys.
- Fiery screen-edge hit flash, damage numbers, destruction shockwave, Android vibration and low-health smoulder. Hit events now carry their damage.

## 1.9.0

- Large illustrated room-browser header; one compact tagline on every other screen.
- How to Play guide with screenshots of controls, bouncing bullets, power-ups and the win screen.
- Own-tank halo, Leave Room on the result card and automatic fullscreen when joining or starting.

## 1.8.0

- Replace the small bottom victory line with a large centered result card, player outcome, rematch tally and countdown.
- Remove automatic restarts. Only unanimous votes from connected players during the 20-second window launch a new map and round.
- Keep expired results visible until players leave; prevent late joins and freeze movement/aim controls while voting.

## 1.7.1

- Use a dedicated compact phone layout for Create and Join, with the tagline on one line, tighter form spacing and a return to the top of the page.
- Leave the room browser and active game views unchanged.

## 1.7.0

- Raise background music gain from 0.10 to 0.30 and loop its active phrase without replaying the intro or faded ending.
- Select and preload A or C during countdown; play three rising numbered countdown ticks and a separate battle-start recording.

## 1.6.0

- Install the approved Cannon A for normal and machine-gun fire, Ricochet C for bounces, Power-up A for pickups and Destruction C for tank explosions. Keep the previous samples as per-asset fallbacks.
- Preserve double cannon and other unaffected cues, voice limits, spatial playback and mute.

## 1.5.0

- Play B — Overdrive before battles, including waiting and countdown.
- Select A — Iron Advance or C — Steel Pressure locally for each battle; cache decoded tracks and use one looping music source.
- Preserve independent music/effects controls and browser autoplay behavior.

## 1.4.0

### Pickups and aiming

- Aligned pickup artwork with its actual ground position instead of projecting it above the collection center.
- Increased collection radius from 40 to 60 world units for easier approaches from every direction. Nearby pickups cannot be collected through walls.
- Added one local-only dashed aiming centerline from the muzzle for every weapon. Double cannon shells travel parallel on either side. The guide stops at cover or the map edge; it does not predict ricochets or moving-tank collisions.
- Kept the guide hidden during waiting, countdowns, death and results. No aiming messages or server simulation were added.

### Music

- Replaced the simple music loop with an original 16-bar arcade battle arrangement: drums, pulsing bass, sustained chords, brass-style melody and phrase-ending fills.
- Battle music plays at 128 BPM; the splash/waiting arrangement is a calmer 112 BPM. Both remain below sound-effect volume, with independent saved music/effects switches.
- Music still renders once per track locally, then uses one looping source. Two cached mono buffers total about 5.4 MiB; no music downloads or server audio processing are required.

## 1.3.2

- Reduced laser damage from 5 to 4 per hit. A full-health, unprotected tank now survives two laser hits with 2 health and is destroyed by the third.
- Updated the power-up guide, current rules and damage regression tests. Screen shake and other laser behavior are unchanged.

## 1.3.1

### Combat

- Increased active-shell limits by 50%: 24 → 36 per player and 96 → 144 per room. This reduces cap-related firing pauses with bouncing enabled; reload cooldowns and shell lifetimes are unchanged.
- Double cannon now fires two parallel shells from separate barrel origins instead of a spreading volley. Both barrels share the same heading and independently stop spawning forward when obstructed by cover.
- Shared barrel spacing between simulation and tank rendering; updated the power-up guide and current rules.

## 1.3.0

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

## 1.2.0

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

## 1.1.1

### Fixed

- Corrected the SVG viewport for the active-power badge and all six power-guide icons. Symbols were offset into the bottom-right corner and clipped, leaving mostly a colored tile instead of the collected power's shape.
- Explicitly sized each symbol instance so its full shape is centered within the badge. Preserved icon animation and the remaining-time display.

### Documentation

- Added `SOUND_DESIGN.md` to explore a cartoon arcade sound direction. Audio behavior is unchanged in this patch.

## 1.1.0

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

## 1.0.0 — Previous baseline

- Tank Frenzy branding, cartoon battlefield and illustrated lobby, animated power icons and countdowns.
- Menu, round-start, pickup, victory and defeat audio cues; louder destruction effects.
- Free-for-All and 2 vs 2 rooms, room discovery, player previews, and optional bouncing bullets and powers.
- Laser, double gun, speed and machine gun pickups.
- Enemy bullet interception, leave confirmation, and a compact mobile HUD with a following camera and twin-stick controls.
