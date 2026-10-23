"""Cast the voices and perform every line of a production bible with ElevenLabs.

Usage: python3 studio/voices.py script/v3/bible.json out/v3
Writes <out>/cast.json, <out>/lines/<id>.mp3 (+ .json alignment), <out>/timings.json,
<out>/words.json, <out>/voices.wav (all lines placed on the timeline, 48 kHz stereo).

Each line is performed several times ("takes", default 4); the kept take is the most expressive
(widest pitch movement) among those the speech recogniser hears correctly, so no line is read flat.
A line can "reuse" an earlier recording, pin its start ("at_s") or its end ("end_at_s"), and be
panned ("pan" on the line or its role). Panning happens here, not in the TTS request.

Generated assets are cached: re-running only performs lines whose text/voice changed.
"""
import base64, difflib, hashlib, json, re, subprocess, sys, time
from pathlib import Path

import numpy as np
import soundfile as sf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from eleven import client, credits_used, retry  # noqa: E402
from elevenlabs import VoiceSettings  # noqa: E402

SR = 48000
bible_path, out = Path(sys.argv[1]), Path(sys.argv[2])
bible = json.loads(bible_path.read_text())
(out / "lines").mkdir(parents=True, exist_ok=True)
# SHARD=i/n records only every n-th line (run n copies in parallel), then a plain run builds the timeline
SHARD = tuple(int(v) for v in __import__("os").environ.get("SHARD", "0/1").split("/"))
ledger_path = out / ("ledger.json" if SHARD[1] == 1 else f"ledger_shard{SHARD[0]}.json")
ledger = json.loads(ledger_path.read_text()) if ledger_path.exists() else []


def log_cost(label, before):
    time.sleep(1.5)
    after, _ = credits_used()
    ledger.append({"item": label, "credits_before": before, "credits_after": after})
    ledger_path.write_text(json.dumps(ledger, indent=1))


def spoken(text):
    """Text without audio tags, for ASR comparison and captions."""
    return re.sub(r"\s+", " ", re.sub(r"\[[^\]]*\]", " ", text)).strip()


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2)


_asr = None


def transcribe(audio):
    global _asr
    if _asr is None:
        from faster_whisper import WhisperModel
        _asr = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
    mono16 = audio.mean(1)[::3].astype(np.float32)
    return " ".join(s.text for s in _asr.transcribe(mono16, beam_size=5, language="en")[0])


ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
ORD = {"one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth"}


def say_int(n):
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else " " + ONES[n % 10])
    if n < 1000:
        return ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + say_int(n % 100))
    for size, name in ((10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")):
        if n >= size:
            return say_int(n // size) + " " + name + ("" if n % size == 0 else " " + say_int(n % size))


def spell_numbers(s):
    """Spell out digits the way the script does ("2022" -> "twenty twenty two", "30th" -> "thirtieth")."""
    def one(m):
        n, suffix = int(m.group(1)), m.group(2)
        if suffix:
            w = say_int(n).split()
            last = w[-1]
            w[-1] = ORD.get(last, last[:-1] + "ieth" if last.endswith("y") else last + "th")
            return " ".join(w)
        if 2000 <= n <= 2099 and n % 100 >= 10:
            return "twenty " + say_int(n % 100)
        if 1900 <= n <= 1999:
            return say_int(n // 100) + " " + say_int(n % 100)
        return say_int(n)
    s = re.sub(r"(\d+)\.(\d+)", lambda m: f"{m.group(1)} point {' '.join(m.group(2))}", s)
    return re.sub(r"(\d+)(st|nd|rd|th)?", one, s)


def letters(s):
    """Compare on letters only, so 'ChatGPT' == 'Chat GPT' and punctuation never matters."""
    s = spell_numbers(s.lower().replace("%", " percent"))
    return re.sub(r"[^a-z]", "", s)


def match(a, b):
    return difflib.SequenceMatcher(None, letters(a), letters(b), autojunk=False).ratio()


def pitch_sd(audio):
    """Spread of the voice's pitch in semitones (autocorrelation F0 per 10 ms); low values sound flat."""
    x = audio.mean(1)[::3].astype(np.float64)
    sr, fr, hop, f0 = SR // 3, int(0.04 * SR / 3), int(0.01 * SR / 3), []
    for i in range(0, len(x) - fr, hop):
        w = x[i:i + fr] * np.hanning(fr)
        if np.sqrt(np.mean(w ** 2)) < 0.01:
            continue
        ac = np.correlate(w, w, "full")[fr - 1:]
        lo, hi = int(sr / 400), int(sr / 60)
        k = lo + np.argmax(ac[lo:hi])
        if ac[k] > 0.4 * ac[0]:
            f0.append(sr / k)
    if len(f0) < 10:
        return 0.0, 0.0, 0.0
    voiced = len(f0) / max(1, (len(x) - fr) // hop)
    f0 = np.array(f0)
    st = 12 * np.log2(f0 / np.median(f0))
    return float(np.median(f0)), float(np.std(st[np.abs(st) < 12])), float(voiced)


# ---------------- cast ----------------
cast_path = out / "cast.json"
cast = json.loads(cast_path.read_text()) if cast_path.exists() else {}
roles = {c["role"]: c for c in bible["cast"]}
for role, spec in roles.items():
    key = hashlib.sha1(json.dumps(spec, sort_keys=True).encode()).hexdigest()[:10]
    if role in cast and cast[role].get("spec_hash") == key:
        continue
    if spec["voice_source"] == "premade":
        cast[role] = {"voice_id": spec["voice_id"], "spec_hash": key}
        continue
    sample = " ".join(spoken(l["text"]) for l in bible["lines"] if l["speaker"] == role)
    sample = (sample + " " + spoken(bible["logline"]))[:900]
    if len(sample) < 120:
        sample = (sample + " Every prompt, every correction, every thumbs-up became a signal. The signal had a destination.")[:900]
    before, _ = credits_used()
    d = retry(client.text_to_voice.design, voice_description=spec["design_prompt"], model_id="eleven_ttv_v3", text=sample)
    best, best_score = None, -1
    for p in d.previews:
        pth = out / "lines" / f"_design_{role}_{p.generated_voice_id}.mp3"
        pth.write_bytes(base64.b64decode(p.audio_base_64))
        score = match(sample, transcribe(decode(pth)))
        if score > best_score:
            best, best_score = p.generated_voice_id, score
    v = client.text_to_voice.create(voice_name=f"Flywheel - {role.title()}", voice_description=spec["design_prompt"][:1000],
                                    generated_voice_id=best)
    log_cost(f"design voice {role}", before)
    cast[role] = {"voice_id": v.voice_id, "spec_hash": key, "designed": True, "preview_match": round(best_score, 3)}
    print(f"designed {role}: {v.voice_id} (preview match {best_score:.2f})")
    cast_path.write_text(json.dumps(cast, indent=1))
cast_path.write_text(json.dumps(cast, indent=1))

# ---------------- lines ----------------
lines = bible["lines"]
default_takes = bible.get("default_takes", 4)
for i, ln in enumerate(lines):
    if i % SHARD[1] != SHARD[0]:
        continue
    spec = roles[ln["speaker"]]
    voice_id = cast[ln["speaker"]]["voice_id"]
    mp3, meta = out / "lines" / f"{ln['id']}.mp3", out / "lines" / f"{ln['id']}.json"
    if ln.get("reuse"):  # an earlier recording kept as is (e.g. the v2 cold open)
        src = Path(ln["reuse"])
        h = "reuse:" + hashlib.sha1(src.with_suffix(".mp3").read_bytes()).hexdigest()[:12]
        if not (meta.exists() and json.loads(meta.read_text()).get("hash") == h):
            m = json.loads(src.with_suffix(".json").read_text())
            mp3.write_bytes(src.with_suffix(".mp3").read_bytes())
            meta.write_text(json.dumps({**m, "hash": h, "reused_from": str(src)}, indent=0))
        continue
    stab = ln.get("stability", spec["stability"])
    eff = {k: v for k, v in (spec.get("effects") or {}).items() if v not in (None, "", 0) or k == "pan"}
    eff = {k: v for k, v in eff.items() if not (k == "pan" and not v)}
    takes = ln.get("takes", default_takes)
    payload = {"text": ln["text"], "voice": voice_id, "stab": stab, "sim": spec["similarity_boost"], "eff": eff, "takes": takes}
    h = hashlib.sha1(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:12]
    if meta.exists() and json.loads(meta.read_text()).get("hash") == h:
        continue
    same = [l for l in lines if l["speaker"] == ln["speaker"]]
    k = same.index(ln)
    prev_t = spoken(same[k - 1]["text"]) if k > 0 else None
    next_t = spoken(same[k + 1]["text"]) if k + 1 < len(same) else None
    results = []
    before, _ = credits_used()
    for take in range(takes):
        kwargs = dict(voice_id=voice_id, text=ln["text"], model_id="eleven_v4", output_format="mp3_44100_192",
                      voice_settings=VoiceSettings(stability=stab, similarity_boost=spec["similarity_boost"]),
                      previous_text=prev_t, next_text=next_t, seed=1000 + take)
        if eff:
            from elevenlabs import EffectsSpecInput
            kwargs["audio_effects"] = EffectsSpecInput(**eff)
        r = retry(client.text_to_speech.convert_with_timestamps, **kwargs)
        tmp = out / "lines" / f"_{ln['id']}_take{take + 1}.mp3"
        tmp.write_bytes(base64.b64decode(r.audio_base_64))
        audio = decode(tmp)
        heard = transcribe(audio)
        score = match(spoken(ln["text"]), heard)
        f0, sd, voiced = pitch_sd(audio)
        al = r.alignment.model_dump() if r.alignment else None
        results.append({"take": take + 1, "match": score, "f0": f0, "pitch_sd": sd, "voiced": voiced, "tmp": tmp, "al": al, "heard": heard})
        print(f"  {ln['id']:14s} take {take + 1}: match {score:.2f} | F0 {f0:4.0f} Hz | pitch sd {sd:4.2f} st | {heard.strip()[:70]}")
    log_cost(f"line {ln['id']} ({takes} takes)", before)
    best_match = max(r["match"] for r in results)
    ok = [r for r in results if r["match"] >= best_match - 0.03]
    # a whisper should be a real whisper (least voiced); anything else, the liveliest pitch
    best = min(ok, key=lambda r: r["voiced"]) if "[whispers]" in ln["text"] else max(ok, key=lambda r: r["pitch_sd"])
    mp3.write_bytes(best["tmp"].read_bytes())
    meta.write_text(json.dumps({"hash": h, "match": round(best["match"], 3), "heard": best["heard"], "take": best["take"],
                                "f0": round(best["f0"], 1), "pitch_sd": round(best["pitch_sd"], 2),
                                "takes": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items() if k in ("take", "match", "f0", "pitch_sd")} for r in results],
                                "alignment": best["al"]}, indent=0))

if SHARD[1] > 1:
    sys.exit(0)

# ---------------- timeline ----------------
def trim_bounds(a, thresh=0.003):
    idx = np.where(np.abs(a).max(1) > thresh)[0]
    return (0, len(a)) if len(idx) == 0 else (max(0, idx[0] - int(0.015 * SR)), min(len(a), idx[-1] + int(0.08 * SR)))


lead_in = bible.get("lead_in_s", 2.0)
cursor, prev_start = lead_in, lead_in
placed, timings, words = [], {}, {}
for ln in lines:
    a = decode(out / "lines" / f"{ln['id']}.mp3")
    s0, s1 = trim_bounds(a)
    a = a[s0:s1]
    start = prev_start + ln.get("overlap_offset_s", 0.8) if ln.get("overlap_with_previous") else cursor
    if ln.get("at_s") is not None:
        start = max(start, ln["at_s"])
    if ln.get("end_at_s") is not None:
        start = ln["end_at_s"] - len(a) / SR
    end = start + len(a) / SR
    pan = ln.get("pan", roles[ln["speaker"]].get("pan", 0.0))
    if pan:  # equal-power pan of the mono-compatible line
        m = a.mean(1)
        a = np.stack([m * np.cos((pan + 1) * np.pi / 4), m * np.sin((pan + 1) * np.pi / 4)], 1) * np.sqrt(2)
    placed.append((start, a))
    meta = json.loads((out / "lines" / f"{ln['id']}.json").read_text())
    al = meta.get("alignment") or {}
    # words from the character alignment, skipping [audio tags]
    ws, cur, cs, ce, in_tag = [], "", None, None, False
    for ch, t0, t1 in zip(al.get("characters", []), al.get("character_start_times_seconds", []), al.get("character_end_times_seconds", [])):
        if ch == "[":
            in_tag = True
        if in_tag:
            in_tag = ch != "]"
            continue
        if ch.isspace():
            if cur:
                ws.append({"w": cur, "start": round(start + cs - s0 / SR, 3), "end": round(start + ce - s0 / SR, 3)})
            cur, cs = "", None
            continue
        cur += ch
        cs = t0 if cs is None else cs
        ce = t1
    if cur:
        ws.append({"w": cur, "start": round(start + cs - s0 / SR, 3), "end": round(start + ce - s0 / SR, 3)})
    words[ln["id"]] = ws
    timings[ln["id"]] = {"start": round(start, 3), "end": round(end, 3), "text": spoken(ln["text"]), "caption": ln["caption"],
                         "section": ln["sequence"], "speaker": ln["speaker"]}
    prev_start = start
    cursor = max(cursor, end + ln.get("pause_after_s", 0.4))

total = cursor + bible.get("tail_s", 4.0)
bus = np.zeros((int(total * SR) + SR, 2), np.float32)
for start, a in placed:
    i = int(start * SR)
    bus[i:i + len(a)] += a
sf.write(out / "voices.wav", bus, SR, subtype="FLOAT")
(out / "timings.json").write_text(json.dumps({"total": round(total, 3), "lines": timings}, indent=1))
(out / "words.json").write_text(json.dumps(words))
low = {k: json.loads((out / "lines" / f"{k}.json").read_text())["match"] for k in timings}
print(f"timeline {total:.1f}s, {len(timings)} lines; lowest ASR matches:", sorted(low.items(), key=lambda kv: kv[1])[:5])
