# The Flywheel — a 3-minute documentary

*Why AI is almost free — and what else you pay with.*

- **Video:** `release/The_Flywheel.mp4` (1080p, 24 fps, about 3:08, loudness-normalised to about −15 LUFS)
- **Captions:** `release/The_Flywheel.srt`
- **Description, chapters and sources:** `release/DESCRIPTION.md`
- **Research:** `research/fact-sheet.md`: corrections to the original brief, the narrative evidence, a "do not say" list and every source. `research/verified-facts.json` holds 64 claims, each checked by a researcher and an independent verifier.

## How it is made

Everything is generated from code: no stock footage, no licensed music.

| Step | File | What it does |
|---|---|---|
| Script | `script/narration.json` | Narration lines with sections, captions and pauses |
| Voice | `build/narrate.py` | Kokoro TTS (blended male voice), light EQ and room; writes per-line timings |
| Sync | `build/align.py` | Whisper word timestamps, so highlights and stamps land on the spoken word; flags mispronunciations |
| Picture | `film.html`, `engine.js`, `components.js`, `beats.js`, `scenes.js`, `script/visuals.js` | A deterministic HTML timeline: every frame is a pure function of time |
| Sound | `build/cues.mjs`, `build/score.py` | Sound cues exported from the picture, then a synthesised score (drone, heartbeat, pulse, clock, dawn piano) and SFX, ducked under the voice |
| Render | `build/render.mjs` | Headless Chromium screenshots of every frame, encoded with ffmpeg in parallel segments |
| Master | `build/make.sh` | Runs everything, then two-pass loudness normalisation and the final mux |

## Rebuild

```bash
npm install                      # fonts (OFL) used by the page
pip install kokoro-onnx soundfile scipy faster-whisper
# Kokoro model files: kokoro-v1.0.onnx and voices-v1.0.bin from
# https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
KOKORO_DIR=/path/to/kokoro build/make.sh     # -> out/The_Flywheel.mp4
```

To preview without rendering, build once so that `out/timings.js` exists, then open `film.html?play` in a browser.
