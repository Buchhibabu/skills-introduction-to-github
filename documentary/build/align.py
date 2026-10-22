"""Word-level timestamps for the narration (Whisper), so on-screen highlights land on the spoken word.
Also reports lines whose transcript drifts from the script, which usually means a mispronunciation.

Usage: python3 build/align.py out/narration.wav out/timings.json out/words.json
"""
import difflib, json, re, sys
import soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

wav, timings_path, out_path = sys.argv[1:4]
lines = json.load(open(timings_path))["lines"]
x, sr = sf.read(wav)
x16 = resample_poly(x, 16000, sr).astype("float32")
model = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)

NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"}


def norm(s):
    s = s.lower().replace("-", " ").replace("%", " percent")
    return re.sub(r"[^a-z0-9 ]", " ", s).split()


words, drift = {}, []
for lid, ln in lines.items():
    a = max(0, int((ln["start"] - 0.1) * 16000))
    seg = x16[a: int((ln["end"] + 0.15) * 16000)]
    segs, _ = model.transcribe(seg, beam_size=5, language="en", word_timestamps=True)
    ws = [{"w": w.word.strip(), "start": round(a / 16000 + w.start, 3), "end": round(a / 16000 + w.end, 3)} for s in segs for w in s.words]
    words[lid] = ws
    hyp = " ".join(w["w"] for w in ws)
    ratio = difflib.SequenceMatcher(None, norm(ln["text"]), norm(hyp)).ratio()
    if ratio < 0.85:
        drift.append((lid, round(ratio, 2), ln["text"], hyp))

json.dump(words, open(out_path, "w"), indent=0)
print(f"aligned {len(words)} lines")
for d in drift:
    print("CHECK", d)
