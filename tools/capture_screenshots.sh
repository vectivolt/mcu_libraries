#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# JouleSuite for ESP32 / ESP8266 — JouleOTA · JouleSerial · JouleNet · JouleDash
# Author: Chinmoy Bhuyan
# Email:  dikibhuyan@gmail.com
# (c) 2026 — MIT License
# ---------------------------------------------------------------------------
#
# Captures screenshots of the live ESP-served UIs through the local proxy
# (tools/preview_proxy.js → 127.0.0.1:5712 → 192.168.1.100). Each shot
# health-checks the proxy and restarts it if it died, so the only failure
# mode is the ESP itself being unreachable.
#
# Usage:  ./tools/capture_screenshots.sh

set -u
PROXY_PORT=5712
ESP_HOST=${ESP_HOST:-192.168.1.100}
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT=$(cd "$(/usr/bin/dirname "$0")/.." && pwd)/docs/screenshots
mkdir -p "$OUT"

# Per-app brand colours so each Chrome instance gets a unique theme-color
# meta in the address bar of the screenshot.

ensure_proxy() {
  if /usr/bin/curl -s --max-time 2 -o /dev/null \
       -w "%{http_code}" "http://127.0.0.1:${PROXY_PORT}/ota/info" | /usr/bin/grep -q "200"; then
    return 0
  fi
  echo "  ⟳ proxy down — restarting"
  /usr/bin/lsof -t -i ":${PROXY_PORT}" 2>/dev/null | /usr/bin/xargs -r kill -9 2>/dev/null
  sleep 1
  /usr/bin/nohup /usr/bin/env "PORT=${PROXY_PORT}" "ESP_HOST=${ESP_HOST}" \
    node /tmp/evse-bench-shell/proxy.js >/tmp/joule_proxy.log 2>&1 </dev/null &
  disown
  sleep 3
  /usr/bin/curl -s --max-time 5 -o /dev/null \
       -w "    proxy after restart: HTTP %{http_code}\n" \
       "http://127.0.0.1:${PROXY_PORT}/ota/info"
}

shoot() {
  local name=$1 path=$2 w=$3 h=$4 vt=${5:-25000}
  ensure_proxy
  /bin/rm -f "$OUT/$name.png"
  # Unique user-data-dir per shot so Chrome can't reuse a wedged profile.
  local udd="/tmp/cshot-$$-${name}"
  /bin/rm -rf "$udd"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
      --user-data-dir="$udd" \
      --virtual-time-budget="$vt" \
      --window-size="${w},${h}" \
      --screenshot="$OUT/$name.png" \
      "http://127.0.0.1:${PROXY_PORT}${path}" 2>/dev/null
  /bin/rm -rf "$udd"
  local sz
  sz=$(/bin/cat "$OUT/$name.png" 2>/dev/null | /usr/bin/wc -c | /usr/bin/tr -d ' ')
  printf "  %-30s %dx%-4d  vtb=%-6d  %7s bytes" "$name" "$w" "$h" "$vt" "$sz"
  if [ "${sz:-0}" -lt 30000 ]; then
    echo "  ⚠ likely error page"
  else
    echo "  ✓"
  fi
}

echo ""
echo "=== Desktop captures (1280×900) ==="
shoot dash-desktop-overview /dash    1280 900 30000
shoot dash-desktop-energy   "/dash#energy"     1280 900 25000
shoot dash-desktop-controls "/dash#controls"   1280 900 25000
shoot dash-desktop-diag     "/dash#diagnostics" 1280 900 25000
shoot ota-desktop           /ota     1280 900 20000
shoot wifi-desktop          /wifi    1280 900 20000
shoot serial-desktop        /serial  1280 900 20000

echo ""
echo "=== Mobile captures (390×844 — iPhone 14) ==="
shoot dash-mobile           /dash    390 844 25000
shoot dash-mobile-overview  /dash    390 844 25000
shoot ota-mobile            /ota     390 844 20000
shoot wifi-mobile           /wifi    390 844 20000
shoot serial-mobile         /serial  390 844 20000

echo ""
echo "=== final on-disk sizes ==="
ls -la "$OUT"/*.png | /usr/bin/awk '{printf "%7d  %s\n",$5,$NF}'
