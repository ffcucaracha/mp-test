#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
MODE="${ANDROID_MODE:-usb}"
PACKAGE="com.agroconnect.mvp"

find_adb() {
  if command -v adb >/dev/null 2>&1; then
    command -v adb
    return
  fi
  for candidate in \
    "${ANDROID_HOME:-}/platform-tools/adb" \
    "${ANDROID_SDK_ROOT:-}/platform-tools/adb" \
    "/media/saa/Data/Android/Sdk/platform-tools/adb"; do
    if [[ -n "$candidate" && -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  echo "adb не найден. Укажите ANDROID_HOME/ANDROID_SDK_ROOT или добавьте platform-tools в PATH." >&2
  exit 1
}

ADB="$(find_adb)"

if ! "$ADB" get-state >/dev/null 2>&1; then
  echo "Android-устройство/эмулятор не найден. Проверьте USB debugging или запустите эмулятор." >&2
  "$ADB" devices
  exit 1
fi

case "$MODE" in
  emulator)
    API_URL="${ANDROID_BACKEND_URL:-http://10.0.2.2:8000}"
    ;;
  usb)
    "$ADB" reverse tcp:8000 tcp:8000 >/dev/null
    API_URL="${ANDROID_BACKEND_URL:-http://127.0.0.1:8000}"
    ;;
  lan)
    if [[ -z "${ANDROID_BACKEND_URL:-}" ]]; then
      echo "Для ANDROID_MODE=lan задайте ANDROID_BACKEND_URL, например http://192.168.1.20:8000" >&2
      exit 1
    fi
    API_URL="$ANDROID_BACKEND_URL"
    ;;
  *)
    echo "ANDROID_MODE должен быть usb, emulator или lan" >&2
    exit 1
    ;;
esac

echo "Android mode: $MODE"
echo "Backend URL: $API_URL"

cd "$FRONTEND_DIR"
VITE_API_URL="$API_URL" npm run build
npx cap sync android
cd android
./gradlew installDebug

"$ADB" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true

echo "AgroConnect установлен и запущен."
echo "Для диагностики: $ADB logcat | grep -i -E 'Capacitor|chromium|ERR_|network|cleartext|mixed content'"
