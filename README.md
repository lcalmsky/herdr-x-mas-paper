# X-mas Paper

A paper-cut Christmas village for [Herdr](https://herdr.dev). Every agent session is one house on the snow: its windows glow and three smoke puffs rise from its chimney while it works, each round drawn fresh, the door opens and a resident rings a bell when your turn comes, a gift box waits at the door while a finished turn is still unread, the windows go dark and a `zzz` floats over the roof once it has slept for half an hour, and the house stays as painted otherwise. The village runs along the top as a scene band; below it are the tab row and the terminal, and the rail on the right groups spaces by repository with their ticket keys and one row per agent with a face, a topic and an elapsed time. Underneath, staff-ID badges show each Claude and Codex account's five-hour and weekly usage. Light and dark are a theme pair, so the layout follows the system's appearance.

![X-mas Paper](preview.png)

## What you see

The scene band is one painted paper village on a fixed 3112×320 canvas, cropped to the block's middle strip. Each session takes the next house; its state is a studio-drawn overlay slice on that house plus a small picture or a line of text. The house's door plate carries its place in the village, its name sits under it, and a click on a house goes to that session's terminal. Two villagers walk under the tree, and a `+N` at the top right counts the sessions whose houses are off the strip or past the twelfth.

| Session | House and overlay | Picture or text |
| --- | --- | --- |
| Working | Windows glow, light spills through the door | Smoke rising from the chimney |
| Your turn | The door opens and a resident rings a bell | `Your turn` bubble |
| Unread result | The house as painted | Gift box at the door |
| Sleeping (idle for 30 minutes) | The windows go dark | `zzz` above the roof |
| Otherwise | The house as painted | — |

The village art is rebuilt from the studio handoff folders, each file read from the last folder that has it:

```sh
uv run --with pillow python3 -I tools/build-scene-art.py <base-folder> [<override-folder> ...]
```

It clears and refills `mods/x-mas-paper-scene/art/`, copies the scene pictures, the string lights, the three blink groups, the selection brackets and the small sprites unchanged, cuts one overlay slice per house and state, writes `slots.js`, replaces the rail's and the accounts' faces with the handoff's 24 pngs, and fails unless every slice recomposes to the handed-over overlay pixel for pixel and a later folder changes only the tree band.

The rail on the right is a directory tree: a heading per repository, its spaces with their ticket keys, and one row per agent with a face, its status, the topic and how long it has run. The badges under it hang like staff IDs, one per account, with the five-hour and weekly usage. A session that needs an answer also carries its last line as a sign above the house; the tab bar above the terminal says when the village cannot read its sessions.

## Add it

```sh
git clone --recurse-submodules <this repository>
cd herdr-x-mas-paper
tools/install.sh
```

Then pick **x-mas-paper** in Herdr's layout picker. `tools/install.sh` copies the mods, the two layouts (`x-mas-paper` and its demo), the layout picture when it is there, and the two themes into `${HERDR_APP_HOME:-$HOME/.config/herdr-app}`. The `herdr-shared` submodule carries the shared `cca`, `scan.sh` and `hv` runtime files the mods use. When `${XMAS_SITE_JS:-~/.config/herdr-x-mas-paper/site.js}` exists, the install replaces the rail's `site.js` (ticket key shape, repository prefixes, the thread bot) with that file; the repository carries only neutral values.

## Keys

Press `ctrl+opt+p` to give the scene band the keyboard (or click an empty spot on it); press it again, or `Esc` once nothing is left to step back through, to give it back to the pane it came from:

| Key | What it does |
| --- | --- |
| ← → | Select the previous / next house on the strip |
| ⌥← ⌥→ | Select the first / last house |
| ↩ | Go to the selected session's terminal |
| Space / ⇧Space | Go to the next waiting / unread session, oldest first, cycling |
| ⌫ | Mark the selected unread result as read (its gift box goes); ⌘Z undoes it for 6 s |
| typing | Search the names; Hangul typed on a 2-set keyboard composes into syllables, and the query shows in a chip left of `+N` |
| ⌫ while searching | Delete a jamo, ⌘⌫ the whole query, ⌥⌫ the last word |
| ? | Show the whole key legend in place of the line |
| Esc | Clear the search, then the selection, then give the keyboard back |

The selected house is marked by four red-paper corner brackets that fade in around it.

The scene answers `x-mas-paper-scene.toggle`, `.back` and `.forward`, plus a `press` command that takes one key as data (`press:{"key":"right","shift":false,"alt":false,"cmd":false,"ctrl":false}`) so a preview window that cannot receive keystrokes can still be posed. Bind them in `keys.json` — the sections apply only while those layouts show:

```json
"layout:x-mas-paper": {
  "ctrl-alt-p": "x-mas-paper-scene.toggle",
  "cmd-[": "x-mas-paper-scene.back",
  "cmd-]": "x-mas-paper-scene.forward"
},
"layout:x-mas-paper-demo": {
  "ctrl-alt-p": "x-mas-paper-scene.toggle",
  "cmd-[": "x-mas-paper-scene.back",
  "cmd-]": "x-mas-paper-scene.forward"
}
```

`tools/keys-section.txt` carries the same section; when `keys.json` has no `layout:x-mas-paper` section, `tools/install.sh` prints it and says where it goes. The installer never edits `keys.json` itself.

## Pictures

```sh
tools/preview/render.sh
```

This writes `preview.png` (2560×1600: the dark theme as a poster — its village scene large on a night sky, with a terminal card and a rail card, the session list, below it) and `layouts/x-mas-paper.png` (640×400: a crop of the light theme's tree and notes house with its `Your turn` bubble). It opens a preview window at 3360×900 (a 2× screen is needed for the 6720×1800 shots), shoots `LIGHT_SHOTS` frames of the light appearance and `DARK_SHOTS` of the dark, then lets `tools/preview/compose.py` pick the scenes: a dark frame showing three puffs from the chimney and at least three residents on the street, and the first light frame showing two residents by the tree. It needs macOS and `uv` (https://docs.astral.sh/uv/), an unlocked screen, and no other preview window running; it stops without writing if a notification or dialog sits over the window.

The window shows invented data only. `tools/preview/build-layout.py` turns `layouts/x-mas-paper.json` into a picture layout: the scene, rail, accounts and tabs blocks get `props.demo`, and the terminal block becomes the `x-mas-paper-demo-term` panel in `tools/preview/mods/`. The demo sessions live in `mods/x-mas-paper-scene/demo.js`; the rail, the accounts and the tabs keep their own invented data in their folders.
