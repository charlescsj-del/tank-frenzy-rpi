# Tank Frenzy sound direction

Status: approved effects shipped in v1.2.0, three approved MP3 music recordings shipped in v1.5.0, and the user's four selected battlefield effect recordings ship in v1.6.0.

## Shipped implementation

The game retains `audio/cartoon-v1.mp3` for the older unaffected cues and uses four small MP3s from the user's latest audition: Cannon A for normal and machine-gun shots, Ricochet C for bouncing shells, Power-up A for every pickup, and Destruction C for tank explosions. Double cannon still uses its paired-pop recording. The originals remain in the old pack as fallback if a selected download fails. See `audio/README.md` for the exact filenames and mapping.

Browser playback has a 12-voice limit, priority for important cues, repeated-effect rate limits, subtle panning, distance attenuation and result-cue ducking. Mute cancels active samples and fallback synth effects. The engine remains synthesized locally. Original tones are a fallback during loading or if the asset fails; old events are never queued for later playback.

The v1.5.0 music update plays approved B — Overdrive on splash/waiting/countdown and picks A — Iron Advance or C — Steel Pressure for each battle. These are original synthesized, versioned MP3 recordings; selection and playback run locally on each player's device.

Music decodes only tracks that are played and uses one looping source at gain 0.10 beneath the effects mix. Music and effects have independent saved switches; hiding the page stops both. Music and effects are served as static cached files, with no server-side audio processing.

The sections below preserve the earlier design proposal; the shipped behavior above supersedes earlier pickup and shot suggestions.

## Direction: playful cartoon arcade

Use short, expressive sounds that suit the toy tanks. Favor chunky pops, metallic pings, sparkling power cues and small musical phrases. Make effects recognizable during a busy match without relying on loudness alone.

Before v1.2.0, the client synthesized notes and filtered noise in the browser. Most effects used a single falling tone or a short sequence of triangle-wave notes. Pickups shared one melody, and firing sounds differed mainly by player slot. The approved sample set gives each event its own character using the existing event stream.

| Event | Proposed sound | Purpose |
| --- | --- | --- |
| Menu selection | Soft woodblock pop; a higher click for confirmation | Responsive menus without constant loud beeps |
| Match start | Three quick rising notes, then a punchy final note | A recognizable start signal |
| Normal opponent shot | Short cannon pop with a small mechanical click | Chunky toy-tank character |
| Machine gun | Lighter, tightly gated ticks | Distinguish rapid fire without overwhelming the mix |
| Double gun | Closely spaced paired pops | Make the two barrels recognizable |
| Laser | Brief rising zap, then a bright electrical tail | Contrast with ordinary shells |
| Ricochet | Small metallic “ping” with slight pitch variation | Make bouncing shots easy to recognize |
| Bullet interception | Crisp spark/crackle | Separate intercepted fire from tank damage |
| Tank hit | Compact metal clank and low thud | Clear damage feedback |
| Destruction | Layered bass pop, crunchy impact and short debris rattle | More satisfying than increasing volume alone |
| Immortal pickup | Bright star-like bell flourish | A distinct protection cue |
| Restore pickup | Warm two-note healing chime | Immediate feedback that health returned |
| Speed pickup | Quick rising whoosh | Suggest acceleration |
| Laser pickup | Small electrical charge-up | Announce the weapon change |
| Double / machine pickup | Two mechanical clicks / a quick ratchet | Distinguish the two gun upgrades |
| Victory | Short, cheerful fanfare | Celebrate the local player or team's win |
| Defeat | Gentle descending “wobble” | Playful disappointment without a harsh alarm |

## Keep the mix comfortable

- Use a few small pitch/timbre variations for repeated shots and impacts so they do not sound identical every time.
- Make nearby combat clearer and distant combat quieter; use subtle left/right positioning. Essential cues must still work through a phone's single speaker.
- Keep the engine quiet underneath shots, pickups and results. Briefly lower other effects when a result fanfare plays.
- Rate-limit ricochet and interception sounds during large bursts. Cap simultaneous voices, including noise effects, and give important cues priority.
- Keep the existing mute control. Stop every active or scheduled effect when muted, rather than only silencing the engine and queued melodies.
- Preserve the current muted local firing behavior initially. A soft optional own-shot sound can be considered separately.
- Avoid a continuous Immortal jingle or constant power-up loops; a pickup cue is enough for the first pass.

## Original implementation proposal

Start with distinct pickup cues, a richer destruction sound, laser sound and ricochet variations. Then refine menu/start/result sounds and positional mixing.

Synthesize and mix audio locally using the browser's existing audio context. Reuse bounded noise buffers, route effects through a shared volume control, and track active voices so mute can cancel them all. These proposals use existing snapshots and events; they do not require extra server simulation or additional sound messages.

## Audition workflow

Create a small sound-preview panel before finalizing the audio changes, with buttons for each effect and an overall volume control. Compare old and proposed effects at similar perceived volume, then try a busy four-player match on phone speakers and headphones. Check that pickup/result cues remain clear, rapid fire is comfortable, and mute stops sounds immediately.
