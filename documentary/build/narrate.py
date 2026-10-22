"""Synthesise the narration line by line with Kokoro and record when each line starts.

Usage: python3 build/narrate.py <kokoro_model_dir> script.json out/
Writes out/narration.wav (48 kHz mono) and out/timings.json ({line_id: {start, end}}).
"""
import json, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly, fftconvolve, butter, sosfilt
from kokoro_onnx import Kokoro

SR = 48000

model_dir, script_path, out_dir = sys.argv[1:4]
script = json.load(open(script_path))
voice_cfg = script["voice"]
k = Kokoro(f"{model_dir}/kokoro-v1.0.onnx", f"{model_dir}/voices-v1.0.bin")
style = sum(w * k.get_voice_style(v) for v, w in voice_cfg["blend"])


def room_ir(seconds=0.35, seed=7):
    """Short, dark room reverb so the voice sits in a space instead of a vacuum."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.linspace(0, 9, n))
    ir = sosfilt(butter(2, 3500, "low", fs=SR, output="sos"), ir)
    ir[0] = 0
    return ir / np.abs(ir).sum() * 6


def trim(x, thresh=0.004):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a, b = max(0, idx[0] - int(0.02 * SR)), min(len(x), idx[-1] + int(0.06 * SR))
    return x[a:b]


lead_in = script.get("lead_in", 0.0)
cursor = lead_in
chunks, timings = [], {}
for line in script["lines"]:
    if line.get("at") is not None:          # pin a line to an absolute time (e.g. after a musical beat)
        cursor = max(cursor, line["at"])
    audio, sr = k.create(line["text"], voice=style, speed=line.get("speed", voice_cfg["speed"]), lang="en-us")
    audio = trim(resample_poly(audio, SR, sr))
    start = cursor
    chunks.append((start, audio))
    cursor = start + len(audio) / SR
    timings[line["id"]] = {"start": round(start, 3), "end": round(cursor, 3), "text": line["text"],
                           "caption": line.get("caption", line["text"]), "section": line.get("section", "")}
    cursor += line.get("pause", 0.45)

total = cursor + script.get("tail", 0.0)
dry = np.zeros(int(total * SR) + SR)
for start, audio in chunks:
    i = int(start * SR)
    dry[i:i + len(audio)] += audio

# Voice chain: rumble cut, a little warmth and presence, gentle room.
voice = sosfilt(butter(2, 75, "high", fs=SR, output="sos"), dry)
low = sosfilt(butter(2, 220, "low", fs=SR, output="sos"), voice)
pres = sosfilt(butter(2, [2500, 5000], "band", fs=SR, output="sos"), voice)
voice = voice + 0.25 * low + 0.18 * pres
wet = fftconvolve(voice, room_ir())[: len(voice)]
voice = voice + 0.10 * wet
voice = voice / np.max(np.abs(voice)) * 0.89

sf.write(f"{out_dir}/narration.wav", voice.astype(np.float32), SR, subtype="FLOAT")
json.dump({"total": round(total, 3), "lines": timings}, open(f"{out_dir}/timings.json", "w"), indent=1)
print(f"narration {total:.1f}s, {len(timings)} lines")
