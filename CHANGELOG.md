# Changelog

App package versions follow `config.yaml`. Game versions below follow `shared.js`, `package.json` and `package-lock.json`.

## App 1.0.0 — Home Assistant / Raspberry Pi

- Package Tank Frenzy v1.4.0 for 64-bit Raspberry Pi and AMD64 Home Assistant OS.
- Add repository installation, a multi-architecture Dockerfile, health checks and startup/shutdown handling.
- Support authenticated sidebar access on an internal ingress listener and LAN play on host port 8765.
- Keep assets, sound, room discovery and WebSockets under the ingress prefix; support a configured invitation URL.
- Include installation/update instructions and CI container builds for both architectures.
- Verify 88 automated checks, including mixed ingress/LAN multiplayer. Physical Pi play still requires target-device verification.

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
