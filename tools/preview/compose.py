"""Picks the gallery frames and composes the two preview pictures.

Takes several frames per theme, keeps the dark frame whose chimney shows three puffs and whose
tree keeps two walkers, and the first light frame that keeps two walkers, then lays them out as a
2560x1600 gallery picture (dark row on top, light row below) and a 640x400 layout picture (night on
the left, day on the right).

Every coordinate below is in the 6720x1800 shot, which is the 3360x900 window at 2x. If the demo
scene's placement changes, re-fit VILLAGE (all five houses, docs through api) and the two rail
ranges, keeping each cut on a group or card boundary rather than through one.
"""
import argparse
import sys
from PIL import Image, ImageDraw

SHOT = (6720, 1800)
LANE = (2850, 500, 3600, 660)      # the walkers band under the tree
BOX = (2700, 120, 2860, 320)       # the chimney's smoke

W, H, ROW, PAD, GAP, RAD = 2560, 1600, 800, 56, 32, 24
BG_DARK, BG_LIGHT = (0x1E, 0x2A, 0x44), (0xFB, 0xF8, 0xF2)
VILLAGE = (2250, 14, 4010, 655)                      # R3
RAIL_DARK = (6240, 85, 6710, 745)                    # R4: north-pole + cocoa-house groups
RAIL_LIGHT = (6240, 945, 6710, 1427)                 # R5: Work + Side account cards


def load(paths, theme):
    if len(paths) < 5:
        sys.stderr.write(f"compose.py: {theme} needs at least 5 frames to take a median, got {len(paths)}\n")
        sys.exit(1)
    images = []
    for path in paths:
        image = Image.open(path).convert("RGB")
        if image.size != SHOT:
            sys.stderr.write(f"compose.py: {path} is {image.width}x{image.height}, not {SHOT[0]}x{SHOT[1]}\n")
            sys.exit(1)
        images.append(image)
    return images


def lane_background(images):
    width, height = LANE[2] - LANE[0], LANE[3] - LANE[1]
    rows = [image.crop(LANE).convert("L").tobytes() for image in images]
    count = len(rows)
    mid = count // 2
    median = bytearray(width * height)
    for pixel in range(width * height):
        values = sorted(row[pixel] for row in rows)
        median[pixel] = values[mid] if count % 2 else (values[mid - 1] + values[mid]) // 2
    return median


def walkers(image, median):
    width, height = LANE[2] - LANE[0], LANE[3] - LANE[1]
    data = image.crop(LANE).convert("L").tobytes()
    columns = [0] * width
    for y in range(height):
        offset = y * width
        for x in range(width):
            if abs(data[offset + x] - median[offset + x]) > 40:
                columns[x] += 1
    blobs = []
    for x, hits in enumerate(columns):
        if hits <= 8:
            continue
        at = LANE[0] + x
        if blobs and at - blobs[-1][1] <= 12:
            blobs[-1][1] = at
        else:
            blobs.append([at, at])
    return [blob for blob in blobs if blob[1] - blob[0] >= 20]


def smoke(image):
    region = image.crop(BOX).convert("RGB")
    width, height = region.size
    data = region.tobytes()
    mask = bytearray(width * height)
    for pixel in range(width * height):
        r, g, b = data[3 * pixel], data[3 * pixel + 1], data[3 * pixel + 2]
        if (r + g + b) / 3 > 100 and max(r, g, b) - min(r, g, b) < 45:
            mask[pixel] = 1
    seen = bytearray(width * height)
    areas = []
    for start in range(width * height):
        if not mask[start] or seen[start]:
            continue
        stack = [start]
        seen[start] = 1
        area = 0
        while stack:
            pixel = stack.pop()
            area += 1
            x, y = pixel % width, pixel // width
            for other in (pixel - 1 if x > 0 else -1, pixel + 1 if x < width - 1 else -1,
                          pixel - width if y > 0 else -1, pixel + width if y < height - 1 else -1):
                if other >= 0 and mask[other] and not seen[other]:
                    seen[other] = 1
                    stack.append(other)
        if area >= 150:
            areas.append(area)
    return areas


def two_walkers(blobs):
    return len(blobs) == 2 and all(start >= 2980 and end <= 3230 for start, end in blobs)


def pick_dark(paths, images):
    median = lane_background(images)
    measured = []
    passing = []
    for path, image in zip(paths, images):
        blobs = walkers(image, median)
        areas = smoke(image)
        measured.append((path, blobs, areas))
        if two_walkers(blobs) and len(areas) >= 3:
            passing.append((sum(areas), image, path))
    if not passing:
        for path, blobs, areas in measured:
            sys.stderr.write(f"compose.py: dark {path}: walkers {blobs}, smoke {areas}\n")
        return None
    best = max(passing, key=lambda item: item[0])
    return best[1], best[2]


def pick_light(paths, images):
    median = lane_background(images)
    measured = []
    for path, image in zip(paths, images):
        blobs = walkers(image, median)
        measured.append((path, blobs))
        if two_walkers(blobs):
            return image, path
    for path, blobs in measured:
        sys.stderr.write(f"compose.py: light {path}: walkers {blobs}\n")
    return None


def place(canvas, src, box, x, y, s):
    cut = src.crop(box)
    cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.LANCZOS)
    mask = Image.new("L", cut.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, cut.width - 1, cut.height - 1), RAD, fill=255)
    canvas.paste(cut, (x, y), mask)
    return cut.size


def main():
    parser = argparse.ArgumentParser(description="Compose the gallery and layout pictures.")
    parser.add_argument("--out-hero", required=True)
    parser.add_argument("--out-layout", required=True)
    parser.add_argument("--dark", nargs="+", action="append", required=True)
    parser.add_argument("--light", nargs="+", action="append", required=True)
    args = parser.parse_args()
    dark_paths = [path for group in args.dark for path in group]
    light_paths = [path for group in args.light for path in group]

    dark_images = load(dark_paths, "dark")
    light_images = load(light_paths, "light")

    dark = pick_dark(dark_paths, dark_images)
    if dark is None:
        sys.stderr.write("compose.py: no dark frame keeps both walkers and three puffs\n")
        sys.exit(1)
    light = pick_light(light_paths, light_images)
    if light is None:
        sys.stderr.write("compose.py: no light frame keeps both walkers\n")
        sys.exit(1)

    sys.stderr.write(f"compose.py: dark {dark[1]}\n")
    sys.stderr.write(f"compose.py: light {light[1]}\n")

    canvas = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, 0, W, ROW - 1), fill=BG_DARK)
    draw.rectangle((0, ROW, W, H), fill=BG_LIGHT)
    content_h = ROW - 2 * PAD
    for row, (src, rail) in enumerate([(dark[0], RAIL_DARK), (light[0], RAIL_LIGHT)]):
        top = row * ROW + PAD
        s = content_h / (VILLAGE[3] - VILLAGE[1])
        village_w, _ = place(canvas, src, VILLAGE, PAD, top, s)
        cx = PAD + village_w + GAP
        cw = W - PAD - cx
        rw, rh = rail[2] - rail[0], rail[3] - rail[1]
        rs = min(cw / rw, content_h / rh)
        place(canvas, src, rail, cx + (cw - round(rw * rs)) // 2, top + (content_h - round(rh * rs)) // 2, rs)
    canvas.save(args.out_hero)

    x0, y0, x1, y1, seam = 2738, 14, 3762, 654, 3400
    cut = Image.new("RGB", (x1 - x0, y1 - y0))
    cut.paste(dark[0].crop((x0, y0, seam, y1)), (0, 0))
    cut.paste(light[0].crop((seam, y0, x1, y1)), (seam - x0, 0))
    cut.resize((640, 400), Image.LANCZOS).save(args.out_layout)


if __name__ == "__main__":
    main()
