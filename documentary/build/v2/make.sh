#!/usr/bin/env bash
# The Flywheel v2: ElevenLabs cast, score and sound design -> mix -> picture -> master.
# Needs ELEVENLABS_API_KEY in the repo's .env.local (run `npx -y @elevenlabs/cli@latest onboard init`).
# Generated audio is cached in out/v2, so re-runs only pay for what changed.
set -euo pipefail
cd "$(dirname "$0")/../.."
OUT=out/v2
mkdir -p "$OUT"

python3 -u build/v2/voices.py script/v2/bible.json "$OUT"
python3 - <<'PY'
import json
t = json.load(open("out/v2/timings.json"))
w = json.load(open("out/v2/words.json"))
open("out/v2/timings.js", "w").write(f"window.TIMINGS = {json.dumps(t)};\nwindow.WORDS = {json.dumps(w)};\nwindow.FILM_DURATION = window.TIMINGS.total;\n")
PY
python3 -u build/v2/music.py script/v2/bible.json script/v2/score.json "$OUT"
python3 -u build/v2/sfx.py script/v2/bible.json script/v2/sfx_cues.json "$OUT"
python3 -u build/v2/mix.py "$OUT" script/v2/mutes.json
python3 build/captions.py "$OUT/timings.json" "$OUT/captions.srt" script/v2/no_captions.json
node build/render.mjs film_v2.html "$OUT/picture.mp4" --fps 24 --workers "${WORKERS:-3}"

# two-pass loudness normalisation to -14 LUFS
stats=$(ffmpeg -hide_banner -i "$OUT/mix.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -hide_banner -loglevel error -i "$OUT/picture.mp4" -i "$OUT/mix.wav" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):linear=true,aresample=48000" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 24 -tune film -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart \
  "$OUT/The_Flywheel_v2.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT/The_Flywheel_v2.mp4"
