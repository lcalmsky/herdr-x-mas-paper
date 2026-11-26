#!/bin/sh
# Copies the layout, themes and this repo's mods into the Herdr home.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
SHARED=${HERDR_SHARED:-$REPO/vendor/herdr-shared}
SHARED_HOME=${HERDR_SHARED_HOME:-$HOME/.local/share/herdr-shared}
for mod in x-mas-paper-scene x-mas-paper-rail x-mas-paper-accounts x-mas-paper-tabs x-mas-paper-pane x-mas-paper-editor; do
  mkdir -p "$HOME_DIR/mods/$mod"
  # The copy below must write real files: a link into the shared home from the last install
  # would be written through. The link step at the end puts the links back.
  find "$HOME_DIR/mods/$mod" -maxdepth 1 -type l -lname "$SHARED_HOME/*" -exec rm -f {} +
  cp -R "$REPO/mods/$mod/." "$HOME_DIR/mods/$mod/"
done
chmod +x "$HOME_DIR/mods/x-mas-paper-accounts/cca" "$HOME_DIR/mods/x-mas-paper-accounts/usage-tap.sh"
chmod +x "$HOME_DIR/mods/x-mas-paper-editor/hv" "$HOME_DIR/mods/x-mas-paper-editor/hv-open"
# Link the mods' runtime files to the shared install when it exists; without herdr-shared the
# copies stay. A mod folder that resolves inside this repo is left as copies, not links.
REPO_REAL=$(cd "$REPO" && pwd -P)
if [ -f "$SHARED/tools/link-installed.sh" ] && [ -d "$SHARED_HOME" ]; then
  for mod in x-mas-paper-accounts x-mas-paper-scene x-mas-paper-editor; do
    dir="$HOME_DIR/mods/$mod"
    case "$(cd "$dir" && pwd -P)/" in
      "$REPO_REAL"/*) continue ;;
    esac
    sh "$SHARED/tools/link-installed.sh" "$dir"
  done
fi
mkdir -p "$HOME_DIR/layouts" "$HOME_DIR/themes"
cp "$REPO/layouts/x-mas-paper.json" "$REPO/layouts/x-mas-paper-demo.json" "$HOME_DIR/layouts/"
if [ -f "$REPO/layouts/x-mas-paper.png" ]; then cp "$REPO/layouts/x-mas-paper.png" "$HOME_DIR/layouts/"; fi
cp "$REPO/themes/x-mas-paper-light.json" "$REPO/themes/x-mas-paper-dark.json" "$HOME_DIR/themes/"
for mod in x-mas-paper-scene x-mas-paper-rail x-mas-paper-accounts x-mas-paper-tabs x-mas-paper-pane x-mas-paper-editor; do herdr-app check "$HOME_DIR/mods/$mod"; done
