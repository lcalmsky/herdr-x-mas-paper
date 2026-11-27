#!/usr/bin/env python3
# Rebuilds the scene mod's art/ and slots.js from the studio handoff folders: the two backgrounds,
# the lights and their three blink groups, the selection brackets, the small sprites and the chimney
# puffs, one cropped overlay slice per house and state, the slot module, and the rail and account faces.
# Each file is read from the last folder that has it, so a later handoff can override a few files.
# Run: uv run --with pillow python3 -I tools/build-scene-art.py <base-folder> [<override-folder> ...]
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
FACES_DIRS = (
    os.path.join(ROOT, "mods", "x-mas-paper-rail", "faces"),
    os.path.join(ROOT, "mods", "x-mas-paper-accounts", "faces"),
)
SCALE = 2
STATES = ("working", "turn", "sleep")
MODES = ("light", "dark")
SPRITES = ("gift", "walker_left_1", "walker_left_2", "walker_right_1", "walker_right_2")
BLINKS = ("blink_1", "blink_2", "blink_3")
CORNERS = ("tl", "tr", "bl", "br")
TREE_BAND = (2925, 3372)
FACE_COUNT = 24
FACE_SIZE = (128, 128)


def fail(message):
    sys.stderr.write("build-scene-art: %s\n" % message)
    sys.exit(1)


def find_file(folders, name):
    for folder in reversed(folders):
        path = os.path.join(folder, name)
        if os.path.isfile(path):
            return path
    return None


def source_of(folders, name):
    path = find_file(folders, name)
    if path is None:
        fail("missing %s in %s" % (name, " or ".join(folders)))
    return path


def load_slots(folders):
    path = find_file(folders, "slots.json")
    if path is None:
        fail("no slots.json in %s" % " or ".join(folders))
    with open(path) as f:
        slots = json.load(f)
    canvas = slots.get("canvas_logical")
    if canvas != [3112, 320] or slots.get("scale") != SCALE:
        fail("slots.json is %s at scale %s, expected [3112, 320] at 2" % (canvas, slots.get("scale")))
    return slots


def puff_sources(slots):
    """The chimney puff pngs the build copies, as (source name, slot sprite)."""
    sources = []
    for modes in (slots.get("smoke_puffs") or {}).get("sprites", {}).values():
        for mode in MODES:
            if mode in modes:
                sources.append(("puffs/" + os.path.basename(modes[mode]["file"]), modes[mode]))
    return sources


def check_sources(folders, slots):
    needed = ["slots.json"]
    needed += ["scene_%s.png" % mode for mode in MODES]
    needed += ["lights_%s.png" % mode for mode in MODES]
    needed += ["%s_%s.png" % (name, mode) for name in BLINKS for mode in MODES]
    needed += ["select_%s_%s.png" % (corner, mode) for corner in CORNERS for mode in MODES]
    needed += ["state_%s_%s.png" % (state, mode) for state in STATES for mode in MODES]
    needed += ["%s_%s.png" % (name, mode) for name in SPRITES for mode in MODES]
    needed += [name for name, _sprite in puff_sources(slots)]
    missing = [name for name in needed if find_file(folders, name) is None]
    if missing:
        fail("missing in %s: %s" % (" or ".join(folders), ", ".join(missing)))


def clear_art():
    os.makedirs(ART, exist_ok=True)
    for name in os.listdir(ART):
        path = os.path.join(ART, name)
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)


def copy_flat(path, only=None, dest=ART):
    if only is not None:
        with Image.open(path) as im:
            if im.size != only:
                fail("%s is %s, expected %s" % (path, im.size, only))
    shutil.copyfile(path, os.path.join(dest, os.path.basename(path)))


def overlay_slices(folders, slots):
    """Cuts each house's slot_x strip out of each state image, trims transparent rows on even
    picture px, and records the cropped rectangle in logical px."""
    overlays = {}
    for state in STATES:
        overlays[state] = {}
        for mode in MODES:
            name = "state_%s_%s.png" % (state, mode)
            with Image.open(source_of(folders, name)) as im:
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


def verify(folders, slots, overlays):
    """Composites the background twice per mode and state — once from the slices, once from the
    whole overlay masked to the slot_x strips — and checks that the pixels are identical. Also
    holds a later handoff to its contract: only the tree band may differ from the first folder,
    and no state slice may cover the tree."""
    lines = []
    band_x0, band_x1 = TREE_BAND
    for mode in MODES:
        background = Image.open(source_of(folders, "scene_%s.png" % mode)).convert("RGB")
        if background.size != (6224, 640):
            fail("scene_%s.png is %s, expected 6224x640" % (mode, background.size))
        if len(folders) > 1:
            first = Image.open(source_of(folders[:1], "scene_%s.png" % mode)).convert("RGB")
            for x0, x1 in ((0, band_x0), (band_x1, background.width)):
                diff = ImageChops.difference(
                    background.crop((x0, 0, x1, background.height)),
                    first.crop((x0, 0, x1, first.height)),
                ).getbbox()
                if diff is not None:
                    fail("%s: scene differs from %s outside the tree band at %s"
                         % (mode, folders[0], diff))
            lines.append("%s: scene matches %s outside x %d..%d" % (mode, folders[0], band_x0, band_x1))
        for state in STATES:
            name = "state_%s_%s.png" % (state, mode)
            with Image.open(source_of(folders, name)) as im:
                state_image = im.convert("RGBA")
            covered = state_image.getchannel("A").crop((band_x0, 0, band_x1, state_image.height)).getbbox()
            if covered is not None:
                fail("%s: state slice covers the tree band at %s" % (name, covered))
            from_slices = background.copy()
            for record in overlays[state][mode].values():
                with Image.open(os.path.join(ART, record["file"])) as piece:
                    piece = piece.convert("RGBA")
                from_slices.paste(piece, (record["x"] * SCALE, record["y"] * SCALE), piece)
            masked = background.copy()
            for house in slots["houses"]:
                if str(house["id"]) not in overlays[state][mode]:
                    continue
                x0, x1 = [value * SCALE for value in house["slot_x"]]
                band = state_image.crop((x0, 0, x1, state_image.height))
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
    keys = ["canvas_logical", "fill_order", "walker_lane", "houses"]
    if "blink" in slots:
        keys.append("blink")
    if "smoke_puffs" in slots:
        keys.append("smoke_puffs")
    doc = {key: slots[key] for key in keys}
    doc["sprites"] = copied_sprites(slots)
    text = "// Generated by tools/build-scene-art.py. Do not edit.\n"
    text += "export const SLOTS = " + json.dumps(doc, ensure_ascii=False, indent=1) + ";\n"
    text += "export const OVERLAYS = " + json.dumps(overlays, ensure_ascii=False, indent=1) + ";\n"
    with open(SLOTS_JS, "w") as f:
        f.write(text)


def copy_faces(folders):
    """Replaces the rail's and the accounts' faces with the last folder's png set; an incomplete set stops the build."""
    source = None
    for folder in reversed(folders):
        faces = os.path.join(folder, "faces")
        if os.path.isdir(faces):
            source = faces
            break
    if source is None:
        return None
    names = ["%d.png" % i for i in range(FACE_COUNT)]
    missing = [name for name in names if not os.path.isfile(os.path.join(source, name))]
    if missing:
        fail("faces in %s is missing %s" % (source, ", ".join(missing)))
    for name in names:
        with Image.open(os.path.join(source, name)) as im:
            if im.size != FACE_SIZE:
                fail("%s is %s, expected %dx%d" % (os.path.join(source, name), im.size, FACE_SIZE[0], FACE_SIZE[1]))
    for dest in FACES_DIRS:
        os.makedirs(dest, exist_ok=True)
        for name in os.listdir(dest):
            path = os.path.join(dest, name)
            if os.path.isdir(path):
                shutil.rmtree(path)
            else:
                os.remove(path)
        for name in names:
            shutil.copyfile(os.path.join(source, name), os.path.join(dest, name))
    return source


def main():
    if len(sys.argv) < 2:
        fail("usage: build-scene-art.py <base-folder> [<override-folder> ...]")
    folders = [os.path.abspath(arg) for arg in sys.argv[1:]]
    for folder in folders:
        if not os.path.isdir(folder):
            fail("no materials folder at %s" % folder)
    slots = load_slots(folders)
    check_sources(folders, slots)
    clear_art()
    for mode in MODES:
        copy_flat(source_of(folders, "scene_%s.png" % mode), (6224, 640))
        copy_flat(source_of(folders, "lights_%s.png" % mode), (6224, 640))
        for name in BLINKS:
            copy_flat(source_of(folders, "%s_%s.png" % (name, mode)), (6224, 640))
        for corner in CORNERS:
            copy_flat(source_of(folders, "select_%s_%s.png" % (corner, mode)), (40, 40))
    for name in SPRITES:
        for mode in MODES:
            copy_flat(source_of(folders, "%s_%s.png" % (name, mode)))
    puffs = puff_sources(slots)
    if puffs:
        puff_dir = os.path.join(ART, "puffs")
        os.makedirs(puff_dir, exist_ok=True)
        for name, sprite in puffs:
            copy_flat(source_of(folders, name), tuple(sprite["size_2x"]), puff_dir)
        print("puffs: %d pngs into art/puffs" % len(puffs))
    overlays = overlay_slices(folders, slots)
    for line in verify(folders, slots, overlays):
        print(line)
    write_slots_js(slots, overlays)
    faces = copy_faces(folders)
    if faces is not None:
        print("faces: %d pngs from %s into the rail and the accounts" % (FACE_COUNT, faces))
    print("art: %d files, slots.js: %d houses" % (len(os.listdir(ART)), len(slots["houses"])))


if __name__ == "__main__":
    main()
