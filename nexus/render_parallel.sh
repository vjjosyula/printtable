#!/usr/bin/env bash
# Render a composition in N parallel slices (separate browsers = separate software-GPU processes),
# then stitch the slices and mux the soundtrack.
# Usage: ./render_parallel.sh <CompositionId> <out.mp4> <scale> <slices> [preview]
set -euo pipefail
COMP=$1; OUT=$2; SCALE=$3; N=$4; PREVIEW=${5:-}
TOTAL=2700
BROWSER=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
WORK=out/slices_${COMP}_$(basename "$OUT" .mp4)
mkdir -p "$WORK"
PROPS='{}'; [ -n "$PREVIEW" ] && PROPS='{"preview":true}'
npx remotion bundle src/index.ts --out-dir "$WORK/bundle" >/dev/null 2>&1 || true
SERVE="$WORK/bundle"; [ -d "$SERVE" ] || SERVE=src/index.ts
pids=()
for i in $(seq 0 $((N-1))); do
  a=$(( TOTAL * i / N )); b=$(( TOTAL * (i+1) / N - 1 ))
  npx remotion render "$SERVE" "$COMP" "$WORK/part$i.mp4" --frames=$a-$b --scale=$SCALE --crf=18 --muted \
    --concurrency=1 --gl=angle --browser-executable=$BROWSER --timeout=300000 --props="$PROPS" \
    > "$WORK/part$i.log" 2>&1 &
  pids+=($!)
done
for p in "${pids[@]}"; do wait $p; done
: > "$WORK/list.txt"
for i in $(seq 0 $((N-1))); do echo "file 'part$i.mp4'" >> "$WORK/list.txt"; done
CRF=20; [ -n "$PREVIEW" ] && CRF=26
ffmpeg -v error -y -f concat -safe 0 -i "$WORK/list.txt" -i public/soundtrack.wav \
  -map 0:v -map 1:a -c:v libx264 -preset medium -crf $CRF -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
echo "DONE $OUT"
