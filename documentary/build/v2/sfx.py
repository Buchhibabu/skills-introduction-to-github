"""Generate the sound effects with ElevenLabs and resolve where each one lands.

Usage: python3 build/v2/sfx.py script/v2/bible.json script/v2/sfx_cues.json out/v2
sfx_cues.json: [{"sfx": id, "at": <time-ref>, "gain_db": -6, "pan": 0}] where a time-ref is seconds,
"line:<id>:start|end[+/-s]" or "word:<line id>:<word>[+/-s]" (when the narrator says that word).
Writes out/v2/sfx/<id>.mp3 (cached by prompt) and out/v2/sfx/placements.json.
"""
import hashlib, json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eleven import client, credits_used  # noqa: E402

bible = json.loads(Path(sys.argv[1]).read_text())
cues = json.loads(Path(sys.argv[2]).read_text())
out = Path(sys.argv[3])
timings = json.loads((out / "timings.json").read_text())
words = json.loads((out / "words.json").read_text())
(out / "sfx").mkdir(parents=True, exist_ok=True)
ledger_path = out / "ledger.json"
ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []


def t_of(ref):
    if isinstance(ref, (int, float)):
        return float(ref)
    m = re.match(r"line:([^:]+):(start|end)([+-][0-9.]+)?$", ref)
    if m:
        return timings["lines"][m.group(1)][m.group(2)] + float(m.group(3) or 0)
    m = re.match(r"word:([^:]+):([^+-]+)([+-][0-9.]+)?$", ref)
    if m:
        target = re.sub(r"[^a-z0-9]", "", m.group(2).lower())
        for w in words.get(m.group(1), []):
            if re.sub(r"[^a-z0-9]", "", w["w"].lower()).startswith(target):
                return w["start"] + float(m.group(3) or 0)
        ln = timings["lines"][m.group(1)]
        print(f"  warning: word '{m.group(2)}' not found in {m.group(1)}; using line midpoint")
        return (ln["start"] + ln["end"]) / 2 + float(m.group(3) or 0)
    raise ValueError(f"bad time ref {ref}")


specs = {s["id"]: s for s in bible["sfx"]}
files = {}
for sid in sorted({c["sfx"] for c in cues}):
    s = specs[sid]
    key = hashlib.sha1(json.dumps([s["prompt"], s["duration_s"], s.get("loop", False), s.get("prompt_influence")], sort_keys=True).encode()).hexdigest()[:10]
    path = out / "sfx" / f"{sid}_{key}.mp3"
    if not path.exists():
        before, _ = credits_used()
        audio = client.text_to_sound_effects.convert(text=s["prompt"], duration_seconds=max(0.5, min(30.0, s["duration_s"])),
                                                     prompt_influence=s.get("prompt_influence", 0.5), loop=bool(s.get("loop", False)),
                                                     output_format="mp3_44100_192")
        path.write_bytes(b"".join(audio))
        time.sleep(1.0)
        after, _ = credits_used()
        ledger.append({"item": f"sfx {sid}", "credits_before": before, "credits_after": after})
        ledger_path.write_text(json.dumps(ledger, indent=1))
        print(f"generated sfx {sid}")
    files[sid] = str(path)

placements = [{"sfx": c["sfx"], "file": files[c["sfx"]], "t": round(t_of(c["at"]), 3), "gain_db": c.get("gain_db", specs[c["sfx"]].get("gain_db", -6)),
               "pan": c.get("pan", 0.0), "dur": c.get("dur"), "fade_out": c.get("fade_out", 0.05), "fade_in": c.get("fade_in", 0.0),
               "until": round(t_of(c["until"]), 3) if c.get("until") is not None else None, "bed": bool(c.get("until"))} for c in cues]
for c, pl in zip(cues, placements):
    if c.get("cut") is not None:
        pl["dur"] = round(t_of(c["cut"]) - pl["t"], 3)
        pl["fade_out"] = c.get("fade_out", 0.3)
(out / "sfx" / "placements.json").write_text(json.dumps(placements, indent=1))
print(f"{len(placements)} sfx placed from {len(files)} sounds")
