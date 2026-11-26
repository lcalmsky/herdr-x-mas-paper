#!/bin/sh
# Renders preview.png (2560x1600) and layouts/x-mas-paper.png (640x400) from a preview window that
# shows invented demo data only: one shot in the light appearance and one in the dark, composed
# along a diagonal. Refuses while the screen is locked, another preview window is already running,
# or a notification or dialog sits over the window.
#   tools/preview/render.sh
set -eu
REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT_HERO=preview.png
OUT_LAYOUT=layouts/x-mas-paper.png
WINDOW=1440x900
CHROME=${CHROME:-"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"}
TMP=${TMPDIR:-/tmp}

usage() {
  sed -n '2,6p' "$0" >&2
  exit 2
}

picture_size() {
  sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth:/ {w=$2} /pixelHeight:/ {h=$2} END {print w " " h}'
}

# The window is 1440x900, but a shot that comes out a different shape is cut to 16:10 from its middle.
fit_16x10() {
  in=$1
  out=$2
  size=$(picture_size "$in")
  w=${size% *}
  h=${size#* }
  case "${w}${h}" in ""|*[!0-9]*) echo "render.sh: cannot read the size of $in" >&2; exit 1 ;; esac
  if python3 -c 'import sys
w, h = float(sys.argv[1]), float(sys.argv[2])
sys.exit(0 if abs(w / h - 1.6) <= 0.016 else 1)' "$w" "$h"; then
    cp "$in" "$out"
  elif [ "$(python3 -c 'import sys; print("w" if float(sys.argv[1]) / float(sys.argv[2]) > 1.6 else "h")' "$w" "$h")" = w ]; then
    crop_h=$(python3 -c 'import sys; print(round(float(sys.argv[1]) / 1.6))' "$w")
    sips -c "$crop_h" "$w" "$in" --out "$out" >/dev/null
  else
    crop_w=$(python3 -c 'import sys; print(round(float(sys.argv[1]) * 1.6))' "$h")
    sips -c "$h" "$crop_w" "$in" --out "$out" >/dev/null
  fi
}

# Nothing may sit over the window: the picture would carry it.
overlays_clear() {
  "$REPO/tools/preview.sh" status 2>/dev/null | python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
sys.exit(0 if not (data.get("overlays") or []) else 1)'
}

errors_clear() {
  "$REPO/tools/preview.sh" status 2>/dev/null | python3 -c 'import json, sys
try:
    data = json.load(sys.stdin)
except ValueError:
    sys.exit(1)
sys.exit(0 if not data.get("errors") else 1)'
}

refuse_overlay() {
  if ! overlays_clear; then
    shown=$("$REPO/tools/preview.sh" status 2>&1 | python3 -c 'import json, sys
try:
    print(json.load(sys.stdin).get("overlays"))
except ValueError:
    print("status unreadable")' 2>&1)
    echo "render.sh: something is shown over the preview window (a notification or a dialog: $shown); nothing written, run again" >&2
    exit 1
  fi
}

# The app follows settings.json's appearance while it runs; keep the preview's notifications silent.
set_appearance() {
  python3 - "$HOMEDIR/settings.json" "$1" <<'PY'
import json, os, sys
path, mode = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except ValueError:
        data = {}
if not isinstance(data, dict):
    data = {}
sounds = data.get("sounds")
if not isinstance(sounds, dict):
    sounds = {}
sounds["enabled"] = False
data["sounds"] = sounds
data["appearance"] = mode
json.dump(data, open(path, "w"))
PY
}

# Two frames 1.5 s apart must differ: the scene loops its smoke and walkers, so identical frames mean
# the window is covered and not drawing. Three tries before giving up. The second frame is the shot.
settled_shot() {
  out=$1
  tries=1
  while :; do
    refuse_overlay
    "$REPO/tools/preview.sh" shot "$WORK/a.png"
    refuse_overlay
    /bin/sleep 1.5
    "$REPO/tools/preview.sh" shot "$WORK/b.png"
    refuse_overlay
    if ! cmp -s "$WORK/a.png" "$WORK/b.png"; then break; fi
    [ "$tries" -lt 3 ] || {
      echo "render.sh: two shots 1.5 s apart are identical, so the window is probably covered; nothing written" >&2
      exit 1
    }
    tries=$((tries + 1))
  done
  cp "$WORK/b.png" "$out"
}

[ $# -eq 0 ] || usage
[ -x "$CHROME" ] || { echo "render.sh: no Google Chrome at $CHROME; nothing written" >&2; exit 1; }

if ! console=$(ioreg -n Root -d1 -a 2>/dev/null) || [ -z "$console" ]; then
  echo "render.sh: cannot read the screen state (ioreg failed); not rendering blind" >&2
  exit 3
fi
if printf '%s' "$console" | python3 -c 'import plistlib, sys
try:
    root = plistlib.loads(sys.stdin.buffer.read())
except Exception:
    sys.exit(2)
def locked(node):
    if isinstance(node, dict):
        for key, value in node.items():
            if key in ("IOConsoleLocked", "CGSSessionScreenIsLocked") and value is True:
                return True
            if locked(value):
                return True
    elif isinstance(node, list):
        return any(locked(item) for item in node)
    return False
sys.exit(0 if locked(root) else 1)'; then
  echo "render.sh: the screen is locked; unlock and run again" >&2
  exit 3
else
  [ "$?" -eq 1 ] || { echo "render.sh: cannot read the screen state (ioreg failed); not rendering blind" >&2; exit 3; }
fi

# The reader's own preview window keeps its own home; rendering beside it would put two windows on
# one herdr-core, so any running preview stops this script before it writes.
for home in "$TMP"/xmas-*-home; do
  [ -d "$home" ] || continue
  if XMAS_PREVIEW_HOME="$home" "$REPO/tools/preview.sh" status >/dev/null 2>&1; then
    echo "render.sh: a preview window is already running ($home); stop it with tools/preview.sh stop, then run again" >&2
    exit 1
  fi
done

WORK=$(mktemp -d "$TMP/xmas-paper-render.XXXXXX")
HOMEDIR="$WORK/home"
export XMAS_PREVIEW_HOME="$HOMEDIR"
STARTED=0
cleanup() {
  if [ "$STARTED" = 1 ]; then "$REPO/tools/preview.sh" stop >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
trap 'exit 130' INT TERM HUP

python3 -I "$REPO/tools/preview/build-layout.py" "$WORK/layout.json"
mkdir -p "$HOMEDIR"
set_appearance light
STARTED=1
XMAS_EXTRA_MODS="$REPO/tools/preview/mods" XMAS_LAYOUT_FILE="$WORK/layout.json" XMAS_WINDOW="$WINDOW" \
  "$REPO/tools/preview.sh" start x-mas-paper
n=0
until errors_clear; do
  n=$((n + 1))
  [ "$n" -lt 80 ] || { echo "render.sh: the preview window reported errors; nothing written" >&2; exit 1; }
  /bin/sleep 0.5
done
# The mods draw after the window reports ready; give the first frames time to land.
/bin/sleep "${WAIT:-3}"

settled_shot "$WORK/light.png"
set_appearance dark
/bin/sleep "${DARK_WAIT:-3}"
settled_shot "$WORK/dark.png"

"$REPO/tools/preview.sh" stop >/dev/null 2>&1 || true
n=0
while "$REPO/tools/preview.sh" status >/dev/null 2>&1; do
  n=$((n + 1))
  [ "$n" -lt 40 ] || { echo "render.sh: the preview window did not stop; nothing written" >&2; exit 1; }
  /bin/sleep 0.25
done
STARTED=0

fit_16x10 "$WORK/light.png" "$WORK/light-16x10.png"
fit_16x10 "$WORK/dark.png" "$WORK/dark-16x10.png"

COMPOSE="$WORK/compose"
mkdir -p "$COMPOSE"
cp "$REPO/tools/preview/compose.html" "$COMPOSE/"
cp "$WORK/light-16x10.png" "$COMPOSE/light.png"
cp "$WORK/dark-16x10.png" "$COMPOSE/dark.png"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=2560,1600 --virtual-time-budget=3000 --user-data-dir="$WORK/chrome" \
  --screenshot="$WORK/hero.png" "file://$COMPOSE/compose.html" >/dev/null 2>&1 || true
[ -f "$WORK/hero.png" ] || { echo "render.sh: Chrome wrote no composed picture; nothing written" >&2; exit 1; }
[ "$(picture_size "$WORK/hero.png")" = "2560 1600" ] || {
  echo "render.sh: the composed picture is not 2560x1600; nothing written" >&2; exit 1; }

cp "$WORK/hero.png" "$REPO/$OUT_HERO"
sips -z 400 640 "$WORK/light-16x10.png" --out "$REPO/$OUT_LAYOUT" >/dev/null

for pair in "$REPO/$OUT_HERO 2560 1600" "$REPO/$OUT_LAYOUT 640 400"; do
  set -- $pair
  file=$1; want_w=$2; want_h=$3
  got=$(picture_size "$file")
  [ "$got" = "$want_w $want_h" ] || { echo "render.sh: $file is ${got% *}x${got#* }, not ${want_w}x${want_h}" >&2; exit 1; }
  echo "$file"
done
