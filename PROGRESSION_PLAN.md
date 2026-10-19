# Tank Frenzy progression rollout

Execution started 2026-10-17 (Malaysia). The first feature release is v3.3.0 on `dev`; promotion to production remains a separate reviewed PR. Coins are earned in play, with no real-money payment integration. Normal skins, including the Day 7 permanent reward, are cosmetic. Premium combat resistance and vehicle classes have not been approved and are not part of this release.

## Phase 1: economy baseline

Standard matches use target 10 with bouncing and powers enabled. Award 20 coins for participating through match completion, 30 extra for a win (both teammates in teams), and 3 per kill capped at 10 rewarded kills. Solo versus AI qualifies. Early departures, inactive players, spectators, disconnected finishes and custom/practice rules receive no coins or daily progression. Participation requires movement/fire time of 10% of time since joining, minimum two seconds and maximum ten seconds. This is an anti-idle baseline, not a complete anti-cheat system. Existing leaderboard rules stay independent. No retroactive coin credit for older matches.

Daily bonuses: 20 / 25 / 30 / 40 / 50 / 65 / 100 coins. Day 7 additionally awards one random unowned normal skin permanently; with all six owned, award 200 bonus coins instead. One missing calendar day per cycle pauses progress; a second missing day or a longer absence resets the next qualifying day to Day 1. Following Day 7 starts another cycle with a fresh allowance. Reset: midnight Malaysia, based on server match completion time. Catalogue: Classic (free), Desert Scout/Arctic Ghost (200 each), Forest Ranger/Sunset Racer (500), Carbon Night/Golden Ace (1000). Revisit values using actual earnings and purchase observations.

## Phases 2–5: first dev release

- Separate permanent player-progress file. Recovery codes restore a profile on this server. Active membership must be left before recovery elsewhere; changing a name never claims legacy records. Only the credential's hash is stored server-side.
- Server-calculated rewards, persistent per-profile round-credit index, atomic purchase/reward writes and in-memory rollback on failure. Failed match saves retain an in-memory retry job every five seconds. Crashes cannot preserve unsaved jobs or in-progress rounds; this is not a full crash-proof match log.
- Private result messages carry coin breakdowns/daily unlocks. No wallets or recovery credentials in shared snapshots, public rankings or admin aggregate metrics.
- Responsive Garage, previews, permanent purchase and explicit equip. Non-default cosmetic IDs propagate to players; shared procedural art avoids extra image downloads. Slot bands, team markers, own-player halo and gameplay statistics retain their roles.
- Automatic daily credit, permanent random unowned Day 7 skin, full-collection substitute, missed-day handling and result Equip action. Ownership survives closing a reward reveal.

## Phase 6: verification gates

Unit/integration coverage: reward amounts/caps, team wins, solo AI, participation, practice, early departure, disconnect, duplicate credit, date boundaries, missed days, Day 7/full collection, rollback, restart/recovery, leaderboard reset isolation and privacy. Browser coverage: actual purchase/equip, reload, recovery between devices, Day 7 results, shared equipped appearance, insufficient funds, desktop/portrait/landscape layouts. Existing multiplayer/hero/admin checks and amd64/aarch64 container health remain required.

Real Safari/Android and Raspberry Pi observations remain hardware verification; CI Chromium is not a substitute. The tutorial result image is refreshed from the verified Day 7 results flow; existing control/rule screenshots remain applicable. Progression instructions are in GAMEPLAY.md and the Garage.

## Phase 7: dev rollout and observation

Admin Coins & Progress loads on demand without external analytics. Observe first/second standard-match profiles, next-day/day-7 return among old-enough first-match cohorts, earned/wallet coins, skin unlocks, purchase participation, average completed matches before first purchase and pending reward saves. These are instance profile counts, not verified unique people. Practice/idle/left matches are excluded from completion counters. Retention needs subsequent calendar days and actual players; it cannot be certified at release time.

`rewards_enabled` pauses earning and purchases without deleting wallets/skins; owned cosmetics remain usable. Back up leaderboard and progress files together. Keep dev identity/port and review production promotion separately. Review the first week of real play before repricing; never remove owned skins to rebalance the economy.

## Phase 8: expansion after observations

v3.4.0 starts items 1–2: optional device-aware first-match prompts, personal best highlights and server-verified First victory, Sharpshooter and Comeback badges. Garage navigation also receives the iPhone safe-area/touch fix reported after v3.3.0. v3.5.0 implements item 3 on dev: optional weekly challenges with automatic server-owned rewards, responsive Garage cards, a home shortcut and results breakdown. v3.6.0 implements item 4: explicit postgame group consent and atomic requeue. v3.7.0 implements item 5: Crossroads alongside Quarry, automatic rotation and pregame map names. Cosmetic collections and vehicle balancing remain follow-ups; real-player retention/economy and map-balance observation remain ongoing.

1. First-match prompts: movement/fire/ricochet guidance based on beginner exits. Match keyboard/touch input, dismiss cleanly and avoid covering combat HUD; no mandatory tutorial before Play.
2. Personal achievements: server-verified first win, personal kill record and comeback highlights. Avoid repeated announcements or incentives to abandon teammates.
3. Weekly challenges: finish 5 standard matches (+75), win 3 (+100), and land 10 bounced-shell enemy hits (+125). Automatic once-per-goal weekly payouts; no manual claim, forced grind or combat advantage. The same eligibility as match coins applies, including solo AI and team victories. Progress saves at completion, with Monday 00:00 Malaysia reset and original-finish-week retry attribution. Pre-feature wallets migrate without retroactive awards. Dev defaults total 300 extra coins/week; these are provisional, not a claim that real-player economy observations are complete. Review actual completion rates, coin earning and skin purchases before changing targets/rewards. Unit/browser regression coverage includes thresholds, rollback, reset boundaries, late retries, recovery, shared-state privacy and touch-safe navigation.
4. Stay together (v3.6.0 on dev): existing majority rematch remains unchanged. After expiry, explicit reversible consent plus Find match together moves only consenting connected humans into one same-mode Quick Play search. Solo Find new match stays one click; others keep their results. Admit the whole group or none; never replace AI, split a group or move unselected players. Handle departures, disconnects, stale-round messages, per-network/global capacity and a missed transfer welcome. Quick Play uses standard rules and rebalances teams; this is not a same-team party system. Server/client/browser regressions cover these boundaries at desktop, phone and landscape sizes.
5. Map variety (v3.7.0 on dev): add the symmetric 16-wall Crossroads layout alongside seeded Quarry. Automatically choose the first layout and alternate same-arena rematches; keep prepared geometry through lineup/start and friend-lobby returns. Use existing pregame text for the name, with no extra queue/clicks or active HUD panel. Verify spawn clearance, connected tank paths, symmetry, cover/ricochets/lasers, deterministic bot combat in both modes and bounded snapshots. Inspect both layouts at desktop, portrait and landscape sizes. Existing Quarry tutorial screenshots remain applicable. Geometry and automated tests do not establish real-player win-rate balance or Pi hardware performance; observe play before adding more layouts.
6. Premium cosmetic collections: select catalogue/art direction from initial purchase feedback; same battle statistics, legible effects and no concealment advantage.
7. Vehicle classes: a separate armour/speed/weapon balancing proposal available to everyone. Requires an explicit gameplay decision and playtesting; premium-skin resistance is not silently introduced.

Phase 8 follows live observation instead of being bundled into the first economy release. Challenge prices, premium art and vehicle balance remain reviewable follow-up decisions.
