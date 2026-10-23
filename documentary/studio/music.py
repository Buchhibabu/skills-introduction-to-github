"""Compose the score with Eleven Music, fitting each cue to the cut.

Usage: python3 studio/music.py script/v3/bible.json script/v3/score.json out/v3
score.json places each cue on the timeline: [{"cue": id, "from": <time-ref>, "to": <time-ref>}],
where a time-ref is a number (seconds) or "line:<id>:start|end" with an optional "+/-seconds" suffix.
Each cue's composition-plan chunks are rescaled to the slot length, so the music lands on the edit.
A cue can "reuse" an earlier file, or ask for several "variants": each is composed with its own seed and
the kept one has no audible words (speech recogniser), the densest rhythm and a level that builds instead
of sagging. Writes <out>/music/<cue>_<hash>[_vN].mp3 (cached), <out>/music/choices.json and placements.json.
"""
import hashlib, json, re, subprocess, sys, time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eleven import client, credits_used, retry  # noqa: E402

bible = json.loads(Path(sys.argv[1]).read_text())
score = json.loads(Path(sys.argv[2]).read_text())
out = Path(sys.argv[3])
timings = json.loads((out / "timings.json").read_text())
(out / "music").mkdir(parents=True, exist_ok=True)
ledger_path = out / "ledger.json"
ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []


def t_of(ref):
    if isinstance(ref, (int, float)):
        return float(ref)
    if ref == "end":
        return timings["total"]
    m = re.match(r"line:([^:]+):(start|end)([+-][0-9.]+)?$", ref)
    if not m:
        raise ValueError(f"bad time ref {ref}")
    return timings["lines"][m.group(1)][m.group(2)] + float(m.group(3) or 0)


def wrap_lines(text, width=190):
    """The API takes at most 30 lines of 200 characters per chunk: break long directions at clause boundaries."""
    out = []
    for para in text.split("\n"):
        parts = re.split(r"(?<=[.;:])\s+", para.strip())
        line = ""
        for p in parts:
            while len(p) > width:  # very long clause: break at a comma or space
                cut = max(p.rfind(", ", 0, width), p.rfind(" ", 0, width))
                out.append((line + " " + p[:cut]).strip() if line else p[:cut].strip()); line = ""; p = p[cut:].lstrip(", ")
            if len(line) + len(p) + 1 > width:
                out.append(line); line = p
            else:
                line = (line + " " + p).strip()
        if line:
            out.append(line)
    return "\n".join(out[:30])


def decode(path, sr=16000):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


_asr = None


def heard_words(x):
    global _asr
    if _asr is None:
        from faster_whisper import WhisperModel
        _asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
    segs = _asr.transcribe(x, beam_size=1, language="en", vad_filter=True)[0]
    return " ".join(s.text for s in segs if s.no_speech_prob < 0.5).strip()


def judge(path, edges_s):
    """Rhythmic density (onsets/s), build (last section vs first, dB), sag (deepest dip under the median, dB), words heard."""
    x = decode(path)
    sr, n = 16000, 1024
    frames = x[: len(x) // n * n].reshape(-1, n)
    mag = np.abs(np.fft.rfft(frames * np.hanning(n), axis=1))
    flux = np.maximum(0, np.diff(np.log1p(mag), axis=0)).sum(1)
    thr = np.median(flux) + 1.5 * flux.std()
    peaks = np.sum((flux[1:-1] > thr) & (flux[1:-1] >= flux[:-2]) & (flux[1:-1] >= flux[2:]))
    onset_rate = peaks / (len(x) / sr)
    rms = 20 * np.log10(np.sqrt(np.mean(frames ** 2, 1)) + 1e-9)
    win = max(1, int(1.0 * sr / n))
    st = np.convolve(rms, np.ones(win) / win, "valid")
    sag = float(np.median(st) - np.percentile(st, 5))
    secs = [rms[int(a * sr / n):int(b * sr / n)] for a, b in zip(edges_s, edges_s[1:])]
    secs = [q for q in secs if len(q)]
    build = float(np.mean(secs[-1]) - np.mean(secs[0])) if len(secs) > 1 else 0.0
    words = heard_words(x)
    score = onset_rate + 0.25 * np.clip(build, -6, 10) - 0.3 * max(0.0, sag - 9) - (10 if len(words.split()) > 3 else 0)
    return {"onsets_per_s": round(float(onset_rate), 2), "build_db": round(build, 1), "sag_db": round(sag, 1), "words": words, "score": round(float(score), 2)}


cues = {c["id"]: c for c in bible["music_cues"]}
choices_path = out / "music" / "choices.json"
choices = json.loads(choices_path.read_text()) if choices_path.exists() else {}
placements = []
for slot in score:
    cue = cues[slot["cue"]]
    t0, t1 = t_of(slot["from"]), t_of(slot["to"])
    if cue.get("reuse"):
        placements.append({"cue": slot["cue"], "file": cue["reuse"], "t0": round(t0, 3), "t1": round(t1, 3), "gain_db": slot.get("gain_db", 0.0),
                           "fade_in": slot.get("fade_in", 1.5), "fade_out": slot.get("fade_out", 2.0)})
        continue
    length_ms = int((t1 - t0 + slot.get("tail_s", 2.0)) * 1000)
    chunks = [dict(c) for c in cue["chunks"]]
    if slot.get("bounds"):  # explicit chunk boundaries on the timeline, so sections land on the cut
        edges = [t0] + [t_of(b) for b in slot["bounds"]] + [t0 + length_ms / 1000]
        for c, a, b in zip(chunks, edges, edges[1:]):
            c["duration_ms"] = int(min(120000, max(3000, (b - a) * 1000)))
    else:
        scale = length_ms / sum(c["duration_ms"] for c in chunks)
        for c in chunks:
            c["duration_ms"] = int(min(120000, max(3000, c["duration_ms"] * scale)))
        drift = length_ms - sum(c["duration_ms"] for c in chunks)
        chunks[-1]["duration_ms"] = int(min(120000, max(3000, chunks[-1]["duration_ms"] + drift)))
    for c in chunks:
        c["text"] = wrap_lines(c["text"])
        c.setdefault("context_adherence", "high")
        c["positive_styles"] = list(c.get("positive_styles", []))
        c["negative_styles"] = list(set(c.get("negative_styles", [])) | {"vocals", "singing", "lyrics"})
    plan = {"chunks": chunks}
    h = hashlib.sha1(json.dumps(plan, sort_keys=True).encode()).hexdigest()[:12]
    n_var = cue.get("variants", 1)
    edges = np.cumsum([0] + [c["duration_ms"] / 1000 for c in chunks])
    judged = []
    for v in range(n_var):
        path = out / "music" / (f"{slot['cue']}_{h}.mp3" if n_var == 1 else f"{slot['cue']}_{h}_v{v + 1}.mp3")
        if not path.exists():
            before, _ = credits_used()
            audio = retry(client.music.compose, composition_plan=plan, model_id="music_v2_5", seed=4000 + 97 * v,
                          respect_sections_durations=True, output_format="mp3_48000_320")
            path.write_bytes(b"".join(audio))
            time.sleep(1.5)
            after, _ = credits_used()
            ledger.append({"item": f"music {slot['cue']} v{v + 1} ({length_ms / 1000:.0f}s)", "credits_before": before, "credits_after": after})
            ledger_path.write_text(json.dumps(ledger, indent=1))
            print(f"composed {slot['cue']} v{v + 1}: {length_ms / 1000:.1f}s")
        if n_var > 1:
            key = f"{path.name}"
            if key not in choices.get("_judged", {}):
                choices.setdefault("_judged", {})[key] = judge(path, edges)
                choices_path.write_text(json.dumps(choices, indent=1))
            judged.append((choices["_judged"][key]["score"], str(path)))
            print(f"  {path.name}: {choices['_judged'][key]}")
    if n_var > 1:
        path = Path(max(judged)[1])
        choices[slot["cue"]] = path.name
        choices_path.write_text(json.dumps(choices, indent=1))
    placements.append({"cue": slot["cue"], "file": str(path), "t0": round(t0, 3), "t1": round(t1, 3),
                       "gain_db": slot.get("gain_db", 0.0), "fade_in": slot.get("fade_in", 1.5), "fade_out": slot.get("fade_out", 2.0)})
(out / "music" / "placements.json").write_text(json.dumps(placements, indent=1))
print(f"{len(placements)} cues placed")
