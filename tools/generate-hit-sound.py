#!/usr/bin/env python3
"""Original armour impact: deterministic synthesis, no external samples.

Requires ffmpeg on PATH; generated WAV is temporary, MP3 is versioned for caching.
"""
import math
import random
import struct
import subprocess
import tempfile
import wave
from pathlib import Path

rate, duration = 44100, 0.42
rng = random.Random(3102)
samples, low = [], 0.0
for i in range(round(rate * duration)):
    t = i / rate
    noise = rng.uniform(-1, 1)
    low += 0.24 * (noise - low)
    attack = 1 - math.exp(-t / 0.0015)
    # A low shell impact, inharmonic armour resonance, and a brief gritty contact.
    thump = 0.58 * math.sin(2 * math.pi * (83 * t + 3.7 * (1 - math.exp(-t / 0.035)))) * math.exp(-t / 0.060)
    metal = sum(a * math.sin(2 * math.pi * f * t) * math.exp(-t / decay)
                for f, a, decay in [(287, .22, .080), (617, .19, .056), (1093, .11, .040), (1847, .055, .023)])
    grit = 0.62 * low * math.exp(-t / .022)
    tail = min(1, max(0, (duration - t) / .035))
    samples.append(math.tanh((thump + metal + grit) * 1.15) * attack * tail)
peak = max(abs(x) for x in samples)
samples = [x * .78 / peak for x in samples]
target = Path(__file__).resolve().parents[1] / 'audio/effects-hit-v2.mp3'
with tempfile.TemporaryDirectory() as temp:
    wav = Path(temp) / 'impact.wav'
    with wave.open(str(wav), 'wb') as out:
        out.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        out.writeframes(b''.join(struct.pack('<h', round(x * 32767)) for x in samples))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                    '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1',
                    '-metadata', 'title=Tank Frenzy armour impact v2', str(target)], check=True)
print(f'{target.name}: {duration:.2f}s, {target.stat().st_size} bytes, peak -2.2 dBFS before encoding')
