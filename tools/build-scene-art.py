#!/usr/bin/env python3
# Rebuilds the scene mod's art/ and slots.js from the studio handoff folder: the two backgrounds,
# the small sprites, one cropped overlay slice per house and state, and the slot module.
# Run: uv run --with pillow python3 -I tools/build-scene-art.py [<materials-folder>]
import json
import os
import shutil
import sys

from PIL import Image, ImageChops

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MOD = os.path.join(ROOT, "mods", "x-mas-paper-scene")
ART = os.path.join(MOD, "art")
SLOTS_JS = os.path.join(MOD, "slots.js")
SCALE = 2
STATES = ("working", "turn", "sleep")
MODES = ("light", "dark")
SPRITES = ("smoke_1", "smoke_2", "gift", "walker_left_1", "walker_left_2", "walker_right_1", "walker_right_2")


def fail(message):
    sys.stderr.write("build-scene-art: %s\n" % message)
    sys.exit(1)


def load_slots(src):
    path = os.path.join(src, "slots.json")
    if not os.path.isfile(path):
        fail("no slots.json in %s" % src)
    with open(path) as f:
        slots = json.load(f)
    canvas = slots.get("canvas_logical")
    if canvas != [3112, 320] or slots.get("scale") != SCALE:
        fail("slots.json is %s at scale %s, expected [3112, 320] at 2" % (canvas, slots.get("scale")))
    return slots


def check_sources(src):
    needed = ["slots.json"]
    needed += ["scene_%s.png" % mode for mode in MODES]
    needed += ["state_%s_%s.png" % (state, mode) for state in STATES for mode in MODES]
    needed += ["%s_%s.png" % (name, mode) for name in SPRITES for mode in MODES]
    missing = [name for name in needed if not os.path.isfile(os.path.join(src, name))]
    if missing:
        fail("missing in %s: %s" % (src, ", ".join(missing)))


def clear_art():
    os.makedirs(ART, exist_ok=True)
    for name in os.listdir(ART):
        path = os.path.join(ART, name)
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)


def copy_flat(src, name, only=None):
    path = os.path.join(src, name)
    if not os.path.isfile(path):
        fail("missing %s" % path)
    if only is not None:
        with Image.open(path) as im:
            if im.size != only:
                fail("%s is %s, expected %s" % (name, im.size, only))
    shutil.copyfile(path, os.path.join(ART, name))


def overlay_slices(src, slots):
    """Cuts each house's slot_x strip out of each state image, trims transparent rows on even
    picture px, and records the cropped rectangle in logical px."""
    overlays = {}
    for state in STATES:
        overlays[state] = {}
        for mode in MODES:
            name = "state_%s_%s.png" % (state, mode)
            with Image.open(os.path.join(src, name)) as im:
                image = im.convert("RGBA")
            if image.size != (6224, 640):
                fail("%s is %s, expected 6224x640" % (name, image.size))
            records = {}
            for house in slots["houses"]:
                x0, x1 = [value * SCALE for value in house["slot_x"]]
                band = image.crop((x0, 0, x1, image.height))
                box = band.getchannel("A").getbbox()
                if box is None:
                    continue
                top = (box[1] // SCALE) * SCALE
                bottom = min(-(-box[3] // SCALE) * SCALE, band.height)
                piece = band.crop((0, top, band.width, bottom))
                filename = "state_%s_%s_h%d.png" % (state, mode, house["id"])
                piece.save(os.path.join(ART, filename))
                records[str(house["id"])] = {
                    "file": filename,
                    "x": house["slot_x"][0],
                    "y": top // SCALE,
                    "w": house["slot_x"][1] - house["slot_x"][0],
                    "h": (bottom - top) // SCALE,
                }
            overlays[state][mode] = records
    return overlays


def verify(src, slots, overlays):
    """Composites the background twice per mode and state — once from the slices, once from the
    whole overlay masked to the slot_x strips — and checks that the pixels are identical."""
    lines = []
    for mode in MODES:
        background = Image.open(os.path.join(src, "scene_%s.png" % mode)).convert("RGB")
        if background.size != (6224, 640):
            fail("scene_%s.png is %s, expected 6224x640" % (mode, background.size))
        for state in STATES:
            from_slices = background.copy()
            for record in overlays[state][mode].values():
                with Image.open(os.path.join(ART, record["file"])) as piece:
                    piece = piece.convert("RGBA")
                from_slices.paste(piece, (record["x"] * SCALE, record["y"] * SCALE), piece)
            with Image.open(os.path.join(src, "state_%s_%s.png" % (state, mode))) as im:
                overlay = im.convert("RGBA")
            masked = background.copy()
            for house in slots["houses"]:
                if str(house["id"]) not in overlays[state][mode]:
                    continue
                x0, x1 = [value * SCALE for value in house["slot_x"]]
                band = overlay.crop((x0, 0, x1, overlay.height))
                masked.paste(band, (x0, 0), band)
            diff = ImageChops.difference(from_slices, masked).getbbox()
            if diff is not None:
                fail("%s %s: slices differ from the masked overlay at %s" % (mode, state, diff))
            lines.append("%s %s: %d slices, pixel diff 0" % (mode, state, len(overlays[state][mode])))
    return lines


def copied_sprites(slots):
    """Keeps only the sprites whose files this build copies into art/."""
    kept = {}
    for name, modes in slots["sprites"].items():
        if all(os.path.isfile(os.path.join(ART, sprite["file"])) for sprite in modes.values()):
            kept[name] = modes
    return kept


def write_slots_js(slots, overlays):
    doc = {key: slots[key] for key in ("canvas_logical", "fill_order", "walker_lane", "houses")}
    doc["sprites"] = copied_sprites(slots)
    text = "// Generated by tools/build-scene-art.py. Do not edit.\n"
    text += "export const SLOTS = " + json.dumps(doc, ensure_ascii=False, indent=1) + ";\n"
    text += "export const OVERLAYS = " + json.dumps(overlays, ensure_ascii=False, indent=1) + ";\n"
    with open(SLOTS_JS, "w") as f:
        f.write(text)


def main():
    if len(sys.argv) != 2:
        fail("usage: build-scene-art.py <materials-folder>")
    src = os.path.abspath(sys.argv[1])
    if not os.path.isdir(src):
        fail("no materials folder at %s" % src)
    check_sources(src)
    slots = load_slots(src)
    clear_art()
    for mode in MODES:
        copy_flat(src, "scene_%s.png" % mode, (6224, 640))
    for name in SPRITES:
        for mode in MODES:
            copy_flat(src, "%s_%s.png" % (name, mode))
    overlays = overlay_slices(src, slots)
    for line in verify(src, slots, overlays):
        print(line)
    write_slots_js(slots, overlays)
    print("art: %d files, slots.js: %d houses" % (len(os.listdir(ART)), len(slots["houses"])))


if __name__ == "__main__":
    main()
