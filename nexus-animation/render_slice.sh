#!/usr/bin/env bash
# Render one frame range of a composition as a silent MP4 slice (for distributed rendering).
# Usage: ./render_slice.sh <CompositionId> <firstFrame> <lastFrame> <out.mp4>
set -euo pipefail
COMP=$1; A=$2; B=$3; OUT=$4
BROWSER=${BROWSER:-/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell}
mkdir -p "$(dirname "$OUT")"
npx remotion render src/index.ts "$COMP" "$OUT" --frames=$A-$B --crf=16 --muted \
  --concurrency=1 --gl=angle --browser-executable="$BROWSER" --timeout=300000
