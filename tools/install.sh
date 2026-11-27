#!/bin/sh
# Copies the layout, themes and this repo's mods into the Herdr home.
set -eu
REPO=$(cd "$(dirname "$0")/.." && pwd)
HOME_DIR=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
SHARED=${HERDR_SHARED:-$REPO/vendor/herdr-shared}
SHARED_HOME=${HERDR_SHARED_HOME:-$HOME/.local/share/herdr-shared}
: "${HOME_DIR:?HOME_DIR must name the Herdr app home}"
for mod in x-mas-paper-scene x-mas-paper-rail x-mas-paper-accounts x-mas-paper-tabs x-mas-paper-pane x-mas-paper-editor; do
  # Files from an earlier install, links included, would otherwise stay in the folder and still load.
  rm -rf "${HOME_DIR:?}/mods/$mod"
  mkdir -p "$HOME_DIR/mods/$mod"
  cp -R "$REPO/mods/$mod/." "$HOME_DIR/mods/$mod/"
done
# The public repository carries neutral rail values; a person's own values live outside it.
SITE_JS=${XMAS_SITE_JS:-$HOME/.config/herdr-x-mas-paper/site.js}
if [ -f "$SITE_JS" ]; then
  cp "$SITE_JS" "$HOME_DIR/mods/x-mas-paper-rail/site.js"
  printf 'Installed the rail site values from %s\n' "$SITE_JS"
fi
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
# keys.json belongs to the person: this only tells them what the layout's section should be.
KEYS="$HOME_DIR/keys.json"
SECTION="$REPO/tools/keys-section.txt"
if [ -f "$SECTION" ]; then
  if [ ! -f "$KEYS" ]; then
    printf "keys.json was not found at %s, so the layout's shortcuts (ctrl-alt-p, cmd-[ ...) do nothing.\n" "$KEYS"
    printf 'Create it with this content:\n{\n'
    cat "$SECTION"
    printf '}\n'
  elif ! grep -Eq '"layout:x-mas-paper"[[:space:]]*:' "$KEYS"; then
    printf "%s has no \"layout:x-mas-paper\" section, so the layout's shortcuts (ctrl-alt-p, cmd-[ ...) do nothing.\n" "$KEYS"
    printf 'Add this section inside its top-level { } (next to "global"), with a comma after the section before it:\n'
    cat "$SECTION"
    printf 'tools/install.sh does not edit keys.json itself.\n'
  fi
fi
