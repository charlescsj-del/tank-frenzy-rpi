# Vehicle classes: balancing and execution proposal

Prepared 2026-10-21 (Malaysia), against dev v3.8.3 (`6be95012`). This document completes the design step for progression Phase 8, item 7. The values below are starting hypotheses for a dev pilot, not measured balance results. Gameplay implementation and the production release are subsequent steps.

## 1. Player experience and starting values

Offer three free vehicle classes with distinct trade-offs. Standard is the default and preserves the current tank. Every player can select every class immediately. Earned coins continue to buy permanent cosmetic skins, and every owned skin works on every class. Class selection adds no required step before Play, Create arena or Join with code.

| Class | Health | Movement, world units/s | Change from Standard | Normal/double reload | Player-facing description |
| --- | ---: | ---: | --- | ---: | --- |
| Standard | 10 | 170 | Current baseline | 0.42 s | Balanced and easy to learn. |
| Scout | 8 | 204 | 20% faster; 20% less health | 0.42 s | Move fast. Stay out of the firing line. |
| Heavy | 12 | 145 | About 15% slower; 20% more health; about 14% longer reload | 0.48 s | Take more hits. Choose your shots. |

All use shell damage 1, laser damage 4, shell speed 410, the existing 26-unit wall/projectile collision radius, existing tank separation, 40-unit muzzle distance, 3-second respawn and 3-second respawn shield. Aim response, pickup reach, projectile limits, ricochet rules and scoring are shared. Health is explicit integer capacity; skins never supply resistance, damage or movement modifiers.

Scout should reward positioning and dodging. Heavy should reward holding cover and surviving an exchange, with slower repositioning and firing. Standard should remain a competitive, predictable choice. These are intended roles, not claims that the proposed numbers already achieve them.

## 2. Weapon and power-up interactions

Use the class's normal reload divided by 0.42 as its reload multiplier. Apply that multiplier to every firing mode, including Machine Gun and Laser. Standard and Scout use 1; Heavy uses 8/7. This prevents a weapon pickup from silently removing Heavy's firing trade-off. Store exact values in the class definition; round only displayed labels. Simulation remains quantized to 120 Hz.

| Power | Proposed rule | Standard / Scout | Heavy |
| --- | --- | --- | --- |
| Speed | Class movement multiplied by the existing 1.6 | 272 / 326.4 units/s | 232 units/s |
| Double Cannon | Two parallel 1-damage shells; class normal reload | 0.42 s | 0.48 s |
| Machine Gun | Existing 0.12 s interval times class reload multiplier | 0.12 s | About 0.137 s |
| Laser | Existing 0.8 s interval times class reload multiplier; 4 damage | 0.8 s | About 0.914 s |
| Shield | Existing complete protection, with the same duration for all classes | Existing duration | Existing duration |
| Restore | Fill to the current class maximum, retaining an existing timed power | 10 / 8 health | 12 health |

Power duration, replacement, spawn timing and availability follow current room rules. There is no special damage multiplier by class. Heavy's larger Restore value is part of its health trade-off and needs playtesting alongside its slower movement.

### Damage thresholds to examine first

| Full-health target | Ordinary shell hits | Full double volleys, if both shells land | Laser hits |
| --- | ---: | ---: | ---: |
| Standard | 10 | 5 | 3 |
| Scout | 8 | 4 | 2 |
| Heavy | 12 | 6 | 3 |

Scout's two-laser threshold is the main initial concern. Watch repeated laser deaths, escape opportunities and player frustration. If it overwhelms the mobility benefit, test Scout at 9 health before changing laser damage for every class. Change one balance variable at a time and give every tested definition a balance revision.

For a standing exchange with the first hit at time zero, continuous perfect hits, no protection and no travel delay, nominal shell kill time is `(target health - 1) × attacker reload`:

| Attacker | Standard target | Scout target | Heavy target |
| --- | ---: | ---: | ---: |
| Standard / Scout | 3.78 s | 2.94 s | 4.62 s |
| Heavy | 4.32 s | 3.36 s | 5.28 s |

Heavy would beat Standard in this ideal simultaneous exchange: 4.32 versus 4.62 seconds. Standard would beat Scout in the same stationary setup. That makes movement, cover and hit rate central to the comparison. These calculated intervals exclude firing-tick rounding, projectile travel, shields, misses, collisions and network delay; they are diagnostic calculations, not measured match durations or proof of fairness.

## 3. Selection, readability and number of clicks

- Add an optional **Vehicle** section in the existing Garage, alongside the paint collection. Three cards show a preview, health, relative speed and reload. Selecting a class saves it directly; there is no purchase or additional confirmation. A failed save keeps the previous selection and shows a retry message.
- Keep the current skin selected when changing class. Retain every owned skin and both Originals/Showcase collections. Preview the selected class with the equipped paint, using equal apparent hull footprints and recognizable turret details. Keep slot bands, team markers, own-tank halo, aiming geometry and touch controls visible.
- Remember the vehicle preference with the private player profile, including recovery on another device. Standard is used for an older or unknown preference. Play/Create/Join continue immediately with the saved preference.
- Identify the actual class on the existing player-lineup/waiting card. Do not add a large class panel over the map. Show actual health capacity under enemy tanks; keep the player's health bar within its current width, with 4/5/6 two-health pips for Scout/Standard/Heavy and useful accessible labels.
- Update Restore help, the current “every tank has 10 health” tutorial copy, health ratios and low-health effects. A low-health threshold of `hp / classMaxHealth <= 0.30` is proposed for flames/heartbeat; avoid treating 3 health as the same fraction for every class. Test all three at phone widths.
- Keep the Garage's fixed Back header, fullscreen behavior, portrait preview reveal and compact landscape preview. Test desktop landscape, phone portrait/landscape and keyboard navigation with class and paint selected independently.
- Add an optional **Change tank** link inside finished results content. It opens the Garage and returns to the same leaderboard, preserving the existing rematch timer. Label a saved change **Next match**; the completed round keeps its actual class. The ordinary Find new match and rematch actions retain their current clicks.

## 4. Selection lock and match lifecycle

The server resolves the actual class when accepting an arena membership, using the room's rules and the saved profile preference. It stays locked through waiting/searching, lineup, field countdown, play and respawns. Reconnect restores that same class. Reject class edits in these phases with “Change vehicle after this match.” Validate phase and class ID before committing a preference change.

Allow preference changes outside an arena or in results/postgame. A successful results change affects the next round or queue, never the finished scoreboard, health or historical statistics. At the next round boundary, resolve the preference again before spawning and starting the shared countdown. If a rematch starts before a save is accepted, reject that save cleanly; never partially change the tank. Close a results-opened Garage when the field countdown begins so the shared 3-2-1 remains visible and controls resume on the field. Cosmetics and class preferences remain separate.

Group requeue carries each consenting player's saved preference into the destination's permitted rules. A normal Quick Play destination uses Standard during the pilot, even when someone has a Scout preference. Preserve that preference for the next vehicle-enabled arena. Joining a departed human seat during an active test round resolves a class once and observes the same lock; nobody replaces AI. Spectators cannot select a class, occupy a seat or affect the match.

## 5. Dev pilot and ranking boundaries

Start with a proposed `vehicle_classes_enabled` host option, false by default. When enabled on dev, allow an explicit **Vehicle test** room rule only for private friend arenas. The room must clearly display **Vehicle test · Practice · No coins or rankings** in its existing rules/lineup/results text. Disable public listing for these rooms; invitations still work. All three classes are available equally to humans and AI.

During this pilot, public Quick Play and ordinary friend arenas keep Standard and the current rewards/ranking rules. Vehicle-test rounds produce their normal in-room final scoreboard and authenticated admin match history, but do not affect public ranking totals, difficulty adaptation, coins, daily/weekly progress, achievement badges, personal reward records or retention cohorts. Regular solo-vs-AI rounds continue counting normally.

Implementation must separate recording a completed history row from updating public rankings. Exclude test rows from all-time updates, day/week/month aggregation and the recent-match calculation in `Leaderboard.skill()`. Keep result delivery useful when a ranked position is absent. Reward eligibility must explicitly reject the test ruleset, including delayed retries. Use `ruleset` and `balanceRevision` tags rather than relying on health or skin IDs to infer eligibility.

After human and hardware review, decide whether to enable classes in normal matches as a subsequent dev change. That decision includes normal coin/ranking eligibility and the initial Quick Play default. Keep one Quick Play queue per existing mode; do not create a permanent separate queue for each class. Production promotion remains a reviewed PR with the production Home Assistant identity retained.

## 6. Server, persistence and compatibility work

| Area | Planned implementation |
| --- | --- |
| Shared definitions | Add three immutable class definitions and a safe resolver, with Standard fallback. Cache effective server stats at the round boundary. Keep all skin definitions cosmetic. |
| Permanent profile | Add one selected-vehicle ID to the existing progress file and private owner response, with a Standard default for older records. Atomic save/recovery preserves wallet, inventory, streaks, credited rounds and weekly history. |
| Protocol | Accept only an allowlisted class ID through an authenticated preference action. Ignore client-supplied health, speed, damage or reload values. Publish the actual non-default class ID with existing player snapshots; derive maximum health/visuals from shared definitions. Add no new per-tick messages. |
| Room state | Keep an explicit immutable test rule and round balance revision. Apply class rules to spawn, Restore, movement, every firing mode and reconnect. Keep results metadata tied to the completed round. |
| Bots | Use the same server stats and input path as humans. Assign classes by a repeatable rotation in the test room, independently of difficulty. Existing aim prediction already observes recent target movement; test fast-target tracking and every class's wall navigation. |
| History/admin | Tag retained test rows with ruleset, balance revision and map layout; include actual class on human/bot detail rows. Expose those tags to the authenticated history view. Preserve existing history retention/detail limits and profile privacy. Keep bot simulation reports separate from human play results. |
| Client | Resolve class for portraits, gameplay art, actual health capacity, roster rebuild signatures, lineup/results signatures and low-health feedback. Admin health/portraits, tutorial help and the first-match guide must agree. |
| Old browser builds | A vehicle-test join must declare support for that ruleset revision. Reject an unsupported test join with a Reload message before creating membership; ordinary Standard joins remain compatible. Old snapshots/history without a class are Standard. |
| HA and packaging | Add and validate the proposed option in `addon.cjs`, `config.yaml` and translations. Keep dev slug/port. Any new browser-loaded file must join the server allowlist and Docker COPY list. Feature implementation receives the next applicable minor version, tentatively v3.9.0. |

Turning the pilot option off requires a restart: new arenas use Standard, and the saved class preference/skins/coins remain available for a later pilot. A restart closes active rooms as it does today; do not promise live class conversion or preservation of an in-progress match. There is no new runtime dependency, external analytics service or real-money payment integration.

## 7. Execution batches and completion gates

| Batch | Deliverable | Completion gate |
| --- | --- | --- |
| A — definitions and pilot boundary | Class resolver, dev host option, private test rule, capability check, explicit ranking/reward eligibility | Old profiles and Standard-only fixtures keep current behavior; forged numeric stats/class IDs cannot alter a tank; test rounds cannot leak into any ranking, rewards or bot-difficulty history. |
| B — combat and AI | Spawn/Restore health, movement, all reloads, shared collision, bot assignment, round locking | Verify damage thresholds, boosted speeds, reload timing within a simulation tick, protection/friendly-fire rules, shell caps, map clearance and bot combat across both modes/layouts. |
| C — selection and art | Garage vehicle cards, independent paint, saved selection, lineup identity, actual-capacity HUD/help | Default Play still takes one click; all skins work on all classes; save failure keeps the old choice; no new HUD overlap at 320/390/844/1440 widths; Back and controls remain usable. |
| D — lifecycle and records | Results “Next match” selection, rematch/requeue/reconnect rules, tagged history/admin | Race a preference save against rematch start; verify actual-versus-next class, group transfer, missed transfer welcome, departed-seat joins, spectator exclusion, delayed saves and history reload. |
| E — automated verification | Focused regressions plus existing full tests, four browser suites and amd64/aarch64 startup | Keep the current 246-test baseline green. Add behavioral coverage for new mechanics and persistence/eligibility risks. Inspect captured class selection, both maps, actual health, results and all phone orientations. Keep tutorial screenshots current. |
| F — pilot observation | Controlled human sessions, bot stress report, real mobile/Pi measurements and a tuning decision | Review the evidence below; record revisions and unresolved problems before enabling normal matchmaking or preparing production promotion. |

Batches are implementation order, not separate mandatory releases. A documentation-only plan update retains v3.8.3. Feature code begins only after this proposal is accepted; then implement the private dev pilot through batch E as one reviewable feature, followed by observation.

## 8. How to judge the pilot

1. Run class pairings with fixed seeds, swapped spawn positions, both maps and several bot skills. Include duplicate-class teams and mixed teams. Verify shell-heavy and powered fights separately. Automated bot results find regressions and extreme mismatches; they do not establish human balance.
2. Use human crossover sessions so the same people rotate through Standard, Scout and Heavy, swap sides and try both input types. Aim initially for at least 30 completed human participations per class, covering both maps and both modes. This is a review floor, not a statistical guarantee. Collect feedback on escaping, readability, firing rhythm, two-laser Scout deaths, recovery from low health and willingness to choose the class again.
3. Review win share, kills/deaths and match duration by mode, class, map, human/bot mix and available experience/input information. Compare like-for-like sessions; four-player Deathmatch and 2-vs-2 have different expected win shares, and repeated profiles are not independent people. Investigate repeated dominance above about 60% in matched pairings; do not apply that threshold to pooled Deathmatch wins or small samples.
4. On the Pi, compare equivalent Standard-only and vehicle-test fixtures at the same connection count, map and firing load. Capture simulation timing, CPU, memory and serialized snapshot bytes. Investigate more than 10% growth in step cost or snapshot size before release. Record actual observations rather than presenting CI container builds as hardware measurements.
5. Change one of health, speed or reload per revision, repeat the affected checks and keep old history tagged with its original revision. First examine Scout's laser threshold and Heavy with Machine Gun/Restore. Keep Standard as the unchanged reference.
6. Advance only when all classes are understandable and useful, there are no progression/ranking leaks or lifecycle errors, device controls remain reliable and performance is acceptable. If one class still dominates or feels poor, continue tuning the private pilot. A public rollout and a production PR each need their own recorded decision.

## Source review and limits

Baseline mechanics were checked in `shared.js`, `game-server.cjs`, `bots.cjs`, `client.js`, `index.html`, `progress.cjs`, `server.cjs`, `leaderboard.cjs`, `addon.cjs` and `config.yaml`. In particular, current Machine Gun/Laser intervals bypass the normal `FIELD.fireCooldown`; Restore/spawn/client health assume `FIELD.maxHealth`; timed leaderboard rows and adaptive difficulty currently share match history. Those are implementation requirements, not optional visual polish.

The tables above were calculated from those source values. No vehicle-class simulation, human balance study or Pi class-performance test has been performed by this planning change. Existing v3.8.3 verification applies to the shipped cosmetic game, not to these proposed classes.
