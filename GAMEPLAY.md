# Tank Frenzy

A playful, browser-based tank arena with chunky toy tanks, a sunny cartoon quarry, rounded menus and bold lettering. Choose Free-for-All or 2 vs 2 and invite your friends.

Current release: **v1.14.0**, also shown in the top-left corner of the room browser artwork. See [CHANGELOG.md](CHANGELOG.md) for release notes. The version appears in several files; follow the release checklist in [CLAUDE.md](CLAUDE.md).

See [SOUND_DESIGN.md](SOUND_DESIGN.md) for the approved cartoon arcade audio direction and implementation notes.

## Rooms

Open the game's address (in the Home Assistant app: `http://YOUR_PI_IP:8765`, the sidebar, or your `public_url` such as a Cloudflare Tunnel address) to browse active rooms or create a new room. Select a room to preview player names and available spots before joining. The list refreshes every five seconds; reconnecting players keep their reserved spots briefly, and full rooms remain visible but cannot be joined.

Room links such as `https://your-game-address/?room=QUARRY` open the join form with that code prefilled. Creating a room checks that its code is unused; rooms exist while players are present and disappear after everyone leaves (or their reconnection reservations expire).

The room browser has a **Your name** box (remembered on this device and shared with the Create/Join form), **⚡ Quick Play**, **Create Room** and a refresh button. Every room row shows its players and rules with its own **Join** button, so one tap joins. Quick Play joins a waiting room in the chosen mode first, then the fullest open room, and creates a new room when none is open. Full rooms and ended matches show **FULL** or **ENDED**. Effects and music are the round 🔊/🎵 buttons in the panel corner.

Desktop waiting rooms and battles fit the window without scrolling: the brand, tagline and How to Play share one slim row above the arena.

The room browser fits on one screen without scrolling: the quarry artwork with “Small tanks. Big rivalries.” and a **How to Play** button sits beside the room panel on wide screens and above it on phones. Only the room list scrolls, inside its own box, when many rooms are open. Create/Join, waiting rooms and battles show the same tagline in one compact line. On narrow screens the Create/Join form keeps its room rules and submit button visible without the arena header or controls taking space.

**How to Play** is an eight-page guide with game screenshots: how to win, PC controls, phone controls, finding your tank, getting hit, bouncing bullets, power-up tokens and power-up effects. Turn pages with the **Back**/**Next** buttons, the page dots, the ← → keys or a horizontal swipe; the last page's button closes it. Escape, Close or a tap outside also closes it. Each page fits without scrolling.

**Leaderboard:** the 🏆 button beside How to Play shows the top ten by wins, then kills, for **Today**, **This week** (Monday to Sunday), **This month** or **All time**, with wins, matches, kills and kills per death. The **Region** menu filters by the country Cloudflare reports for each player (shown as a flag); players reached without Cloudflare, or whose country is unknown, appear only under All regions. Every finished match counts once for each person in it (bots are not ranked); in 2 vs 2 the whole winning team gets the win. Names are matched regardless of capitals. The Home Assistant app saves it on the Pi (see DOCS.md); the standalone server keeps it until it restarts.

**Admin:** a private admin page (at `/admin`, or the address you set with `admin_path`) shows every room at once: a live mini-map, phase, mode, time, each player's kills, deaths, health and country, plus server CPU, memory, load and uptime, refreshed twice a second (about 9 KB and under 1 ms of server time per refresh with five busy rooms, and nothing when the page is closed). Nothing in the game links to it. **👁 Watch live** opens the real match view in a new tab as a hidden spectator: spectators are never added to the room, its player count, the room list or the snapshots players receive, cannot send input or join, and see "👁 WATCHING (HIDDEN)" with a **Stop watching** button. Watch passes last ten minutes and are removed from the address bar once used. **End room** sends everyone in it, spectators included, back to the room browser.

**Network:** each snapshot is encoded once per room and sent to its players 30 times a second, with positions rounded to a tenth of a unit, only the shell fields the browser draws, and the map resent once a second or when it changes. In a 19-player test with everyone firing constantly this cut traffic from about 2.4 to 0.7 Mbit/s per player.

**Bots:** in the waiting room the room starter can **Add bot** (up to four tanks in total), **Remove bot**, and set **Bot skill** to Easy, Normal or Hard. Bots are named with 🤖, drive and aim through the same controls and rules as players, pick up nearby power-ups, steer around cover and shoot at the nearest enemy they can see. Harder bots react faster, aim more precisely and lead moving targets. A person joining a full room takes a bot's seat, so rooms list open seats by people only. Bots never start games, vote on rematches or keep a room open: they leave when the last person does.

After creating a room, everyone sees a waiting-room player list. Only the creator can press **Start Game**. If that player leaves or disconnects before starting, the first remaining connected player gets the button. Reconnecting does not take it back. After the first start, there is no owner. Room rules remain fixed.

Every round begins with a shared **3–2–1** countdown in the center of the field, with one rising audio tick per number and a separate battle-start sound when play begins. The server freezes movement, aiming, firing and pickups until it ends. Late joins during a running round are allowed.

## Host

Run `npm install` once, then `npm start` in this folder (Node.js 18 or later).
Open http://localhost:8765. The terminal also prints the host's network addresses.
Keep the server running during play. Stop it with Ctrl+C.

## Join

Each player opens the host's address in a separate tab, browser, or device, enters a name, and joins the same room code. Two to four players can battle in a room; the creator can start a solo practice match. Different room codes create separate matches. The Copy Invite button includes the room code.

On other devices, use the host's LAN address, not localhost. Both devices must be able to reach each other on the network. If Windows prompts for Node.js network access, allow it on your trusted private network. No firewall rules are changed by this project. For public Internet play, put the game behind an HTTPS tunnel or reverse proxy with WebSockets enabled (see DOCS.md).

Maps are 1600 by 1040 world units (about 2.5 times the previous area). Each room gets a random map, regenerated for every new match. Clear spawn zones and connected lanes keep the arena traversable. All players receive the same map from the server.

## Controls and Rules

- Choose **Free-for-All** (every player is an opponent) or **2 vs 2** on the illustrated room browser. Teams are automatically balanced, reconnecting spots stay reserved, and teammates cannot damage or intercept each other's shots. First player/team to ten kills wins. After pressing Start Game, you can practice while waiting for more players.
- The first player creating a room chooses its mode, **Bullet bouncing** and **Super powers**; both switches default to on. Rules stay fixed for that room. With bouncing off, shells disappear on walls and arena edges. Laser beams stop at cover regardless of the bounce setting.
- Random pickups grant **10 seconds** of laser, double cannon, speed (+60% movement), machine gun, or **Immortal**. A new timed pickup replaces your current power; death and a new match clear it. **Immortal** uses a star icon and prevents all incoming shell/laser damage, while you can still move and fire. Enemy shells are absorbed; enemy lasers stop at your tank. **Restore** uses a red heart and immediately refills health to 10, preserving any active timed power and its remaining duration. It does not create a timed health effect or overheal.
- Bobbing icon tokens mark pickups. The HUD uses a matching animated icon, seconds remaining and a shrinking timer bar; the **How to Play** guide explains each symbol. Immortal has orbiting stars, and Restore briefly displays a heart when collected. Reduced-motion settings disable decorative movement. Pickups start after six seconds, then at most one appears every twelve seconds; they expire after twenty seconds, with at most two on the field.
- **Laser** deals 4 damage, destroys all enemy shells intersecting the beam before its impact point, and stops at the first enemy tank, wall or arena boundary. It cannot shoot through a tank, even when that tank has a spawn shield or Immortal. In 2 vs 2, shells and lasers pass through teammates and their bullets. The beam starts at the visible muzzle; nearby cover clips it so a barrel pressed against a wall cannot shoot through the wall.
- **Leave Room** asks for confirmation; cancelling keeps you in the match. Browsers may also show their standard warning when closing or refreshing during play (mobile browser behavior varies). Tank destruction has a louder bass impact; Effects Off still mutes it.

- Phones and tablets with a primary touch input show two thumb controls after joining: drag the left stick to move and the right stick to aim and fire. Release to stop. Mouse/keyboard browsers keep the desktop controls, even in a narrow window.
- During touch play, the arena fills the available browser height. A single 44px top row shows the room, your name and health, and **Menu**. Open Menu for fullscreen, invite, leave, separate music/effects switches and view controls. A close camera follows your tank so tanks and nearby cover stay large. Choose **Full Map** for an overview and **Close View** to return; this changes only your view, not movement, aiming, or the shared map. Landscape gives you a wider view. Leaving the room restores the page.
- Pressing **Create & Join**, **Join Arena** or **Start Game** puts the arena in fullscreen automatically where the browser allows it (iPhone Safari does not; touch play still fills the browser view). Leaving the room exits fullscreen.
- Getting hit flares flames around the screen edges and shakes the view, harder for a laser or when destroyed. A −1/−4 damage number rises above every tank that takes damage, and destroyed tanks throw smoke and a shockwave ring. Android phones vibrate on your own hits (Effects Off disables it). At 3 health or less the edges keep smouldering until you heal or respawn. Reduced-motion settings keep the flames still and skip the shake.
- Every destruction appears for a few seconds in a kill feed at the top right ("Alice 💥 Bo"; your own kills and deaths are outlined). Three kills in a row without being destroyed shows "… is on fire! 🔥", five "… is unstoppable! ⚡", seven "… is a tank legend! 👑". Streaks reset when you are destroyed and on a rematch.
- At 3 health or less a soft heartbeat plays with the smouldering screen edges (Effects Off mutes it).
- Your own tank has a thick translucent halo in your color, plus a ★ after your name, so you can find it at a glance.
- Full Screen expands the arena on desktop and mobile. Where browser fullscreen is unavailable or rejected, it falls back to an expanded view inside the browser; browser bars may remain visible. Use Exit Full Screen to return. Landscape is recommended on phones.
- W/A/S/D: move up/left/down/right along the unrotated map axes, including diagonal movement.
- Audio: hear your own and opponents' shots. Normal and machine-gun fire use approved **Cannon A** (machine gun repeats it faster and slightly quieter). **Double cannon** keeps its distinct paired pops. All collected powers use approved **Power-up A**. **Ricochet C** and **Destruction C** play for bullet bounces and tank explosions. Nearby combat uses subtle stereo positioning that also works on mono phone speakers.
- Other cues—laser, hits, interceptions, menus, victory and defeat—keep their existing recordings. The four approved battlefield MP3s total about 45 KiB, and the separate countdown/start recordings add about 33 KiB alongside the original 170 KiB pack. They download and decode locally once, with bounded fallbacks while loading. Effects remain capped at 12 sample voices, with priority for result cues.
- Approved MP3 soundtrack: **B — Overdrive** plays on the splash screen, in waiting rooms and during the countdown. Each battle randomly chooses **A — Iron Advance** or **C — Steel Pressure** on each player's device; consecutive rounds may choose the same track. The choice survives music toggles and tab hiding within that round. Tracks loop on their 12-bar phrase, skipping the intro silence and ending fade so playback stays continuous. The upcoming battle track downloads during the countdown when music is enabled.
- **Music** and **Effects** switches operate independently and remember preferences where browser storage is available. Music gain is 30% (raised from 10%); effects retain their separate levels. Audio begins after the first tap or keypress; hidden pages stop audio, and music restarts the selected track on return if enabled. Leaving returns to B.
- The three original stereo MP3s total about 1.97 MB, downloaded only when needed and served with immutable browser caching. At most three decoded buffers and one looping source are kept locally (about 28–32 MB of decoded samples at common browser sample rates). The server only serves static files: there are no music streams, playback timers, synchronization messages or extra simulation work.
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
- First to ten kills wins. A large animated result card appears over the field and combat stops. The card lists every player's kills, deaths and hit rate (hits divided by shells and laser shots fired this match). Players choose **Rematch** within 20 seconds, or **Leave Room** right beside it (no confirmation needed once the round is over). A majority of connected players starts the next three-second countdown: both of two players, two of three, three of four. If a player who has not voted leaves, the remaining votes can complete the majority. If the vote expires, the room stays open with its result displayed until everyone leaves; it remains listed but cannot be newly joined. Start or join another room for a new battle. Late joiners during the vote can participate. Disconnecting players cannot vote, and their votes are not required until they reconnect.
- Leaving the tab stops your controls, but other players keep playing.
- A brief connection loss reserves your tank for 15 seconds and reconnects automatically. Reloading or leaving creates a new player session.

The server owns movement, collision, firing cooldowns, health, scoring, and respawns. Browsers send input over WebSocket and render shared snapshots. No user accounts or database are required; rooms and match state reset when the server stops (only the leaderboard is saved, and only in the Home Assistant app).

## Checks

Run `npm test` for simulation and real WebSocket integration checks.

Server work is bounded: at most 32 rooms, and per room 144 active shells / 36 per player, two pickups, and four players. Machine gun cooldown is 0.12 seconds; laser traces cover and tanks, then checks at most 144 shells per shot (0.8-second cooldown). Immortal adds a damage guard; Restore assigns maximum health once when collected. Neither adds timers or background jobs. Beam animation and particles are drawn only in the browser. The menu artwork is cached separately and is never sent in game snapshots. These limits keep the additions modest for small rooms; actual hosting capacity depends on concurrent rooms and the server plan.

Rendering, icon/fade animation, countdown display and audio playback run in each browser. Waiting/countdown phases and start authorization use the existing server tick and snapshot; no extra simulation timers are added. Waiting rooms skip combat simulation. The Start Game command is checked against the connected starter on the server. The tank collision shapes, aiming and compact 44px touch header are unchanged.

Menu artwork: `mode-banner.webp`, generated with the built-in image tool and compressed for mobile loading. Prompt: friendly, chunky cartoon toy tanks in a sunny quarry, orange/green facing blue/purple, warm cream/sage colors, wide composition, no text or logos.
