# Tank Frenzy

A playful, browser-based tank arena with chunky toy tanks, a sunny cartoon quarry, rounded menus and bold lettering. Choose Free-for-All or 2 vs 2 and invite your friends.

Current release: **v1.4.0**, also shown in the bottom-right corner of the main room browser. See [CHANGELOG.md](CHANGELOG.md) for release notes. Keep the version in `shared.js`, `package.json`, and `package-lock.json` synchronized when releasing changes.

See [SOUND_DESIGN.md](SOUND_DESIGN.md) for the approved cartoon arcade audio direction and implementation notes.

## Public Game

Play online at https://tank-frenzy.onrender.com/ to browse active rooms or create a new room. Select a room to preview player names and available spots before joining. The list refreshes every five seconds; reconnecting players keep their reserved spots briefly, and full rooms remain visible but cannot be joined.

Room links such as https://tank-frenzy.onrender.com/?room=QUARRY still open the join form with that code prefilled. Creating a room checks that its code is unused; rooms exist while players are present and disappear after everyone leaves (or their reconnection reservations expire).

After creating a room, everyone sees a waiting-room player list. Only the creator can press **Start Game**. If that player leaves or disconnects before starting, the first remaining connected player gets the button. Reconnecting does not take it back. After the first start, there is no owner; rounds restart automatically. Room rules remain fixed.

Every round begins with a shared **3–2–1** countdown in the center of the field. The server freezes movement, aiming, firing and pickups until it ends. Late joins during a running round are allowed.

## Host

Run `npm install` once, then `npm start` in this folder (Node.js 18 or later).
Open http://localhost:8765. The terminal also prints the host's network addresses.
Keep the server running during play. Stop it with Ctrl+C.

## Join

Each player opens the host's address in a separate tab, browser, or device, enters a name, and joins the same room code. Two to four players can battle in a room; the creator can start a solo practice match. Different room codes create separate matches. The Copy Invite button includes the room code.

On other devices, use the host's LAN address, not localhost. Both devices must be able to reach each other on the network. If Windows prompts for Node.js network access, allow it on your trusted private network. No firewall rules are changed by this project. For public Internet play, use the deployed URL above.

Maps are 1600 by 1040 world units (about 2.5 times the previous area). Each room gets a random map, regenerated for every new match. Clear spawn zones and connected lanes keep the arena traversable. All players receive the same map from the server.

## Controls and Rules

- Choose **Free-for-All** (every player is an opponent) or **2 vs 2** on the illustrated room browser. Teams are automatically balanced, reconnecting spots stay reserved, and teammates cannot damage or intercept each other's shots. First player/team to ten kills wins. After pressing Start Game, you can practice while waiting for more players.
- The first player creating a room chooses its mode, **Bullet bouncing** and **Super powers**; both switches default to on. Rules stay fixed for that room. With bouncing off, shells disappear on walls and arena edges. Laser beams stop at cover regardless of the bounce setting.
- Random pickups grant **10 seconds** of laser, double cannon, speed (+60% movement), machine gun, or **Immortal**. A new timed pickup replaces your current power; death and a new match clear it. **Immortal** uses a star icon and prevents all incoming shell/laser damage, while you can still move and fire. Enemy shells are absorbed; enemy lasers stop at your tank. **Restore** uses a red heart and immediately refills health to 10, preserving any active timed power and its remaining duration. It does not create a timed health effect or overheal.
- Bobbing icon tokens mark pickups. The HUD uses a matching animated icon, seconds remaining and a shrinking timer bar; the room browser's **Power-up guide** explains the symbols. Immortal has orbiting stars, and Restore briefly displays a heart when collected. Reduced-motion settings disable decorative movement. Pickups start after six seconds, then at most one appears every twelve seconds; they expire after twenty seconds, with at most two on the field.
- **Laser** deals 4 damage, destroys all enemy shells intersecting the beam before its impact point, and stops at the first enemy tank, wall or arena boundary. It cannot shoot through a tank, even when that tank has a spawn shield or Immortal. In 2 vs 2, shells and lasers pass through teammates and their bullets. The beam starts at the visible muzzle; nearby cover clips it so a barrel pressed against a wall cannot shoot through the wall.
- **Leave Room** asks for confirmation; cancelling keeps you in the match. Browsers may also show their standard warning when closing or refreshing during play (mobile browser behavior varies). Tank destruction has a louder bass impact; Effects Off still mutes it.

- Phones and tablets with a primary touch input show two thumb controls after joining: drag the left stick to move and the right stick to aim and fire. Release to stop. Mouse/keyboard browsers keep the desktop controls, even in a narrow window.
- During touch play, the arena fills the available browser height. A single 44px top row shows the room, your name and health, and **Menu**. Open Menu for fullscreen, invite, leave, separate music/effects switches and view controls. A close camera follows your tank so tanks and nearby cover stay large. Choose **Full Map** for an overview and **Close View** to return; this changes only your view, not movement, aiming, or the shared map. Landscape gives you a wider view. Leaving the room restores the page.
- Full Screen expands the arena on desktop and mobile. Where browser fullscreen is unavailable or rejected, it falls back to an expanded view inside the browser; browser bars may remain visible. Use Exit Full Screen to return. Landscape is recommended on phones.
- W/A/S/D: move up/left/down/right along the unrotated map axes, including diagonal movement.
- Audio: hear your own and opponents' shots. Normal and machine-gun fire share the same cannon sound (machine gun repeats it faster and slightly quieter). **Double cannon** plays paired pops. All collected powers use the same warm chime. Nearby combat is clearer, with subtle stereo positioning that also works on mono phone speakers.
- The approved cartoon samples add explosions, pings, zaps, menu, start, victory and defeat cues. The 170 KiB sound asset downloads and decodes once, with bounded synth fallbacks while loading. Effects are limited to 12 sample voices, with priority for result cues.
- Original 16-bar arcade battle music combines drums, pulsing bass, sustained chords and a brass-style melody with phrase-ending fills. The battle arrangement is 128 BPM; splash/waiting music is a calmer 112 BPM. **Music** and **Effects** switches in the top menu operate independently and remember preferences on that browser when storage is available. Music stays lower than effects. Audio starts after the first tap or keypress; hidden pages stop music and effects, and music resumes on return if enabled. Leaving returns to splash music.
- Music is composed into two reusable mono buffers on the player's device, then played with a single looping source. There are no music downloads, server music timers, audio streams or added game-simulation work. About 5.4 MiB of decoded music is cached in browser memory after both tracks have played.
- Pickup icons are centered on their ground coordinates. A forgiving **60-world-unit collection radius** works equally from above, below and the sides; a wall between the tank and pickup blocks collection. Cosmetic bobbing does not move the actual collection area.
- A single dashed **aiming centerline** extends from your muzzle toward the first wall or map edge. It follows mouse or thumb-stick aiming, is visible only to you and uses no additional network traffic. It shows initial direction, not ricochets or predicted moving-tank hits. Double cannon's parallel shells straddle this centerline.
- **Double cannon** fires two side-by-side shells in the same direction, aligned with its two barrels. Each barrel separately respects nearby cover.
- Each player can have up to **36 active shells**, with **144 per room** (50% more than before). Reaching either limit pauses new shots until room becomes available. Double cannon needs two free slots per volley. Bouncing shots stay active longer; normal and double-cannon reload remains 0.42 seconds, machine gun 0.12 seconds.
- Shell range covers the full map diagonal, and shots into nearby cover ricochet from the barrel's last clear point.
- Opposing shells destroy each other on contact with a spark and impact sound. You can shoot down incoming fire; your own shells pass through one another. Shell interceptions do not award kills or damage nearby tanks.
- Mouse pointer: aim the turret independently of movement.
- Left click: fire. Hold to keep firing, with a 0.42-second cooldown between shots.
- Tanks have **10 health**: ten normal shells or three unprotected laser hits destroy a full-health tank. Respawn takes three seconds and restores all 10 health. Five compact health pips each represent two health; half pips show odd health values without widening the mobile header.
- Mid-match joins and respawns have three seconds of protection, even while moving and firing. Protected tanks slowly fade in/out; the ten-second Immortal power uses the same effect. Reduced-motion mode uses steady translucency.
- First to ten kills wins; after the ten-second results screen, the next match starts automatically with another three-second countdown.
- Leaving the tab stops your controls, but other players keep playing.
- A brief connection loss reserves your tank for 15 seconds and reconnects automatically. Reloading or leaving creates a new player session.

The server owns movement, collision, firing cooldowns, health, scoring, and respawns. Browsers send input over WebSocket and render shared snapshots. No user accounts or database are required; match state resets when the server stops.

## Checks

Run `npm test` for simulation and real WebSocket integration checks.

Server work is bounded: at most 144 active shells per room / 36 per player, two pickups, and four players. Machine gun cooldown is 0.12 seconds; laser traces cover and tanks, then checks at most 144 shells per shot (0.8-second cooldown). Immortal adds a damage guard; Restore assigns maximum health once when collected. Neither adds timers or background jobs. Beam animation and particles are drawn only in the browser. The menu artwork is cached separately and is never sent in game snapshots. These limits keep the additions modest for small rooms; actual hosting capacity depends on concurrent rooms and the server plan.

Rendering, icon/fade animation, countdown display and audio playback run in each browser. Waiting/countdown phases and start authorization use the existing server tick and snapshot; no extra simulation timers are added. Waiting rooms skip combat simulation. The Start Game command is checked against the connected starter on the server. The tank collision shapes, aiming and compact 44px touch header are unchanged.

Menu artwork: `mode-banner.webp`, generated with the built-in image tool and compressed for mobile loading. Prompt: friendly, chunky cartoon toy tanks in a sunny quarry, orange/green facing blue/purple, warm cream/sage colors, wide composition, no text or logos.
