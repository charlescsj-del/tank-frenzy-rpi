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

rate, duration = 44100, 0.36
rng = random.Random(3102)
samples, low, body = [], 0.0, 0.0
for i in range(round(rate * duration)):
    t = i / rate
    noise = rng.uniform(-1, 1)
    low += 0.18 * (noise - low)
    body += 0.035 * (noise - body)
    attack = 1 - math.exp(-t / 0.0015)
    # Dry, weighty impact: low body and crushed contact, without ringing metal.
    thump = 0.72 * math.sin(2 * math.pi * (72 * t + 1.1 * (1 - math.exp(-t / 0.018)))) * math.exp(-t / 0.043)
    punch = 0.25 * math.sin(2 * math.pi * 176 * t) * math.exp(-t / .020)
    grit = 1.8 * low * math.exp(-t / .015) + 1.5 * body * math.exp(-t / .045)
    tail = min(1, max(0, (duration - t) / .035))
    samples.append(math.tanh((thump + punch + grit) * 1.35) * attack * tail)
peak = max(abs(x) for x in samples)
samples = [x * .78 / peak for x in samples]
target = Path(__file__).resolve().parents[1] / 'audio/effects-hit-v3.mp3'
with tempfile.TemporaryDirectory() as temp:
    wav = Path(temp) / 'impact.wav'
    with wave.open(str(wav), 'wb') as out:
        out.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
        out.writeframes(b''.join(struct.pack('<h', round(x * 32767)) for x in samples))
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav),
                    '-codec:a', 'libmp3lame', '-b:a', '128k', '-map_metadata', '-1',
                    '-metadata', 'title=Tank Frenzy heavy impact v3', str(target)], check=True)
print(f'{target.name}: {duration:.2f}s, {target.stat().st_size} bytes, peak -2.2 dBFS before encoding')
