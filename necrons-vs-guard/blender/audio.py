"""Soundtrack for the 20-second Blender cut. Writes a stereo WAV: python3 audio.py out.wav"""
import sys
import wave

import numpy as np

SR = 44100
DUR = 20.0
n = int(DUR * SR)
rng = np.random.default_rng(9)
L = np.zeros(n, np.float32)
R = np.zeros(n, np.float32)


def put(t, sig, vol=1.0, pan=0.0):
    i = int(t * SR)
    if i >= n:
        return
    sig = sig[: n - i] * vol
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def tt(d):
    return np.arange(int(d * SR)) / SR


def osc(freq, d, shape="sin"):
    f = np.broadcast_to(freq, (int(d * SR),)) if np.ndim(freq) == 0 else freq
    ph = np.cumsum(2 * np.pi * f / SR)
    if shape == "saw":
        return (((ph / (2 * np.pi)) % 1.0) * 2 - 1).astype(np.float32)
    return np.sin(ph).astype(np.float32)


def lp(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 4), len(x)).astype(np.float32)


def hp(x, fc):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * (1 - 1 / np.sqrt(1 + (f / fc) ** 4)), len(x)).astype(np.float32)


def noise(d):
    return rng.normal(0, 1, int(d * SR)).astype(np.float32)


T = tt(DUR)
env = np.clip(T / 2, 0, 1) * np.clip((DUR - T) / 2, 0, 1)
drone = lp(osc(55, DUR, "saw") * 0.5 + osc(55.4, DUR, "saw") * 0.5 + osc(27.5, DUR), 180) * (0.6 + 0.4 * np.sin(T * 0.5))
put(0, drone * env, 0.25)
put(0, lp(noise(DUR), 400) * env, 0.05)

beat = 0.6
b = 0
while 3.0 + b * beat < 17.2:
    t0 = 3.0 + b * beat
    d = tt(0.6)
    put(t0, osc(90 * np.exp(-d * 18) + 45, 0.6) * np.exp(-d * 9), 0.55 if b % 4 == 0 else 0.35)
    if b % 2:
        put(t0, hp(noise(0.6), 1500) * np.exp(-d * 22), 0.1)
    b += 1


def las(t):
    d = tt(0.13)
    put(t, osc(2400 * np.exp(-d * 28) + 480, 0.13) * np.exp(-d * 24), 0.08, rng.uniform(-0.7, 0.7))


def gauss(t):
    d = tt(0.4)
    s = (osc(95 + 30 * np.sin(d * 200), 0.4, "saw") * 0.6 + hp(noise(0.4), 2000) * 0.4) * np.exp(-d * 8)
    put(t, s, 0.14, rng.uniform(-0.7, 0.7))


def boom(t, size=1.0):
    d = tt(1.6 + size)
    s = lp(noise(1.6 + size), 300) * np.exp(-d * 2.4) * 1.3 + osc(55 * np.exp(-d * 3) + 25, 1.6 + size) * np.exp(-d * 3)
    put(t, s, 0.4 * size ** 0.5, rng.uniform(-0.4, 0.4))


for k in range(40):
    las(1.2 + k * 0.38 + rng.uniform(0, 0.3))
for k in range(18):
    t = 4.5 + k * 14 / 24 + rng.uniform(0, 0.3)
    gauss(t)
    boom(t + 0.1, 0.35)
for sec in (7.4, 8.8):
    boom(sec, 0.2)
    boom(sec + 0.3, 1.0)
    d = tt(1.0)
    put(sec, hp(noise(1.0), 200) * np.exp(-d * 18) + osc(70 * np.exp(-d * 6) + 30, 1.0) * np.exp(-d * 4), 0.7, -0.4)
d = tt(4.2)
put(11.0, lp(osc(32 + 6 * d, 4.2, "saw") + osc(48 + 9 * d, 4.2, "saw"), 260) * np.clip(d / 3, 0, 1), 0.4)
d = tt(1.2)
put(14.0, lp(osc(120 + 1300 * (d / 1.2) ** 2, 1.2, "saw") * 0.4 + osc(60 + 600 * (d / 1.2) ** 2, 1.2), 3000) * (d / 1.2) ** 1.5, 0.25)
d = tt(1.2)
put(15.2, lp(osc(55, 1.2, "saw") + hp(noise(1.2), 800) * 0.7, 2500) * np.clip((1.2 - d) / 0.2, 0, 1), 0.4)
boom(15.45, 3.0)
d = tt(3.0)
chord = sum(osc(f, 3.0, "saw") for f in (110, 220, 261.6, 329.6, 440))
put(17.2, lp(chord, 1400) * np.clip(d / 2, 0, 1) ** 1.5 * np.clip((3 - d) / 0.4, 0, 1), 0.08)

mix = np.tanh(np.stack([L, R], 1) * 1.3) / np.tanh(1.3)
mix *= 0.95 / max(1e-6, np.abs(mix).max())
with wave.open(sys.argv[1] if len(sys.argv) > 1 else "audio.wav", "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
