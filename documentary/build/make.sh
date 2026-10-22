#!/usr/bin/env bash
# Full build: narration -> timings -> sound cues -> score/mix -> frames -> final MP4 (+ captions).
#   KOKORO_DIR=/path/to/kokoro-model-files build/make.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${KOKORO_DIR:?set KOKORO_DIR to the folder holding kokoro-v1.0.onnx and voices-v1.0.bin}"
mkdir -p out

python3 build/narrate.py "$KOKORO_DIR" script/narration.json out
python3 build/align.py out/narration.wav out/timings.json out/words.json
python3 - <<'PY'
import json
t = json.load(open("out/timings.json"))
w = json.load(open("out/words.json"))
open("out/timings.js", "w").write(f"window.TIMINGS = {json.dumps(t)};\nwindow.WORDS = {json.dumps(w)};\nwindow.FILM_DURATION = window.TIMINGS.total;\n")
PY
node build/cues.mjs film.html out/cues.json
python3 build/score.py out
python3 build/captions.py out/timings.json out/captions.srt
node build/render.mjs film.html out/picture.mp4 --fps 24 --workers "${WORKERS:-3}"

# two-pass loudness normalisation to -14 LUFS for online platforms
stats=$(ffmpeg -hide_banner -i out/mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
mi=$(echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_i'])")
mtp=$(echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_tp'])")
mlra=$(echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_lra'])")
mth=$(echo "$stats" | python3 -c "import json,sys;print(json.load(sys.stdin)['input_thresh'])")
ffmpeg -y -hide_banner -loglevel error -i out/picture.mp4 -i out/mix.wav \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:linear=true,aresample=48000" \
  -map 0:v -map 1:a -c:v libx264 -preset slow -crf 23 -tune film -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -movflags +faststart \
  out/The_Flywheel.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 out/The_Flywheel.mp4
