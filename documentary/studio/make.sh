#!/usr/bin/env bash
# The Flywheel (v2 or v3, default v3): ElevenLabs cast, score and sound design -> mix -> picture -> master.
# Usage: studio/make.sh [v3|v2]
# Needs ELEVENLABS_API_KEY in the repo's .env.local (run `npx -y @elevenlabs/cli@latest onboard init`).
# Generated audio is cached in out/<version>, so re-runs only pay for what changed.
set -euo pipefail
cd "$(dirname "$0")/.."
V=${1:-v3}
OUT=out/$V
mkdir -p "$OUT"

python3 -u studio/voices.py "script/$V/bible.json" "$OUT"
python3 - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
t = json.load(open(f"{out}/timings.json"))
w = json.load(open(f"{out}/words.json"))
open(f"{out}/timings.js", "w").write(f"window.TIMINGS = {json.dumps(t)};\nwindow.WORDS = {json.dumps(w)};\nwindow.FILM_DURATION = window.TIMINGS.total;\n")
PY
python3 -u studio/music.py "script/$V/bible.json" "script/$V/score.json" "$OUT"
python3 -u studio/sfx.py "script/$V/bible.json" "script/$V/sfx_cues.json" "$OUT"
# impacts drive the picture's camera punches and flashes
python3 - "$OUT" <<'PY'
import json, sys
out = sys.argv[1]
K = {"sfx_hit": 1.0, "sfx_sub_drop": 0.7, "sfx_braam": 0.6, "sfx_hit_small": 0.35}
hits = sorted(({"t": p["t"], "k": K[p["sfx"]]} for p in json.load(open(f"{out}/sfx/placements.json")) if p["sfx"] in K), key=lambda h: h["t"])
open(f"{out}/hits.js", "w").write(f"window.HITS = {json.dumps(hits)};\n")
PY
python3 -u studio/mix.py "$OUT" "script/$V/mutes.json"
python3 build/captions.py "$OUT/timings.json" "$OUT/captions.srt" "script/$V/no_captions.json"
node build/render.mjs "film_$V.html" "$OUT/picture.mp4" --fps 24 --workers "${WORKERS:-3}"

# two-pass loudness normalisation to -14 LUFS
stats=$(ffmpeg -hide_banner -i "$OUT/mix.wav" -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
get() { echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['$1'])"; }
ffmpeg -y -hide_banner -loglevel error -i "$OUT/picture.mp4" -i "$OUT/mix.wav" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(get input_i):measured_TP=$(get input_tp):measured_LRA=$(get input_lra):measured_thresh=$(get input_thresh):linear=true,aresample=48000" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 24 -tune film -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart \
  "$OUT/The_Flywheel_$V.mp4"
ffprobe -v error -show_entries format=duration,size -of default=nw=1 "$OUT/The_Flywheel_$V.mp4"
