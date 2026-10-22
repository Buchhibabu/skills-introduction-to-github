"""Writes SubRip captions from the narration timings, splitting long lines at sentence/clause breaks.

Usage: python3 build/captions.py out/timings.json out/captions.srt
"""
import json, re, sys

timings = json.load(open(sys.argv[1]))["lines"]


def stamp(s):
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    return f"{int(h):02}:{int(m):02}:{int(sec):02},{int(round((sec % 1) * 1000)) % 1000:03}"


cues = []
for line in timings.values():
    text = line.get("caption") or line["text"]
    parts = [p.strip() for p in re.split(r"(?<=[.!?])\s+", text) if p.strip()]
    chunks = []
    for p in parts:  # keep each caption to ~84 characters
        while len(p) > 84:
            cut = p.rfind(", ", 0, 84)
            cut = cut + 1 if cut > 30 else p.rfind(" ", 0, 84)
            chunks.append(p[:cut].strip()); p = p[cut:].strip()
        chunks.append(p)
    total = sum(len(c) for c in chunks)
    t = line["start"]
    for c in chunks:
        dur = (line["end"] - line["start"]) * len(c) / total
        cues.append((t, t + dur, c)); t += dur

with open(sys.argv[2], "w") as f:
    for i, (a, b, c) in enumerate(cues, 1):
        f.write(f"{i}\n{stamp(a)} --> {stamp(b)}\n{c}\n\n")
print(f"{len(cues)} captions")
