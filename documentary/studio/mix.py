"""Mix voices, score and sound effects into the final soundtrack.

Usage: python3 studio/mix.py out/v2 [script/v2/mutes.json]
Reads out/v2/voices.wav, out/v2/music/placements.json, out/v2/sfx/placements.json.
Writes out/v2/mix.wav (48 kHz stereo) plus stems (dialog/music/sfx) for checking levels.
"""
import json, subprocess, sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, sosfiltfilt

SR = 48000
out = Path(sys.argv[1])
voices, sr = sf.read(out / "voices.wav", dtype="float32")
assert sr == SR
N = len(voices)
T = np.arange(N) / SR
timings = json.loads((out / "timings.json").read_text())


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(np.square(x))) + 1e-12)


def db(g):
    return 10 ** (g / 20)


def place(bus, sig, t):
    i = int(round(t * SR))
    if i >= len(bus):
        return
    a, b = max(0, i), min(len(bus), i + len(sig))
    bus[a:b] += sig[a - i:b - i]


# ---------- dialog ----------
dialog = sosfilt(butter(2, 70, "high", fs=SR, output="sos"), voices, axis=0).astype(np.float32)
env = np.sqrt(np.maximum(sosfiltfilt(butter(2, 4, "low", fs=SR, output="sos"), np.square(dialog).mean(1)), 0))
speaking = env > np.percentile(env[env > 1e-5], 20) if np.any(env > 1e-5) else env > 0
dialog *= db(-20.0 - rms_db(dialog[speaking]))
# gentle compression: tame peaks above -12 dBFS short-term level
lvl = np.sqrt(np.maximum(sosfiltfilt(butter(2, 12, "low", fs=SR, output="sos"), np.square(dialog).mean(1)), 1e-12))
over = np.maximum(0, 20 * np.log10(lvl) + 12)
dialog *= db(-over * (1 - 1 / 2.5))[:, None]


def follow(x, attack_s, release_s, rate=1000):
    """Envelope follower at a 1 kHz control rate: fast attack, slow release."""
    step = SR // rate
    xs = x[: len(x) // step * step].reshape(-1, step).max(1)
    a, r = np.exp(-1 / (attack_s * rate)), np.exp(-1 / (release_s * rate))
    y, cur = np.empty_like(xs), 0.0
    for i, v in enumerate(xs):
        cur = a * cur + (1 - a) * v if v > cur else r * cur + (1 - r) * v
        y[i] = cur
    return np.interp(np.arange(len(x)), np.arange(len(y)) * step, y)


vad = follow(np.clip(env / (np.percentile(env[speaking], 35) + 1e-9), 0, 1), 0.04, 0.8)

# ---------- music ----------
music = np.zeros_like(voices)
for p in json.loads((out / "music" / "placements.json").read_text()):
    a = decode(p["file"])
    length = int((p["t1"] - p["t0"] + p.get("fade_out", 2.0)) * SR)
    a = a[:length]
    a *= db(-19.0 + p.get("gain_db", 0) - rms_db(a))
    fi, fo = int(p.get("fade_in", 1.5) * SR), int(p.get("fade_out", 2.0) * SR)
    ramp = np.ones(len(a), np.float32)
    ramp[:fi] = np.linspace(0, 1, min(fi, len(a)))[:len(ramp[:fi])]
    if fo and len(a) > fo:
        ramp[-fo:] = np.linspace(1, 0, fo) ** 1.5
    place(music, a * ramp[:, None], p["t0"])
# adaptive ducking: keep the music about 14 dB under the voice while anyone speaks (the cues get
# busier as the case builds, so a fixed duck is not enough); in the gaps the score plays at full level
def short_rms(x, win_s=0.3):
    k = int(win_s * SR)
    c = np.cumsum(np.r_[0, np.square(x)])
    r = np.sqrt(np.maximum((c[k:] - c[:-k]) / k, 1e-12))
    return np.r_[np.full(k // 2, r[0]), r, np.full(len(x) - len(r) - k // 2, r[-1])]


dial_env = short_rms(dialog.mean(1), 0.6)
mus_env = short_rms(music.mean(1), 0.6)
target = dial_env * db(-17.0)
want = np.clip(target / np.maximum(mus_env, 1e-9), db(-30), 1.0)
duck = 1 - vad * (1 - np.minimum(want, db(-11)))  # at least 11 dB of duck under speech, more if the cue is loud
duck = 1 - follow(1 - duck, 0.05, 0.9)
music *= duck[:, None]

# directed silences: hard mutes on music and beds (10 ms ramps), e.g. the cold-open cut and the price reveal
def t_of(ref):
    if isinstance(ref, (int, float)):
        return float(ref)
    import re
    m = re.match(r"line:([^:]+):(start|end)([+-][0-9.]+)?$", ref)
    return timings["lines"][m.group(1)][m.group(2)] + float(m.group(3) or 0)


mutes_path = Path(sys.argv[2]) if len(sys.argv) > 2 else out / "mutes.json"
mute = np.ones(N, np.float32)
for a0, a1 in ([(t_of(a), t_of(b)) for a, b in json.loads(mutes_path.read_text())] if mutes_path.exists() else []):
    i0, i1, r = int(a0 * SR), int(a1 * SR), int(0.01 * SR)
    mute[i0:i1] = 0
    mute[max(0, i0 - r):i0] = np.minimum(mute[max(0, i0 - r):i0], np.linspace(1, 0, i0 - max(0, i0 - r)))
    mute[i1:i1 + r] = np.minimum(mute[i1:i1 + r], np.linspace(0, 1, len(mute[i1:i1 + r])))
music *= mute[:, None]

# ---------- sound effects ----------
sfx = np.zeros_like(voices)
sfx_path = out / "sfx" / "placements.json"
for p in (json.loads(sfx_path.read_text()) if sfx_path.exists() else []):
    a = decode(p["file"])
    if p.get("until"):  # seamless loop tiled until a time on the timeline (beds: hiss, hum, birds)
        need = int((p["until"] - p["t"]) * SR)
        a = np.tile(a, (need // len(a) + 1, 1))[:need]
        level = -6.0 + p.get("gain_db", -30) - rms_db(a) - 9  # beds are set by loudness, not peak
    else:
        level = -6.0 + p.get("gain_db", -6) - 20 * np.log10(np.abs(a).max() + 1e-9)
    if p.get("dur"):
        a = a[:int(p["dur"] * SR)]
    fo, fi = int(p.get("fade_out", 0.05) * SR), int(p.get("fade_in", 0.0) * SR)
    if len(a) > fo > 0:
        a[-fo:] *= np.linspace(1, 0, fo)[:, None]
    if len(a) > fi > 0:
        a[:fi] *= np.linspace(0, 1, fi)[:, None]
    a *= db(level)
    pan = p.get("pan", 0.0)
    a[:, 0] *= np.sqrt((1 - pan) / 2) * np.sqrt(2)
    a[:, 1] *= np.sqrt((1 + pan) / 2) * np.sqrt(2)
    if p.get("bed"):
        i = int(p["t"] * SR)
        a *= mute[i:i + len(a)][:, None] if i + len(a) <= N else np.pad(mute[i:], (0, i + len(a) - N), constant_values=1)[:, None]
    place(sfx, a, p["t"])
sfx *= (1 - 0.45 * vad)[:, None]

# ---------- master ----------
total = timings["total"]
fade = np.clip((total - T) / 2.0, 0, 1) * np.clip(T / 0.2, 0, 1)
mix = (dialog + music + sfx) * fade[:, None]
# look-ahead peak limiter at -1.5 dBFS (5 ms look-ahead, 80 ms release)
ceiling = db(-1.5)
need = np.minimum(1, ceiling / np.maximum(np.abs(mix).max(1), 1e-9))
look = int(0.005 * SR)
need = np.minimum(need, np.r_[need[look:], np.ones(look)])
gr = 1 - follow(1 - need, 0.001, 0.08)
gr = np.minimum(gr, ceiling / np.maximum(np.abs(mix).max(1), 1e-9))
mix *= np.clip(gr, 0, 1)[:, None]
sf.write(out / "mix.wav", mix.astype(np.float32), SR, subtype="FLOAT")
for name, stem in (("dialog", dialog), ("music", music), ("sfx", sfx)):
    sf.write(out / f"stem_{name}.wav", stem.astype(np.float32), SR, subtype="FLOAT")
print(f"mix {N / SR:.1f}s | dialog {rms_db(dialog[speaking]):.1f} dB while speaking | music under voice {rms_db(music[speaking]):.1f} dB"
      f" | music in gaps {rms_db(music[~speaking]):.1f} dB | peak {20 * np.log10(np.abs(mix).max()):.1f} dBFS")
