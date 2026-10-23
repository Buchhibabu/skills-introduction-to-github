"""Compose the score with Eleven Music, fitting each cue to the cut.

Usage: python3 build/v2/music.py script/v2/bible.json script/v2/score.json out/v2
score.json places each cue on the timeline: [{"cue": id, "from": <time-ref>, "to": <time-ref>}],
where a time-ref is a number (seconds) or "line:<id>:start|end" with an optional "+/-seconds" suffix.
Each cue's composition-plan chunks are rescaled to the slot length, so the music lands on the edit.
Writes out/v2/music/<cue>.mp3 (cached by plan hash) and out/v2/music/placements.json.
"""
import hashlib, json, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from eleven import client, credits_used  # noqa: E402

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


cues = {c["id"]: c for c in bible["music_cues"]}
placements = []
for slot in score:
    cue = cues[slot["cue"]]
    t0, t1 = t_of(slot["from"]), t_of(slot["to"])
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
        c.setdefault("context_adherence", "high")
        c["positive_styles"] = list(c.get("positive_styles", []))
        c["negative_styles"] = list(set(c.get("negative_styles", [])) | {"vocals", "singing", "lyrics"})
    plan = {"chunks": chunks}
    h = hashlib.sha1(json.dumps(plan, sort_keys=True).encode()).hexdigest()[:12]
    path = out / "music" / f"{slot['cue']}_{h}.mp3"
    if not path.exists():
        before, _ = credits_used()
        audio = client.music.compose(composition_plan=plan, model_id="music_v2_5", force_instrumental=True,
                                     respect_sections_durations=True, output_format="mp3_48000_320")
        path.write_bytes(b"".join(audio))
        time.sleep(1.5)
        after, _ = credits_used()
        ledger.append({"item": f"music {slot['cue']} ({length_ms / 1000:.0f}s)", "credits_before": before, "credits_after": after})
        ledger_path.write_text(json.dumps(ledger, indent=1))
        print(f"composed {slot['cue']}: {length_ms / 1000:.1f}s")
    placements.append({"cue": slot["cue"], "file": str(path), "t0": round(t0, 3), "t1": round(t1, 3),
                       "gain_db": slot.get("gain_db", 0.0), "fade_in": slot.get("fade_in", 1.5), "fade_out": slot.get("fade_out", 2.0)})
(out / "music" / "placements.json").write_text(json.dumps(placements, indent=1))
print(f"{len(placements)} cues placed")
