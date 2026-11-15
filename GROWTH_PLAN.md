# Tank Frenzy growth plan

Prepared 2026-11-15 (Malaysia) against v3.9.1. Goal: more people try the game, and those who try it come back. This plan continues [PROGRESSION_PLAN.md](PROGRESSION_PLAN.md) and keeps its rules: earned coins only, no payments, no paid randomness, no timed offers, no combat advantage from anything a player owns.

Phase 1 is implemented as v3.10.0 on `dev`. Later phases are proposals for the owner to accept, reorder or drop.

## Where the game stood at v3.9.1

Strong already: one tap to play with no sign-up, AI that fills empty seats and adapts to skill, coins and a Garage, a seven-day reward cycle, weekly challenges, a weekly leaderboard with rank movement, invitations by link and QR code, two maps.

Four gaps mattered most:

| Gap | Why it matters |
| --- | --- |
| **Your own tank waited for the server before moving.** Every key press took a full network round trip plus smoothing to show (about 0.1–0.3 s through the tunnel). | In an action game, control response is the first thing a new player feels. A sluggish first ten seconds loses them before any reward system can help. |
| **Nothing grew with every match.** Coins are spent and the daily and weekly goals are finished early in a session. | A level bar that moves after every match is the most reliable "one more game" reason. Goals that are nearly complete pull harder than distant ones. |
| **Good moments passed unmarked.** A bounced kill, a revenge or two quick kills looked the same as any other kill. | Naming a moment makes it memorable and worth telling a friend about. |
| **Sharing was hard and looked poor.** A pasted link showed no picture or title in chat apps, results could not be shared, and inviting meant copying a link by hand. | This game spreads through chat groups. Each share is free advertising, but only if it takes one tap and looks inviting. |

## Constraints that shape every idea

- **Small community, one Raspberry Pi.** Often one to eight people are online. Features must be fun alone against AI and between friends who play at different times. Anything that needs a large live population (ranked queues, clans, lobbies by region) is out.
- **No accounts.** Identity is a private code on the device. Anything social must work without logins.
- **Phones first.** Most players arrive from a chat link on a phone.
- **Honest design.** Engagement should come from mastery, progress and friends. No fear-of-missing-out timers, no punishing a missed day beyond what already exists, no pay-to-win.

## The loop

1. **Arrive**: a chat link with a picture, or a friend's shared result.
2. **First match**: instant controls, a first win against Easy AI, a level-up on the first finished match.
3. **One more**: the level bar is close, a weekly goal is close, a medal was fun.
4. **Come back**: the daily reward, a rank or badge in reach, a friend's challenge.
5. **Bring a friend**: one-tap share of a result or invitation.

## Phase 1: feel, glory and sharing (v3.10.0, implemented on dev)

1. **Instant controls.** The browser moves your own tank the moment you press, using the server's own movement and collision rules, then eases toward the server's position on every snapshot. The server remains the only authority; other tanks, shells, hits and scores are unchanged. Shells now keep moving between the server's 30 updates a second instead of stepping. Measured in a real browser through a delaying relay: key-to-motion about 10 ms at 20, 70, 140 and 240 ms round trips (the server's copy took 45–285 ms), corrections under 0.4 units per frame, exact stops at walls.
2. **Combat medals.** The server awards First Blood, Double Kill, Triple Kill, Revenge, Shutdown, Trick Shot and Clutch at the moment of a kill. Your own medals appear as a banner with a chime; everyone sees a tag in the kill feed; results list them.
3. **Levels and ranks.** Experience for finishing (50), winning (40), kills (6 each, 15 counted), medals (8 each, 10 counted), the first match of the day (30) and consecutive wins (10 per extra win, up to 40). The first finished match always reaches Level 2. Ten ranks from Recruit to Field Marshal. Levels show on the home screen, in lobbies and line-ups, and on results with an animated bar. **Levels pay no coins**, so the existing economy is untouched. Existing players start with experience for matches already played.
4. **More badges.** Twelve instead of three, nine of them with visible progress (for example "Trickster 4 / 10").
5. **Next goal on results.** One line names what is closest: experience to the next level and the nearest unfinished weekly goal.
6. **Sharing.** Shared links show a title, description and picture in chat apps; invitation links preview as "Join my Tank Frenzy arena". Results have **Share result** (the phone's share sheet, or copy) with a short summary. The invitation dialog offers the share sheet too.

Same eligibility as coins throughout: standard rules, taking part, staying to the end. Practice, vehicle tests, idling and leaving earn nothing, and leaving a standard match ends a win streak.

## Phase 2: reasons to return and to invite (proposed)

1. **Daily missions.** Three small goals a day, the same for everyone, picked by date from a pool (destroy 8 tanks, collect 3 power-ups, earn a medal, win in 2 vs 2). Reward mainly experience. Short, varied, and a shared topic ("did you get today's three?").
2. **Invite rewards.** A personal invite link. When a new player finishes their first standard match, both get coins (suggested 100 for the inviter, 50 for the newcomer, at most ten rewarded invites). This is the one mechanic that directly rewards spreading the game. Needs an economy decision.
3. **Weekly champion.** Last week's number one wears a crown beside their name for the following week. Costs nothing, and in a small community everyone knows who it is.
4. **Rivalries.** Head-to-head records against people you have played ("You 5 – 3 Aiman"), and your most frequent opponent on your profile. Friend groups care more about each other than about a global board.

## Phase 3: variety and events (proposed)

1. **Seasons.** A monthly free reward track fed by experience, with rank-exclusive skins that cannot be bought. Gives levels a tangible reward without changing coin prices.
2. **Rotating weekend mode.** One rule twist each weekend (lasers only, one-hit tanks, king of the hill). Novelty on a schedule, using existing mechanics.
3. **Daily challenge.** One solo run a day on the same map and AI for everyone, with its own daily board and a shareable score. Suits a small community because nobody needs to be online together.
4. **Party tournament.** A host enters names, the game runs rounds of four and keeps a table. Aimed at office and family sessions like the 19-person group.
5. **More maps and power-ups**, following the existing map-variety approach.

## Phase 4: later (proposed)

Opt-in browser notifications for the daily reward and friend invitations; watching a friend's match from the lobby; short replays of medal moments to share.

## Decisions for the owner

- Whether levels should ever pay coins. Phase 1 says no, to protect prices set in PROGRESSION_PLAN.md.
- Invite reward amounts and cap (Phase 2, item 2).
- Whether rank-exclusive skins are acceptable alongside purchasable ones (Phase 3, item 1).
- Promotion of v3.10.0 to production after playing it on the dev app, especially the new controls on a real phone over the tunnel.

## What to watch

The admin page already reports second-match, next-day and day-7 return. After v3.10.0, compare those with the weeks before it. The game has no external analytics, so shares and link previews cannot be counted; new profiles per week is the nearest signal.

Not yet verified on real hardware: control feel on phones over the Cloudflare tunnel, and link previews in WhatsApp and Telegram (they need `public_url`, or the tunnel's forwarded-protocol header, to build absolute addresses).

## Sources

- Gabriel Gambetta, [Client-Side Prediction and Server Reconciliation](https://gabrielgambetta.com/client-side-prediction-server-reconciliation.html) and [Entity Interpolation](https://gabrielgambetta.com/entity-interpolation.html): the standard technique behind item 1.
- Allcorrect, [From High Score Tables to Battle Passes](https://allcorrectgames.com/insights/from-high-score-tables-to-battle-passes-the-evolution-of-player-retention/): daily goals feeding a visible progress track.
- Smithsonian Magazine, [Here's Why the Word Game Wordle Went Viral](https://www.smithsonianmag.com/smart-news/heres-why-the-word-game-wordle-went-viral-180979439/): frictionless play and a one-tap, spoiler-free result to share.

These are design write-ups, not measured retention data for small browser games; no such data was found. The effect on this game has to be observed on the dev and production apps.
