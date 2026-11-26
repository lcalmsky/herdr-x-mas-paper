#!/bin/sh
# A second Herdr window with its own home, for looking at this layout without touching the
# window in use. It shares herdr-core with that window, so the real spaces and terminals show.
#   tools/preview.sh start [layout]   install there and open it (default: x-mas-paper)
#   tools/preview.sh layout <layout>  show another of this repo's layouts
#   tools/preview.sh shot <file.png>  save the last frame
#   tools/preview.sh do <command> [json]   e.g. do x-mas-paper.next
#   tools/preview.sh status | stop
# start/layout read these when set:
#   XMAS_LAYOUT_FILE=<path>   show this layout JSON instead of layouts/<layout>.json
#   XMAS_EXTRA_MODS=<dir>     copy each folder under it into the preview home's mods/
#   XMAS_WINDOW=<w>x<h>       open the window at this size
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
TMP=${TMPDIR:-/tmp}
# The home must be short: the app's socket path has to fit a unix socket address.
H=${XMAS_PREVIEW_HOME:-${TMP%/}/xmas-paper-home}
REAL=${HERDR_REAL_HOME:-$HOME/.config/herdr-app}
APP=${HERDR_APP:-/Applications/Herdr.app}
canon() { (cd "$1" 2>/dev/null && pwd -P) || echo "${1%/}"; }
[ "$(canon "$H")" != "$(canon "$REAL")" ] || { echo "preview.sh: the preview home is the home in use" >&2; exit 1; }

pid_of() {
  pgrep -f "$APP/Contents/MacOS/" | while read -r p; do
    if ps eww -p "$p" | tr ' ' '\n' | grep -qxF "HERDR_APP_HOME=$H"; then echo "$p"; fi
  done | head -1
}

# The preview shows its layout under the name the window in use shows, and never runs
# layout.switch: if the shown layout's name travels between the two windows, nothing changes there.
# A name that cannot be read, or one of Herdr's own, stops the script: XMAS_OWN_NAME=1 shows the
# preview under its own name instead, for whoever accepts that the name may reach the other window.
shown_name() {
  if [ -n "${XMAS_OWN_NAME:-}" ]; then echo "$1"; return; fi
  name=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("layout") or "")' "$REAL/shared.json" 2>/dev/null) || {
    echo "preview.sh: cannot read the shown layout from $REAL/shared.json" >&2; exit 1; }
  case "$name" in
    ""|main|terminals|win98) echo "preview.sh: the window in use shows Herdr's own layout (${name:-none}), whose name cannot be borrowed" >&2; exit 1 ;;
    *) echo "$name" ;;
  esac
}

put_layout() {
  case "$1" in */*|"") echo "preview.sh: a layout is named without a path" >&2; exit 1 ;; esac
  [ -f "$REPO/layouts/$1.json" ] || { echo "preview.sh: no layouts/$1.json" >&2; exit 1; }
  source=$REPO/layouts/$1.json
  if [ -n "${XMAS_LAYOUT_FILE:-}" ]; then
    [ -f "$XMAS_LAYOUT_FILE" ] || { echo "preview.sh: no layout file at $XMAS_LAYOUT_FILE" >&2; exit 1; }
    source=$XMAS_LAYOUT_FILE
  fi
  name=$(shown_name "$1")
  cp "$source" "$H/layouts/$name.json"
  python3 - "$H/shared.json" "$name" <<'PY'
import json, os, sys
path, name = sys.argv[1], sys.argv[2]
data = json.load(open(path)) if os.path.exists(path) else {"frame.welcomed": "finished"}
# shared() outlives the window: a demo copy's PiP, seats or look left by the last run would carry
# into this one, so every run starts the demo copies from nothing.
data = {k: v for k, v in data.items() if not k.endswith(".demo")}
data["layout"] = name
json.dump(data, open(path, "w"))
PY
}

# A covered window draws no frame after its first, so the window is parked with a corner on
# screen and raised: it keeps drawing, and the window in use keeps the keyboard. Herdr does not
# take an off-screen position from window.json, and other windows cover the corner over time,
# so this runs at start and again before every shot.
window_size() {
  [ -n "${XMAS_WINDOW:-}" ] || return 0
  case "$XMAS_WINDOW" in *x*) ;; *) echo "preview.sh: XMAS_WINDOW must be <width>x<height>, two integers" >&2; exit 1 ;; esac
  w=${XMAS_WINDOW%x*}; h=${XMAS_WINDOW#*x}
  case "$w" in ""|*[!0-9]*) w= ;; esac
  case "$h" in ""|*[!0-9]*) h= ;; esac
  if [ -z "$w" ] || [ -z "$h" ] || [ "$w" -le 0 ] || [ "$h" -le 0 ]; then
    echo "preview.sh: XMAS_WINDOW must be <width>x<height>, two positive integers" >&2; exit 1
  fi
  echo "set size of window 1 to {$w, $h}"
}

park() {
  screen=$(osascript -e 'tell application "Finder" to get bounds of window of desktop' | tr -d ' ')
  x=$(($(echo "$screen" | cut -d, -f3) - 70)); y=$(($(echo "$screen" | cut -d, -f4) - 70))
  size=$(window_size)
  osascript -e "tell application \"System Events\" to tell (first process whose unix id is $1)
    $size
    set position of window 1 to {$x, $y}
    perform action \"AXRaise\" of window 1
  end tell" >/dev/null
}

running() {
  pid=$(pid_of)
  [ -n "$pid" ] || { echo "preview.sh: not running; use start" >&2; exit 1; }
  echo "$pid"
}

case "${1:-}" in
  start)
    layout=${2:-x-mas-paper}
    [ -z "$(pid_of)" ] || { echo "preview.sh: already running (pid $(pid_of)); use layout, shot, do or stop" >&2; exit 1; }
    window_size >/dev/null
    mkdir -p "$H/layouts"
    [ -f "$H/seen.json" ] || echo '["frame-welcome"]' > "$H/seen.json"
    # A home whose update-notes.json names an older version counts as freshly updated and shows
    # the "Updated to ..." toast, which must not be in a picture: record this app's version.
    version=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || true)
    if [ -n "$version" ]; then
      python3 - "$H/update-notes.json" "$version" <<'PY'
import json, os, sys
path, version = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except ValueError:
        data = {}
if not isinstance(data, dict):
    data = {}
data["last_run"] = version
json.dump(data, open(path, "w"))
PY
    elif [ ! -f "$H/update-notes.json" ] && [ -f "$REAL/update-notes.json" ]; then
      cp "$REAL/update-notes.json" "$H/update-notes.json"
    fi
    [ -f "$H/keys.json" ] || echo '{"global":{},"terminal":{}}' > "$H/keys.json"
    # Its notifications would sound a second time beside the window in use.
    [ -f "$H/settings.json" ] || echo '{"sounds":{"enabled":false}}' > "$H/settings.json"
    # The mods go in before the window opens: a layout whose mods are missing at start falls
    # back to Herdr's own and stays there.
    HERDR_APP_HOME="$H" "$REPO/tools/install.sh" >/dev/null
    if [ -n "${XMAS_EXTRA_MODS:-}" ]; then
      [ -d "$XMAS_EXTRA_MODS" ] || { echo "preview.sh: no extra mods folder at $XMAS_EXTRA_MODS" >&2; exit 1; }
      for dir in "$XMAS_EXTRA_MODS"/*/; do
        [ -d "$dir" ] || continue
        mod=$(basename "$dir")
        mkdir -p "$H/mods/$mod"
        cp -R "$dir." "$H/mods/$mod/"
      done
    fi
    put_layout "$layout"
    open -n -g --env HERDR_APP_HOME="$H" "$APP"
    n=0
    until HERDR_APP_HOME="$H" herdr-app status >/dev/null 2>&1; do
      n=$((n + 1)); [ "$n" -lt 40 ] || { echo "preview.sh: the window did not start" >&2; exit 1; }
      /bin/sleep 0.5
    done
    pid=$(running); park "$pid"
    echo "pid=$pid home=$H"
    ;;
  layout) put_layout "${2:-}" ;;
  shot) pid=$(running); park "$pid"; /bin/sleep 1; HERDR_APP_HOME="$H" herdr-app shot "$2" ;;
  do) shift; HERDR_APP_HOME="$H" herdr-app do "$@" ;;
  status) HERDR_APP_HOME="$H" herdr-app status ;;
  stop) pid=$(pid_of); [ -z "$pid" ] || kill "$pid" ;;
  *) sed -n '2,12p' "$0" >&2; exit 2 ;;
esac
