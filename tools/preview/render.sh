#!/bin/sh
# Renders preview.png (2560x1600: the dark theme as a poster, its village scene large on a night sky
# above a terminal card and a rail card) and layouts/x-mas-paper.png (640x400: the light theme's tree
# and notes house with its Your turn bubble) from a preview window that shows invented demo data
# only. Shoots several frames per theme at 3360x900 on a 2x screen and lets tools/preview/compose.py
# pick the scene (three puffs from the chimney and two walkers under the tree), refusing while the
# screen is locked, another preview window is running, or a notification or dialog sits over it.
#   tools/preview/render.sh
set -eu
REPO=$(cd "$(dirname "$0")/../.." && pwd)
OUT_HERO=preview.png
OUT_LAYOUT=layouts/x-mas-paper.png
WINDOW=3360x900
TMP=${TMPDIR:-/tmp}

usage() {
  sed -n '2,8p' "$0" >&2
  exit 2
}

picture_size() {
  sips -g pixelWidth -g pixelHeight "$1" | awk '/pixelWidth:/ {w=$2} /pixelHeight:/ {h=$2} END {print w " " h}'
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
command -v uv >/dev/null 2>&1 || {
  echo "render.sh: needs uv (https://docs.astral.sh/uv/) to compose the pictures; nothing written" >&2
  exit 1
}

# compose.py takes a median of each theme's frames, so fewer than five cannot be composed; stop
# before the window opens.
shots_ok() {
  case $1 in ''|*[!0-9]*|0?*) return 1 ;; esac
  [ "$1" -ge 5 ]
}
LIGHT_SHOTS=${LIGHT_SHOTS:-8}
DARK_SHOTS=${DARK_SHOTS:-24}
if ! shots_ok "$LIGHT_SHOTS" || ! shots_ok "$DARK_SHOTS"; then
  echo "render.sh: LIGHT_SHOTS and DARK_SHOTS must be whole numbers of at least 5 (compose.py takes a median); nothing written" >&2
  exit 2
fi

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

settled_shot "$WORK/settled.png"
# compose.py's coordinates are in a 6720x1800 shot; macOS narrows the window to the screen, and a
# 1x screen halves the shot, so stop before the burst rather than after it.
shot_size=$(picture_size "$WORK/settled.png")
[ "$shot_size" = "6720 1800" ] || {
  echo "render.sh: the shot is ${shot_size% *}x${shot_size#* }, not 6720x1800; it needs a 2x screen at least 3360 points wide; nothing written" >&2
  exit 1
}

i=1
while [ "$i" -le "$LIGHT_SHOTS" ]; do
  refuse_overlay
  "$REPO/tools/preview.sh" shot "$WORK/light_$i.png"
  if [ "$i" -lt "$LIGHT_SHOTS" ]; then /bin/sleep 0.7; fi
  i=$((i + 1))
done

set_appearance dark
/bin/sleep "${DARK_WAIT:-3}"
settled_shot "$WORK/settled.png"

i=1
while [ "$i" -le "$DARK_SHOTS" ]; do
  refuse_overlay
  "$REPO/tools/preview.sh" shot "$WORK/dark_$i.png"
  if [ "$i" -lt "$DARK_SHOTS" ]; then /bin/sleep 0.7; fi
  i=$((i + 1))
done

"$REPO/tools/preview.sh" stop >/dev/null 2>&1 || true
n=0
while "$REPO/tools/preview.sh" status >/dev/null 2>&1; do
  n=$((n + 1))
  [ "$n" -lt 40 ] || { echo "render.sh: the preview window did not stop; nothing written" >&2; exit 1; }
  /bin/sleep 0.25
done
STARTED=0

set -- --out-hero "$WORK/hero.png" --out-layout "$WORK/layout.png"
i=1
while [ "$i" -le "$LIGHT_SHOTS" ]; do set -- "$@" --light "$WORK/light_$i.png"; i=$((i + 1)); done
i=1
while [ "$i" -le "$DARK_SHOTS" ]; do set -- "$@" --dark "$WORK/dark_$i.png"; i=$((i + 1)); done
uv run -q --with pillow python3 -I "$REPO/tools/preview/compose.py" "$@"

cp "$WORK/hero.png" "$REPO/$OUT_HERO"
cp "$WORK/layout.png" "$REPO/$OUT_LAYOUT"

for pair in "$REPO/$OUT_HERO 2560 1600" "$REPO/$OUT_LAYOUT 640 400"; do
  set -- $pair
  file=$1; want_w=$2; want_h=$3
  got=$(picture_size "$file")
  [ "$got" = "$want_w $want_h" ] || { echo "render.sh: $file is ${got% *}x${got#* }, not ${want_w}x${want_h}" >&2; exit 1; }
  echo "$file"
done
