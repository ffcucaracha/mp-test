#!/usr/bin/env bash
set -euo pipefail

# Records demo/test_demo_video.py in a clean virtual desktop. The resulting
# MP4 contains only the 450×1000 mobile web canvas, no browser chrome or IDE.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${DEMO_OUTPUT_DIR:-$ROOT_DIR/demo/output}"
DISPLAY_NO="${DEMO_DISPLAY:-:99}"
VIDEO_SIZE="${DEMO_VIDEO_SIZE:-450x1000}"
BASE_URL="${DEMO_BASE_URL:-http://127.0.0.1:5173}"
VIDEO_FILE="${DEMO_VIDEO_FILE:-$OUTPUT_DIR/agroconnect-demo-$(date +%Y%m%d-%H%M%S).mp4}"

for command in Xvfb ffmpeg python3; do
  command -v "$command" >/dev/null || { echo "Не найдено: $command" >&2; exit 1; }
done
if ! command -v google-chrome >/dev/null && ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null; then
  echo "Не найден Chrome/Chromium для Selenium" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
python3 -c 'import selenium, pytest' 2>/dev/null || {
  echo "Установи зависимости: python3 -m pip install -r demo/requirements.txt" >&2
  exit 1
}

cleanup() {
  [[ -n "${FFMPEG_PID:-}" ]] && kill -INT "$FFMPEG_PID" 2>/dev/null || true
  [[ -n "${XVFB_PID:-}" ]] && kill "$XVFB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

Xvfb "$DISPLAY_NO" -screen 0 "${VIDEO_SIZE}x24" -nolisten tcp >/dev/null 2>&1 &
XVFB_PID=$!
sleep 1

ffmpeg -y -loglevel warning \
  -f x11grab -framerate 30 -video_size "$VIDEO_SIZE" -i "${DISPLAY_NO}.0" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p "$VIDEO_FILE" &
FFMPEG_PID=$!
sleep 1

DISPLAY="$DISPLAY_NO" \
DEMO_BASE_URL="$BASE_URL" \
python3 -m pytest -q -s demo/test_demo_video.py

kill -INT "$FFMPEG_PID"
wait "$FFMPEG_PID" || true
unset FFMPEG_PID
echo "Готово: $VIDEO_FILE"
