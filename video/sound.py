#!/usr/bin/env python3
"""Synthesise the film's sound effects to sound.wav (48 kHz stereo). No samples: everything is generated here,
so there's nothing to license. Times come from timing.js, shared with film.html.

  .venv/bin/python sound.py
"""
import json, pathlib, re, wave
import numpy as np

HERE = pathlib.Path(__file__).parent
T = json.loads(re.search(r"window\.TIMING = (\{.*\});", (HERE / "timing.js").read_text(), re.S).group(1))
SR = 48000
LENGTH = T["LENGTH"]
rng = np.random.default_rng(7)
t_ = lambda dur: np.arange(int(dur * SR)) / SR


def band(x, lo, hi):
    """Keep lo..hi Hz (soft edges) using the spectrum."""
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    g = 1 / (1 + ((f - (lo + hi) / 2) / ((hi - lo) / 2 + 1e-9)) ** 4)
    return np.fft.irfft(X * g, len(x))


def env(n, attack, release):
    a = int(attack * SR); e = np.exp(-np.arange(n) / (release * SR))
    if a: e[:a] *= np.linspace(0, 1, a)
    return e


def tick(f=2200, dur=0.05):                     # a dry click: a sliver of filtered noise
    x = band(rng.standard_normal(int(dur * SR)), f * 0.6, f * 1.6)
    return x * env(len(x), 0.0005, dur / 5)


def swish(dur=0.5, f0=400, f1=2600):            # air moving past: noise whose band slides from f0 to f1
    n = int(dur * SR); blocks = 24; out = np.zeros(n); size = n // blocks * 2
    for b in range(blocks * 2 - 1):
        s = b * size // 2; seg = rng.standard_normal(size)
        fc = f0 * (f1 / f0) ** (b / (blocks * 2 - 2))
        seg = band(seg, fc * 0.7, fc * 1.4) * np.hanning(size)
        out[s:s + size] += seg[: max(0, min(size, n - s))]
    return out * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5


def thump(f=60, dur=0.7):                       # a felt landing: falling sine plus overtones for small speakers
    tt = t_(dur); ph = 2 * np.pi * np.cumsum(f * (1 + 1.5 * np.exp(-tt * 30))) / SR
    return (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.15 * np.sin(3 * ph)) * env(len(tt), 0.002, dur / 4)


def chime(f=660, dur=1.4):                      # a struck bar: a few inharmonic partials
    tt = t_(dur); x = np.zeros_like(tt)
    for k, (m, a, d) in enumerate([(1, 1, 1), (2.76, .35, .45), (5.4, .15, .25)]):
        x += a * np.sin(2 * np.pi * f * m * tt + k) * np.exp(-tt / (dur * d / 3))
    return x * env(len(tt), 0.003, 10)


def blip(f=500, dur=0.2):                       # a soft rounded pop that bends upward
    tt = t_(dur); ph = 2 * np.pi * np.cumsum(f * (0.7 + 0.5 * (1 - np.exp(-tt * 40)))) / SR
    return np.sin(ph) * np.sin(np.pi * np.minimum(1, tt / dur)) * np.exp(-tt * 14)


def twinkle(base=2400, dur=0.7, n=7):           # the sparkle: tiny bells scattered over a fraction of a second
    out = np.zeros(int(dur * SR))
    for i in range(n):
        f = base * 2 ** (rng.uniform(0, 1.2)); s = int(rng.uniform(0, dur * 0.55) * SR)
        x = np.sin(2 * np.pi * f * t_(0.25)) * np.exp(-t_(0.25) * 22) * rng.uniform(0.4, 1)
        out[s:s + len(x)] += x[: len(out) - s]
    return out


def room(seconds=1.0):
    n = int(seconds * SR); ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (seconds * SR / 6.9))
    return band(ir, 200, 7000) * 0.05


mix = np.zeros((2, int(LENGTH * SR) + SR)); wet = np.zeros_like(mix)


def at(sig, time, gain=1.0, pan=0.0, verb=0.25, pan_to=None):
    s = int(time * SR); sig = sig * gain; n = len(sig)
    p = np.full(n, pan) if pan_to is None else np.linspace(pan, pan_to, n)
    L, R = np.cos((p + 1) * np.pi / 4) * sig, np.sin((p + 1) * np.pi / 4) * sig
    mix[0, s:s + n] += L; mix[1, s:s + n] += R
    wet[0, s:s + n] += L * verb; wet[1, s:s + n] += R * verb


RIGHT = 0.35                                    # the chat and report sit right of centre

# the chat window rises in; the file attaches; the question is typed
at(swish(0.45, 300, 1500), T["chat"], 0.18, RIGHT, 0.4)
at(blip(520, 0.2), T["attach"], 0.22, RIGHT)
q = 'What should I be concerned about?'; t0, t1 = T["type"]
for i, ch in enumerate(q):
    if ch != ' ': at(tick(rng.uniform(2600, 3600), 0.03), t0 + i * (t1 - t0) / len(q), 0.10 * rng.uniform(0.6, 1), RIGHT, 0.08)
# the report opens out of the attachment
at(swish(0.65, 350, 2400), T["expand"][0], 0.30, RIGHT, 0.45)
at(thump(70, 0.45), T["expand"][1] - 0.05, 0.22, RIGHT)
# every personal detail is flagged as it's named
for i, tt in enumerate(T["flags"]):
    at(tick(1800 + i * 150, 0.05), tt, 0.42, RIGHT, 0.15); at(blip(880 + i * 40, 0.1), tt + 0.01, 0.06, RIGHT)
# Redacto drops in
at(swish(0.4, 2600, 500), T["pill"] - 0.05, 0.22, -0.4, 0.35)
at(thump(55, 0.9), T["pill"] + 0.2, 0.55, -0.4, 0.35)
# the magic: each detail becomes a label, with a sparkle, climbing a scale
for i, (tt, f) in enumerate(zip(T["swaps"], (659, 740, 831, 988, 1109))):
    at(chime(f, 1.2), tt, 0.13, RIGHT, 0.6)
    at(twinkle(2600 + i * 200, 0.7), tt + 0.02, 0.07, RIGHT + 0.1, 0.5)
# the results stay
at(blip(660, 0.22), T["kept"], 0.16, RIGHT); at(chime(1319, 1.0), T["kept"] + 0.02, 0.05, RIGHT, 0.6)
# the clean file goes back into the chat and is sent
at(swish(0.6, 2400, 400), T["collapse"][0] - 0.02, 0.26, RIGHT, 0.45)
at(tick(2600, 0.04), T["send"] - 0.02, 0.5, RIGHT); at(blip(600, 0.18), T["send"] + 0.01, 0.18, RIGHT)
# the answer arrives
at(blip(780, 0.2), T["reply"][0] - 0.02, 0.12, RIGHT)
# How it works: the model card, the shrink, the model landing in the browser
H, O, TR = T["how"], T["offline"], T["trust"]
at(swish(0.5, 400, 2200), H["card"] - 0.15, 0.22, RIGHT, 0.4)
at(tick(2000, 0.05), H["card"] + 0.2, 0.35, RIGHT, 0.15)
at(swish(1.0, 3200, 300), H["shrink"][0], 0.30, RIGHT, 0.35)
at(thump(62, 0.6), H["shrink"][1] - 0.05, 0.40, RIGHT, 0.3)
at(chime(988, 1.0), H["shrink"][1] + 0.05, 0.06, RIGHT, 0.6)
at(swish(0.55, 600, 2600), H["browser"][0], 0.22, RIGHT, 0.4, pan_to=0.6)
at(blip(620, 0.2), H["browser"][1], 0.22, 0.6)
# Download once: ticks climbing with the bar, then a soft done
d0, d1 = O["download"]
for i in range(10):
    at(tick(1800 + i * 160, 0.03), d0 + i * (d1 - d0) / 10, 0.16, 0.2, 0.08)
at(blip(880, 0.22), d1, 0.18, 0.2)
# Wi-Fi off: a switch click and a falling tone; it keeps working (the sparkle again)
at(tick(1400, 0.06), O["wifi"], 0.5, 0.5, 0.1)
tt = t_(0.5); at(np.sin(2 * np.pi * np.cumsum(700 * np.exp(-tt * 2.2)) / SR) * np.exp(-tt * 6), O["wifi"] + 0.03, 0.12, 0.5, 0.3)
at(chime(784, 1.2), O["working"], 0.13, 0.1, 0.6)
at(twinkle(3000, 0.7), O["working"] + 0.02, 0.07, 0.1, 0.5)
# Trust the code: the repository card, the code typing, the badge
at(swish(0.5, 300, 1800), TR["card"] - 0.2, 0.22, RIGHT, 0.4)
at(thump(58, 0.7), TR["card"] + 0.15, 0.42, RIGHT, 0.35)
for i in range(18):
    at(tick(rng.uniform(2800, 3800), 0.025), TR["card"] + 0.3 + i * (TR["oss"] - TR["card"] - 0.4) / 18, 0.06, RIGHT, 0.05)
at(chime(1047, 1.4), TR["oss"], 0.10, RIGHT, 0.6); at(twinkle(3200, 0.7, 8), TR["oss"] + 0.03, 0.05, RIGHT, 0.5)

# the end card: logo, then the headline as it's spoken
at(swish(0.6, 2000, 300), T["out"][0], 0.2, RIGHT, 0.5)
e = T["end"][0]
at(thump(48, 1.3), e + 0.25, 0.6, 0, 0.45)
at(chime(523, 2.6), e + 0.27, 0.12, -0.1, 0.75); at(chime(784, 2.6), e + 0.29, 0.09, 0.1, 0.75)
at(twinkle(3000, 0.9, 10), e + 0.31, 0.06, 0, 0.6)
at(chime(1047, 1.6), T["headline"] + 0.1, 0.05, 0, 0.7)

ir = room(1.1); size = mix.shape[1] + len(ir)
for ch in (0, 1):
    mix[ch] += np.fft.irfft(np.fft.rfft(wet[ch], size) * np.fft.rfft(ir, size), size)[: mix.shape[1]]
out = mix[:, : int(LENGTH * SR)]
fade = int(0.6 * SR); out[:, -fade:] *= np.linspace(1, 0, fade)
out *= 10 ** (-4 / 20) / np.max(np.abs(out))                       # peak at -4 dBFS
pcm = (out.T * 32767).astype(np.int16)
with wave.open(str(pathlib.Path(__file__).with_name("sound.wav")), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("wrote sound.wav")
