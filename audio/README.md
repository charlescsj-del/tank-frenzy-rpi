# Approved cartoon sound pack

`cartoon-v1.mp3` contains the original synthesized effects from the user's approved sound audition. It is a mono 44.1 kHz / 128 kbps MP3, 174,333 bytes. No third-party recordings or external audio service are used.

The source samples were generated with oscillators, filtered noise, short melodic phrases and layered percussion. The pack preserves the approved waveforms, removes only the audition's outer silence, and adds short silent gaps between clips. Clip offsets and durations are stored in `sound-bank.js`.

Included clips: menu, start, cannon, double gun, machine-gun burst, laser, ricochet, interception, hit, explosion, Immortal, Restore, Speed, victory and defeat. The `machine-fire` entry selects one tick from the same burst so game fire cadence remains authoritative.

The server serves only the explicitly allowed MP3 path, with immutable caching. If the encoded pack changes, create a new asset filename and update the clip manifest and server allowlist together to avoid old cached audio using new offsets.
