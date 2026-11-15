#!/usr/bin/env python3
"""Generates every sound effect and music track for Life Simulator.

All audio is synthesised from scratch here (sine/saw/noise oscillators and
envelopes), so it is 100% original and free to ship. Music is written to WAV
and converted to OGG Vorbis with ffmpeg.

Usage: python3 tools/make_audio.py   (from the project root)
"""
import os
import subprocess
import wave

import numpy as np

SR = 22050
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SND = os.path.join(ROOT, "assets", "sounds")
MUS = os.path.join(ROOT, "assets", "music")
rng = np.random.default_rng(1234)


def t_axis(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, a=0.01, d=0.1, s=0.7, r=0.1):
    """ADSR envelope of n samples (times in seconds)."""
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    s_n = max(0, n - a_n - d_n - r_n)
    e = np.concatenate([
        np.linspace(0, 1, max(a_n, 1)),
        np.linspace(1, s, max(d_n, 1)),
        np.full(s_n, s),
        np.linspace(s, 0, max(r_n, 1)),
    ])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def sine(f, dur):
    return np.sin(2 * np.pi * f * t_axis(dur))


def saw(f, dur):
    t = t_axis(dur)
    return 2 * ((t * f) % 1.0) - 1


def square(f, dur, duty=0.5):
    t = t_axis(dur)
    return np.where((t * f) % 1.0 < duty, 1.0, -1.0)


def noise(dur):
    return rng.uniform(-1, 1, int(SR * dur))


def lowpass(x, alpha):
    y = np.zeros_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def note_freq(n):
    """MIDI note number to Hz."""
    return 440.0 * 2 ** ((n - 69) / 12)


def write_wav(path, x, sr=SR):
    x = np.asarray(x, dtype=np.float64)
    peak = np.max(np.abs(x)) or 1.0
    x = x / peak * 0.89
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())


def tone(f, dur, kind="sine", a=0.005, d=0.05, s=0.6, r=0.05):
    osc = {"sine": sine, "saw": saw, "square": square}[kind](f, dur)
    return osc * env(len(osc), a, d, s, r)


def seq(parts):
    return np.concatenate(parts)


# ------------------------------------------------------------------ SFX
def make_sfx():
    os.makedirs(SND, exist_ok=True)
    write_wav(f"{SND}/ui_click.wav", tone(1200, 0.05, "sine", 0.001, 0.02, 0.2, 0.02))
    write_wav(f"{SND}/ui_confirm.wav", seq([tone(880, 0.07), tone(1320, 0.12)]))
    write_wav(f"{SND}/ui_error.wav", seq([tone(300, 0.09, "square", s=0.4), tone(220, 0.16, "square", s=0.4)]) * 0.5)
    write_wav(f"{SND}/notify.wav", seq([tone(988, 0.08), tone(1319, 0.08), tone(1568, 0.2)]))
    write_wav(f"{SND}/phone.wav", seq([tone(1400, 0.06), np.zeros(800), tone(1400, 0.06)]))
    m = seq([tone(note_freq(n), 0.12, "square", s=0.5) for n in (72, 76, 79)] + [tone(note_freq(84), 0.4, "square", s=0.5, r=0.2)])
    write_wav(f"{SND}/mission.wav", m * 0.6)
    ach = np.zeros(int(1.4 * SR))
    for i, n in enumerate((67, 72, 76, 79, 84)):
        sig = tone(note_freq(n), 0.9, "sine", 0.01, 0.2, 0.4, 0.5)
        st = int(i * 0.09 * SR)
        ach[st:st + len(sig)] += sig
    write_wav(f"{SND}/achievement.wav", ach)
    # Cash register: two bright bells + a short noise "drawer"
    bell = tone(2093, 0.35, "sine", 0.001, 0.1, 0.3, 0.2) + 0.5 * tone(3136, 0.35, "sine", 0.001, 0.1, 0.2, 0.2)
    drawer = lowpass(noise(0.12), 0.3) * env(int(0.12 * SR), 0.001, 0.05, 0.3, 0.05)
    write_wav(f"{SND}/cash.wav", seq([drawer, bell]))
    door = lowpass(noise(0.25), 0.08) * env(int(0.25 * SR), 0.002, 0.08, 0.3, 0.1) + 0.6 * tone(90, 0.25, "sine", 0.001, 0.1, 0.2, 0.1)
    write_wav(f"{SND}/door.wav", door)
    step = lowpass(noise(0.09), 0.25) * env(int(0.09 * SR), 0.001, 0.03, 0.2, 0.04)
    write_wav(f"{SND}/step_walk.wav", step * 0.7)
    step2 = lowpass(noise(0.08), 0.4) * env(int(0.08 * SR), 0.001, 0.02, 0.3, 0.03)
    write_wav(f"{SND}/step_run.wav", step2)
    t = t_axis(0.25)
    jump = np.sin(2 * np.pi * (300 + 500 * t / 0.25) * t) * env(len(t), 0.005, 0.1, 0.3, 0.1)
    write_wav(f"{SND}/jump.wav", jump * 0.6)
    horn = (square(415, 0.45, 0.4) + square(523, 0.45, 0.4)) * env(int(0.45 * SR), 0.01, 0.05, 0.8, 0.05)
    write_wav(f"{SND}/horn.wav", lowpass(horn, 0.35))
    crash = lowpass(noise(0.6), 0.5) * env(int(0.6 * SR), 0.001, 0.15, 0.25, 0.3) + 0.8 * tone(60, 0.6, "sine", 0.001, 0.2, 0.2, 0.3)
    write_wav(f"{SND}/crash.wav", crash)
    write_wav(f"{SND}/checkpoint.wav", seq([tone(1046, 0.06), tone(1568, 0.14)]))
    # Engine loop: exactly 1 second, harmonics of 50 Hz with a little noise.
    # The game changes pitch_scale with speed. Integer frequencies loop seamlessly.
    tt = t_axis(1.0)
    eng = (0.6 * np.sin(2 * np.pi * 50 * tt) + 0.35 * np.sin(2 * np.pi * 100 * tt)
           + 0.25 * np.sign(np.sin(2 * np.pi * 25 * tt)) * 0.5 + 0.15 * np.sin(2 * np.pi * 150 * tt))
    eng += 0.08 * lowpass(noise(1.0), 0.2)
    write_wav(f"{SND}/engine_loop.wav", lowpass(eng, 0.25))
    # Rain loop: filtered noise with random droplets, 3 seconds.
    rain = lowpass(noise(3.0), 0.55) * 0.5
    for _ in range(160):
        p = rng.integers(0, len(rain) - 400)
        rain[p:p + 400] += np.sin(np.linspace(0, 40, 400)) * np.linspace(0.4, 0, 400) * rng.uniform(0.2, 1)
    fade = int(0.05 * SR)
    rain[:fade] *= np.linspace(0.5, 1, fade)
    rain[-fade:] *= np.linspace(1, 0.5, fade)
    write_wav(f"{SND}/rain_loop.wav", rain)


# ------------------------------------------------------------------ MUSIC
def render_track(bpm, bars, chords, melody, style):
    """chords: list of (root_midi, minor?) per bar; melody: list of (step, midi or None, len_steps)."""
    beat = 60.0 / bpm
    step = beat / 2  # eighth notes
    total = int(bars * 4 * beat * SR)
    out = np.zeros(total + SR)

    def add(sig, start_s):
        i = int(start_s * SR)
        n = min(len(sig), len(out) - i)
        if n > 0:
            out[i:i + n] += sig[:n]

    for b in range(bars):
        root, minor = chords[b % len(chords)]
        third = 3 if minor else 4
        bar_t = b * 4 * beat
        # Pad chord (whole bar)
        for iv, vol in ((0, 0.22), (third, 0.18), (7, 0.18), (12, 0.1)):
            f = note_freq(root + iv)
            kind = "saw" if style == "race" else "sine"
            sig = tone(f, 4 * beat, kind, 0.3, 0.4, 0.7, 0.4) * vol
            if kind == "saw":
                sig = lowpass(sig, 0.08)
            add(sig, bar_t)
        # Bass
        for k in range(4 if style != "night" else 2):
            dur = beat if style != "night" else 2 * beat
            n = root - 24 + (7 if (k == 2 and style != "night") else 0)
            add(tone(note_freq(n), dur * 0.9, "square" if style == "race" else "sine", 0.005, 0.1, 0.5, 0.1) * 0.35, bar_t + k * dur)
        # Arpeggio
        if style in ("city", "menu", "race"):
            pattern = [0, third, 7, 12, 7, third, 0, 7]
            for k, iv in enumerate(pattern):
                add(tone(note_freq(root + 12 + iv), step * 0.8, "square" if style == "race" else "sine", 0.002, 0.05, 0.3, 0.05) * 0.09, bar_t + k * step)
        # Drums
        if style in ("city", "race"):
            for k in range(8):
                tk = bar_t + k * step
                if k % 4 == 0:
                    kick = np.sin(2 * np.pi * np.cumsum(np.linspace(140, 45, int(0.15 * SR))) / SR) * env(int(0.15 * SR), 0.001, 0.05, 0.4, 0.08)
                    add(kick * 0.6, tk)
                if k % 4 == 2:
                    sn = lowpass(noise(0.12), 0.6) * env(int(0.12 * SR), 0.001, 0.04, 0.3, 0.06)
                    add(sn * 0.3, tk)
                hh = noise(0.03) * env(int(0.03 * SR), 0.001, 0.01, 0.2, 0.01)
                add(hh * (0.12 if style == "race" else 0.07), tk)
        elif style == "night":
            # soft brushed hats
            for k in range(8):
                hh = lowpass(noise(0.05), 0.5) * env(int(0.05 * SR), 0.005, 0.02, 0.2, 0.02)
                add(hh * 0.05, bar_t + k * step)
    for st, n, ln in melody:
        if n is None:
            continue
        kind = "square" if style == "race" else "sine"
        sig = tone(note_freq(n), ln * step * 0.95, kind, 0.01, 0.1, 0.6, 0.1) * 0.2
        if style == "night":
            sig = sig + tone(note_freq(n + 12), ln * step * 0.95, "sine", 0.02, 0.2, 0.3, 0.2) * 0.05
        add(sig, st * step)
    return out[:total]


def melody_from(bars, notes_per_bar, scale, seed, start=72):
    r = np.random.default_rng(seed)
    mel = []
    idx = 3
    stepi = 0
    for b in range(bars):
        for k in range(notes_per_bar):
            ln = 8 // notes_per_bar
            if r.random() < 0.18:
                stepi += ln
                continue
            idx = int(np.clip(idx + r.integers(-2, 3), 0, len(scale) - 1))
            mel.append((stepi, start + scale[idx] - 12, ln))
            stepi += ln
    return mel


def make_music():
    os.makedirs(MUS, exist_ok=True)
    major = [0, 2, 4, 7, 9, 12, 14, 16, 19]
    minor = [0, 3, 5, 7, 10, 12, 15, 17, 19]
    tracks = {
        "menu_theme": (96, 16, [(60, False), (55, False), (57, True), (53, False)], melody_from(16, 4, major, 3, 72), "menu"),
        "city_day": (112, 24, [(62, False), (57, False), (59, True), (55, False), (62, False), (55, False), (57, False), (57, False)], melody_from(24, 4, major, 7, 74), "city"),
        "city_night": (76, 16, [(57, True), (53, False), (60, False), (55, False)], melody_from(16, 2, minor, 11, 69), "night"),
        "race": (140, 16, [(52, True), (48, False), (55, False), (50, False)], melody_from(16, 8, minor, 5, 76), "race"),
    }
    for name, (bpm, bars, chords, mel, style) in tracks.items():
        audio = render_track(bpm, bars, chords, mel, style)
        wav = os.path.join(MUS, name + ".wav")
        write_wav(wav, audio)
        ogg = os.path.join(MUS, name + ".ogg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libvorbis", "-q:a", "3", ogg], check=True)
        os.remove(wav)
        print("music:", name, f"{len(audio) / SR:.1f}s")


if __name__ == "__main__":
    make_sfx()
    make_music()
    print("done")
