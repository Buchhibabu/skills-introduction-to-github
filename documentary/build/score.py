"""Synthesise the score and sound design, then mix it under the narration.

Usage: python3 build/score.py out/
Reads  out/narration.wav, out/cues.json ({duration, music: [{t0, t1, mood}], sfx: [{t, type, ...}]})
Writes out/mix.wav (48 kHz stereo, pre-loudness-normalisation)

Everything is generated from oscillators and noise, so the soundtrack has no licensing strings attached.
"""
import json, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
out = sys.argv[1]
cues = json.load(open(f"{out}/cues.json"))
narr, nsr = sf.read(f"{out}/narration.wav", dtype="float64")
assert nsr == SR
DUR = cues["duration"]
N = int(DUR * SR)
narr = np.pad(narr, (0, max(0, N - len(narr))))[:N]
T = np.arange(N) / SR
rng = np.random.default_rng(2022)


def filt(x, kind, f, order=2):
    return sosfilt(butter(order, f, kind, fs=SR, output="sos"), x)


def saw(freq, n, phase=0.0):
    ph = (phase + np.cumsum(np.broadcast_to(freq, (n,)) / SR)) % 1.0
    return 2 * ph - 1


def env_adsr(n, a=0.005, d=0.2, s=0.0, r=0.0):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    if r:
        e *= np.clip((n / SR - t) / r, 0, 1)
    return e


def place(bus, sig, t, gain=1.0):
    i = int(t * SR)
    if i >= len(bus) or i + len(sig) <= 0:
        return
    a, b = max(0, i), min(len(bus), i + len(sig))
    bus[a:b] += gain * sig[a - i: b - i]


def reverb_ir(seconds, seed, damp=6000):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = r.standard_normal(n) * np.exp(-np.linspace(0, 7, n))
    ir = filt(ir, "low", damp)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt(np.sum(ir ** 2))


def section_gain(mood, fade=1.5):
    """Smooth 0..1 envelope that is on wherever a music section has this mood."""
    g = np.zeros(N)
    for s in cues["music"]:
        if s["mood"] != mood:
            continue
        a, b = s["t0"], s["t1"]
        k = np.clip(np.minimum((T - (a - fade / 2)) / fade, ((b + fade / 2) - T) / fade), 0, 1)
        g = np.maximum(g, k * s.get("level", 1.0))
    return g


# ---------------- music beds ----------------
def pad(freqs, cutoff, detune=0.006, seed=0):
    L = np.zeros(N); R = np.zeros(N)
    for j, f in enumerate(freqs):
        for d, ch in ((1 - detune, L), (1 + detune, R), (1.0, L), (1.0, R)):
            ch += saw(f * d, N, phase=(seed + j * 0.37 + d) % 1) / len(freqs)
    lfo = 0.75 + 0.25 * np.sin(2 * np.pi * 0.07 * T + seed)
    L = filt(L, "low", cutoff) * lfo
    R = filt(R, "low", cutoff) * lfo[::-1]
    return np.stack([L, R], 1)


dark = pad([55.0, 82.41, 110.0, 130.81], 520, seed=1)            # A minor, low and close
warm = pad([87.31, 130.81, 174.61, 220.0, 261.63, 329.63], 1500, seed=2)  # F major add9, open
music = dark * (0.55 * section_gain("tension") + 0.42 * section_gain("pulse") + 0.25 * section_gain("static")
                + 0.5 * section_gain("reveal") + 0.3 * section_gain("clock"))[:, None]
music += warm * (0.42 * section_gain("dawn") + 0.32 * section_gain("outro"))[:, None]

# high shimmer that only appears in reveal moments
shimmer = np.sin(2 * np.pi * 880 * T) * 0.5 + np.sin(2 * np.pi * 1318.5 * T) * 0.3
shimmer = filt(shimmer * (0.5 + 0.5 * np.sin(2 * np.pi * 0.3 * T)), "low", 3000)
music += (shimmer * 0.035 * section_gain("reveal"))[:, None]

perc = np.zeros(N)


def kick(f0=95, f1=42, dur=0.45):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)


def bass_note(f, dur=0.22):
    n = int(dur * SR)
    return filt(saw(f, n), "low", 380) * env_adsr(n, 0.004, 0.12)


# heartbeat under tension, a driving pulse under 'pulse', ticking under 'clock'
for s in cues["music"]:
    if s["mood"] == "tension" and s.get("heartbeat"):
        t = s["t0"]
        while t < s["t1"] - 0.5:
            place(perc, kick(), t, 0.55); place(perc, kick(80, 40), t + 0.27, 0.35); t += 1.15
    if s["mood"] == "pulse":
        bpm0, bpm1 = s.get("bpm", [92, 112]); t = s["t0"]
        while t < s["t1"]:
            k = (t - s["t0"]) / (s["t1"] - s["t0"]); bpm = bpm0 + (bpm1 - bpm0) * k
            place(perc, bass_note(55.0), t, 0.32 + 0.25 * k)
            t += 60 / bpm / 2
    if s["mood"] == "clock":
        t, i = s["t0"], 0
        while t < s["t1"]:
            n = int(0.03 * SR)
            click = filt(rng.standard_normal(n), "band", [2500, 6500] if i % 2 else [1800, 4500]) * np.exp(-np.arange(n) / SR * 260)
            place(perc, click, t, 0.22); t += 0.5; i += 1

music += np.stack([perc, perc], 1)

# piano-ish notes for the dawn section (soft, sparse arpeggio)
keys_bus = np.zeros(N)
for s in cues["music"]:
    if s["mood"] in ("dawn", "outro") and s.get("piano"):
        notes = [261.63, 329.63, 392.0, 523.25, 440.0, 349.23, 392.0, 329.63]
        t, i = s["t0"] + 0.5, 0
        while t < s["t1"] - 1:
            f = notes[i % len(notes)]; n = int(3.5 * SR); tt = np.arange(n) / SR
            tone = sum(a * np.sin(2 * np.pi * f * h * tt) * np.exp(-tt * (1.2 + h * 0.9)) for h, a in ((1, 1), (2, .45), (3, .2), (4, .1)))
            tone *= np.clip(tt / 0.008, 0, 1)
            place(keys_bus, tone, t, 0.09); t += 1.4 if i % 4 != 3 else 2.1; i += 1
music += np.stack([keys_bus * 0.9, keys_bus * 1.1], 1)

# ---------------- sound effects ----------------
fx = np.zeros((N, 2))


def noise(n):
    return rng.standard_normal(n)


def sfx_hit(t, o):
    n = int(3.0 * SR); tt = np.arange(n) / SR
    f = 32 + 58 * np.exp(-tt * 6)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.6)
    crack = filt(noise(n), "low", 1800) * np.exp(-tt * 9) * 0.5
    sig = (boom + crack) * o.get("gain", 0.9)
    place(fx[:, 0], sig, t); place(fx[:, 1], sig, t)


def sfx_riser(t, o):
    d = o.get("dur", 2.5); n = int(d * SR); tt = np.arange(n) / SR; k = tt / d
    x = noise(n)
    # crude swept band: crossfade between filtered versions
    lo, mid, hi = filt(x, "band", [200, 600]), filt(x, "band", [600, 2000]), filt(x, "band", [2000, 7000])
    sig = lo * np.clip(1 - 2 * k, 0, 1) + mid * (1 - np.abs(2 * k - 1)) + hi * np.clip(2 * k - 1, 0, 1)
    tone = np.sin(2 * np.pi * np.cumsum(220 + 660 * k ** 2) / SR) * 0.15
    sig = (sig * 0.6 + tone) * k ** 2.2 * o.get("gain", 0.5)
    place(fx[:, 0], sig, t - d); place(fx[:, 1], sig, t - d)


def sfx_key(t, o):
    n = int(0.05 * SR); tt = np.arange(n) / SR
    click = filt(noise(n), "high", 2500) * np.exp(-tt * 380)
    thump = np.sin(2 * np.pi * (140 + 60 * rng.random()) * tt) * np.exp(-tt * 120) * 0.5
    sig = (click + thump) * (0.10 + 0.05 * rng.random()) * o.get("gain", 1)
    pan = 0.4 + 0.2 * rng.random()
    place(fx[:, 0], sig * (1 - pan) * 2, t); place(fx[:, 1], sig * pan * 2, t)


def sfx_stamp(t, o):
    n = int(0.6 * SR); tt = np.arange(n) / SR
    sig = (np.sin(2 * np.pi * 70 * tt) * np.exp(-tt * 18) + filt(noise(n), "band", [300, 2500]) * np.exp(-tt * 40) * 0.6) * 0.6 * o.get("gain", 1)
    place(fx[:, 0], sig, t); place(fx[:, 1], sig, t)


def sfx_whoosh(t, o):
    d = o.get("dur", 0.9); n = int(d * SR); tt = np.arange(n) / SR; k = tt / d
    sig = filt(noise(n), "band", [400, 2600]) * np.sin(np.pi * k) ** 2 * 0.22 * o.get("gain", 1)
    place(fx[:, 0], sig * (1 - k), t - d / 2); place(fx[:, 1], sig * k, t - d / 2)


def sfx_glitch(t, o):
    d = o.get("dur", 0.35); n = int(d * SR); sig = np.zeros(n); i = 0
    while i < n:
        m = int(SR * (0.01 + 0.03 * rng.random()))
        f = 200 + 2400 * rng.random()
        seg = np.sign(np.sin(2 * np.pi * f * np.arange(m) / SR)) * 0.5 + np.round(noise(m) * 3) / 6
        sig[i:i + m] += seg[: max(0, min(m, n - i))] * (rng.random() > 0.3); i += m
    sig = filt(sig, "band", [300, 6000]) * 0.18 * o.get("gain", 1)
    place(fx[:, 0], sig, t); place(fx[:, 1], np.roll(sig, 90), t)


def sfx_pop(t, o):
    n = int(0.12 * SR); tt = np.arange(n) / SR
    f = o.get("freq", 880)
    sig = np.sin(2 * np.pi * np.cumsum(f + f * 0.5 * tt / 0.12) / SR) * np.exp(-tt * 40) * 0.12 * o.get("gain", 1)
    place(fx[:, 0], sig, t); place(fx[:, 1], sig, t)


def sfx_static(t, o):
    d = o.get("dur", 3.0); n = int(d * SR); tt = np.arange(n) / SR
    crackle = (rng.random(n) > 0.9985) * noise(n) * 0.9
    hiss = filt(noise(n), "band", [1500, 9000]) * 0.25
    hum = 0.2 * np.sin(2 * np.pi * 50 * tt) + 0.08 * np.sin(2 * np.pi * 150 * tt)
    e = np.clip(tt / 0.4, 0, 1) * np.clip((d - tt) / o.get("release", 1.2), 0, 1)
    sig = (hiss + crackle + hum) * e * 0.18 * o.get("gain", 1)
    place(fx[:, 0], sig, t); place(fx[:, 1], np.roll(sig, 300), t)


def sfx_tick(t, o):
    n = int(0.03 * SR)
    sig = filt(noise(n), "band", [2500, 6500]) * np.exp(-np.arange(n) / SR * 260) * 0.25 * o.get("gain", 1)
    place(fx[:, 0], sig, t); place(fx[:, 1], sig, t)


def sfx_shutter(t, o):
    for dt in (0, 0.045):
        n = int(0.04 * SR)
        sig = filt(noise(n), "band", [1200, 5000]) * np.exp(-np.arange(n) / SR * 150) * 0.25
        place(fx[:, 0], sig, t + dt); place(fx[:, 1], sig, t + dt)


SFX = {"hit": sfx_hit, "riser": sfx_riser, "key": sfx_key, "stamp": sfx_stamp, "whoosh": sfx_whoosh,
       "glitch": sfx_glitch, "pop": sfx_pop, "static": sfx_static, "tick": sfx_tick, "shutter": sfx_shutter}
for c in cues["sfx"]:
    SFX[c["type"]](c["t"], c)

# ---------------- mix ----------------
hall = reverb_ir(2.8, 5), reverb_ir(2.8, 6)
wet = np.stack([fftconvolve(music[:, i] + 0.4 * fx[:, i], hall[i])[:N] for i in range(2)], 1)
bed = music + 0.28 * wet

# duck the music under the voice (about -8 dB while speaking)
env = np.sqrt(np.maximum(filt(narr ** 2, "low", 3), 0))
env = np.clip(env / (np.percentile(env[env > 1e-4], 60) + 1e-9), 0, 1)
duck = 1 - 0.6 * np.clip(filt(env, "low", 2), 0, 1)
bed *= duck[:, None]

fade = np.clip((DUR - T) / 2.5, 0, 1) * np.clip(T / 0.3, 0, 1)
mix = (bed * 0.55 + fx * 0.9) * fade[:, None] + np.stack([narr, narr], 1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
sf.write(f"{out}/mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
print(f"mix {DUR:.1f}s, peak {np.max(np.abs(mix)):.2f}")
