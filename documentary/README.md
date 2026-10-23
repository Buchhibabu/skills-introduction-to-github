# The Flywheel — a 3-minute documentary

*Why AI is almost free — and what else you pay with.*

- **Video:** `release/The_Flywheel.mp4` (1080p, 24 fps, about 3:08, loudness-normalised to about −15 LUFS)
- **Captions:** `release/The_Flywheel.srt`
- **Description, chapters and sources:** `release/DESCRIPTION.md`
- **Research:** `research/fact-sheet.md`: corrections to the original brief, the narrative evidence, a "do not say" list and every source. `research/verified-facts.json` holds 64 claims, each checked by a researcher and an independent verifier.

## v3 — the trailer cut (about 4 minutes)

- **Video:** `release/v3/The_Flywheel_v3.mp4` · **Captions:** `release/v3/The_Flywheel_v3.srt` · **Description and sources:** `release/v3/DESCRIPTION.md`
- **What changed from v2.**
  - Natural voices only. The archive reader and the "for the record" voice are gone, and the narrator reads every quote. No voice uses a filter or effect, and no voices are stacked.
  - Trailer energy all the way through. The script is tighter, and each exhibit has its own score cue, climbing in tempo and weight. Impacts land on every chapter card and reveal. A three-band duck keeps the score's drums and sub under the narration.
  - Cinematic 3D documentary footage under the evidence, instead of document slides. The shots are rendered with three.js from `broll/shots/` and land on the words they illustrate.
- **Direction:** `script/v3/bible.json` (cast, lines, score cues, sound design), `script/v3/visuals.js` (evidence on top, B-roll track underneath).
- **B-roll:** `broll/kit.js` is the shared renderer and helpers. Preview a single shot with `node build/shot_sheet.mjs <shot> out.png --dur 6`, which renders a contact sheet and reports cost and determinism.
- **Rebuild:** run `studio/make.sh` (it builds v3 by default; pass `v2` for the v2 cut).

## v2 — the ElevenLabs production (about 4½ minutes)

- **Video:** `release/v2/The_Flywheel_v2.mp4` · **Captions:** `release/v2/The_Flywheel_v2.srt` · **Description and sources:** `release/v2/DESCRIPTION.md`
- **Direction:** `script/v2/bible.json` is the production bible from a three-director panel. It holds the 15-role cast, all 68 lines with audio tags, five music cues, 28 sound effects and the transitions. `script/v2/visuals.js` is the shot list.
- **Studio:** `studio/` holds the ElevenLabs code. `eleven.py` loads the key from the repo's git-ignored `.env.local`. `voices.py` designs and casts the voices and records each line with `eleven_v4`, keeping the best of up to three takes as judged by speech recognition. `music.py` composes Eleven Music cues fitted to the cut. `sfx.py` generates the sound effects and places them on spoken words. `mix.py` handles adaptive ducking, the directed silences and a peak limiter.
- **Rebuild:** run `studio/make.sh`. Generated audio is cached in `out/v2`, so re-runs only pay for what changed. The whole v2 production used about 19k ElevenLabs credits (about 5% of a Creator month).
- **Key setup:** `npx -y @elevenlabs/cli@latest onboard init` from the repo root, then `onboard check --env-path ../.env.local` from `documentary/`.

## How it is made (v1)

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
