# Approved cartoon sound pack

`cartoon-v1.mp3` contains the original synthesized effects from the user's approved sound audition. It is a mono 44.1 kHz / 128 kbps MP3, 174,333 bytes. No third-party recordings or external audio service are used.

The source samples were generated with oscillators, filtered noise, short melodic phrases and layered percussion. The pack preserves the approved waveforms, removes only the audition's outer silence, and adds short silent gaps between clips. Clip offsets and durations are stored in `sound-bank.js`.

Included clips: menu, start, cannon, double gun, machine-gun burst, laser, ricochet, interception, hit, explosion, Immortal, Restore, Speed, victory and defeat. The `machine-fire` entry selects one tick from the same burst so game fire cadence remains authoritative.

The server serves only explicitly allowed MP3 paths, with immutable caching. If the encoded pack changes, create a new asset filename and update the clip manifest and server allowlist together to avoid old cached audio using new offsets.

## Approved battlefield effects (v1.6.0)

The user chose four original MP3s from the playable effects audition. The bytes below are identical to those auditioned; none of the older cues need re-encoding:

| File | Approved choice | Played for |
| --- | --- | --- |
| `effects-fire-a-v1.mp3` | Cannon A | Normal and machine-gun fire |
| `effects-ricochet-c-v1.mp3` | Ricochet C | Bouncing shells |
| `effects-pickup-a-v1.mp3` | Power-up A | Every collected pickup |
| `effects-explosion-c-v1.mp3` | Destruction C | Tank destruction |

These mono 44.1 kHz / 128 kbps files total 45,731 bytes. The original asset continues to supply double cannon, menu, laser, intercept, hit, win and loss. `sound-bank.js` downloads each distinct file once and falls back to its previous cue if an approved file fails to load. The game still limits simultaneous sample voices to 12; no additional sound messages are sent to the game server. Any changed MP3 requires a new filename because assets use immutable caching.

## Countdown and match start (v1.7.0)

`countdown-v1.mp3` is a new mono 44.1 kHz / 128 kbps recording of three rising mechanical ticks. Their clip offsets are 0, 0.30 and 0.60 seconds, with 0.26 seconds each. The server countdown is still authoritative; the browser plays one tick when each displayed number first arrives and never repeats it on subsequent snapshots. `battle-start-v1.mp3` is a separate bass impact with a short brass call, played when the phase actually changes to active play. Both use the existing effects switch, voice cap and local sample playback. The previous start cue remains as a fallback if its replacement cannot load.

## Approved battle music (v1)

These are the exact original stereo 44.1 kHz / 192 kbps MP3 audition recordings approved by the user, with no third-party samples:

| File | Audition | Use | Duration |
| --- | --- | --- | --- |
| `music-iron-advance-v1.mp3` | A — Iron Advance | Random battle selection | 27.91 s |
| `music-overdrive-v1.mp3` | B — Overdrive | Splash, waiting room, countdown | 24.02 s |
| `music-steel-pressure-v1.mp3` | C — Steel Pressure | Random battle selection | 29.89 s |

The compositions layer synthesized percussion, bass, strings/brass-like tones and filtered textures. The files retain their original fade-outs for audition/download; in gameplay `music.js` loops the active 12-bar portion before that fade and skips the opening 0.12 seconds of silence. Loop endpoints were checked against the decoded recordings to land near zero crossings. Their measured audition loudness is about -17 LUFS; game music gain is now 0.30. Total encoded size: 1,968,718 bytes.

`music.js` chooses A/C independently on each client once per room/map round, retaining the choice across mute and visibility changes. Only tracks actually played are fetched and decoded. Replace filenames and update both the manifest and server allowlist when changing recordings; immutable cache URLs must not be reused for different bytes.
