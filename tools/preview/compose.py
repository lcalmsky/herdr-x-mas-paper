"""Picks the gallery frames and composes the two preview pictures.

Takes several frames per theme, keeps the dark frame whose chimney shows three puffs and whose
street keeps at least three residents (the one whose puffs cover the most when several fit, ties
going to the frame with more residents), and the first light frame whose stretch of street under
the tree keeps two residents. The gallery picture is a poster of that dark frame: its village band
sits large on a night sky, with a terminal card and a rail card below. The layout picture cuts the
light frame around the tree and the notes house.

Every coordinate below is in the 6720x1800 shot, which is the 3360x900 window at 2x. If the demo
scene's placement changes, re-fit the village band (all five houses, docs through api), the street
band (the front snow path the residents walk, across 1840..4400), the light-theme share of it under
the tree (2738..3762), the terminal band (the prompt line down to the "3 of 3 routes pass" line),
the rail band (the north-pole and cocoa-house groups, cut on a group boundary) and the 640 band
(the tree, the notes house and its Your turn bubble).
"""
import argparse
import random
import sys
from PIL import Image, ImageChops, ImageDraw, ImageFilter

SHOT = (6720, 1800)
STREET = (1840, 500, 4400, 660)        # the front snow path the residents walk
LIGHT_STREET = (2738, 500, 3762, 660)  # the stretch of that path under the tree
BOX = (2700, 120, 2860, 320)       # the chimney's smoke

GALLERY = (2560, 1600)
SKY_TOP, SKY_BOT = (12, 24, 54), (18, 32, 66)
VILLAGE = (1840, 16, 4400, 655)    # the five painted houses, docs through api
VILLAGE_Y = 60
VILLAGE_FADE = (220, 220, 140, 0)  # left, right, top, bottom
TERMINAL = (40, 775, 1880, 1470)   # the prompt line down to "3 of 3 routes pass"
TERMINAL_SCALE = 0.9
TERMINAL_PAD = (44, 36)
TERMINAL_BG = (24, 32, 58)
RAIL = (6236, 84, 6716, 770)       # the north-pole and cocoa-house groups
RAIL_PAD = 20
RAIL_BG = (30, 42, 68)
CARD_RAD = 28
CARD_BG = (30, 42, 68)
CARD_BORDER = (58, 72, 108)
CARD_GAP = 40
BOTTOM = 96
STAR_CENTERS = ((3325, 90, 34), (2659, 135, 28), (2910, 266, 26))  # x, y, half-size
STARS_N, STARS_SEED = 24, 7
LAYOUT = (2738, 14, 3762, 654)     # tree, the notes house and its Your turn bubble


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


def street_background(images, band):
    width, height = band[2] - band[0], band[3] - band[1]
    rows = [image.crop(band).convert("L").tobytes() for image in images]
    count = len(rows)
    mid = count // 2
    median = bytearray(width * height)
    for pixel in range(width * height):
        values = sorted(row[pixel] for row in rows)
        median[pixel] = values[mid] if count % 2 else (values[mid - 1] + values[mid]) // 2
    return median


def residents(image, median, band):
    width, height = band[2] - band[0], band[3] - band[1]
    data = image.crop(band).convert("L").tobytes()
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
        at = band[0] + x
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


def pick_dark(paths, images):
    median = street_background(images, STREET)
    measured = []
    passing = []
    for path, image in zip(paths, images):
        blobs = residents(image, median, STREET)
        areas = smoke(image)
        measured.append((path, blobs, areas))
        if len(blobs) >= 3 and len(areas) >= 3:
            passing.append((sum(areas), len(blobs), image, path))
    if not passing:
        for path, blobs, areas in measured:
            sys.stderr.write(f"compose.py: dark {path}: residents {blobs}, smoke {areas}\n")
        return None
    best = max(passing, key=lambda item: (item[0], item[1]))
    return best[2], best[3]


def pick_light(paths, images):
    median = street_background(images, LIGHT_STREET)
    measured = []
    for path, image in zip(paths, images):
        blobs = residents(image, median, LIGHT_STREET)
        measured.append((path, blobs))
        if len(blobs) >= 2:
            return image, path
    for path, blobs in measured:
        sys.stderr.write(f"compose.py: light {path}: residents {blobs}\n")
    return None


def sky():
    width, height = GALLERY
    image = Image.new("RGB", (width, height))
    draw = ImageDraw.Draw(image)
    for y in range(height):
        t = y / (height - 1)
        draw.line([(0, y), (width, y)],
                  fill=tuple(round(a + (b - a) * t) for a, b in zip(SKY_TOP, SKY_BOT)))
    return image


def star_sprites(dark):
    return [dark.crop((x - half, y - half, x + half, y + half)) for x, y, half in STAR_CENTERS]


def scatter_stars(image, sprites, avoid, n=STARS_N, seed=STARS_SEED):
    width, height = GALLERY
    rng = random.Random(seed)
    for _ in range(n * 6):
        if n <= 0:
            break
        sprite = rng.choice(sprites)
        scale = rng.uniform(0.5, 1.0)
        sprite = sprite.resize((int(sprite.width * scale), int(sprite.height * scale)), Image.LANCZOS)
        x = rng.randint(20, width - 80)
        y = rng.randint(20, height - 80)
        if any(x + sprite.width > a and x < c and y + sprite.height > b and y < e for a, b, c, e in avoid):
            continue
        mask = sprite.convert("L").point(lambda v: 0 if v < 70 else min(255, (v - 70) * 3))
        image.paste(sprite, (x, y), mask)
        n -= 1


def feather(image, left, right, top, bottom):
    mask = Image.new("L", image.size, 255)
    draw = ImageDraw.Draw(mask)
    width, height = image.size
    for i in range(left):
        draw.line([(i, 0), (i, height)], fill=int(255 * i / left))
    for i in range(right):
        draw.line([(width - 1 - i, 0), (width - 1 - i, height)], fill=int(255 * i / right))
    if top:
        edge = Image.new("L", image.size, 255)
        edge_draw = ImageDraw.Draw(edge)
        for i in range(top):
            edge_draw.line([(0, i), (width, i)], fill=int(255 * i / top))
        mask = ImageChops.multiply(mask, edge)
    if bottom:
        edge = Image.new("L", image.size, 255)
        edge_draw = ImageDraw.Draw(edge)
        for i in range(bottom):
            edge_draw.line([(0, height - 1 - i), (width, height - 1 - i)], fill=int(255 * i / bottom))
        mask = ImageChops.multiply(mask, edge)
    return mask


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    return mask


def card(canvas, content, xy, radius=CARD_RAD, pad=0, bg=CARD_BG, border=CARD_BORDER, shadow=True):
    width, height = content.width + 2 * pad, content.height + 2 * pad
    x, y = xy
    if shadow:
        shade = Image.new("L", canvas.size, 0)
        ImageDraw.Draw(shade).rounded_rectangle((x, y + 18, x + width, y + height + 18), radius, fill=150)
        shade = shade.filter(ImageFilter.GaussianBlur(36))
        canvas.paste(Image.new("RGB", canvas.size, (2, 5, 14)), (0, 0), shade)
    plate = Image.new("RGB", (width, height), bg)
    plate.paste(content, (pad, pad))
    if border:
        ImageDraw.Draw(plate).rounded_rectangle((0, 0, width - 1, height - 1), radius, outline=border, width=2)
    canvas.paste(plate, (x, y), rounded_mask((width, height), radius))


def cut(image, box, scale):
    piece = image.crop(box)
    return piece.resize((round(piece.width * scale), round(piece.height * scale)), Image.LANCZOS)


def poster(dark):
    width, height = GALLERY
    image = sky()
    village = dark.crop(VILLAGE)
    terminal = cut(dark, TERMINAL, TERMINAL_SCALE)
    rail = cut(dark, RAIL, 1.0)
    terminal_card = Image.new("RGB", (terminal.width + 2 * TERMINAL_PAD[0],
                                     terminal.height + 2 * TERMINAL_PAD[1]), TERMINAL_BG)
    terminal_card.paste(terminal, TERMINAL_PAD)
    rail_card = Image.new("RGB", (rail.width + 2 * RAIL_PAD, terminal_card.height), RAIL_BG)
    rail_card.paste(rail, (RAIL_PAD, (rail_card.height - rail.height) // 2))
    total = terminal_card.width + CARD_GAP + rail_card.width
    x0 = (width - total) // 2
    y = height - BOTTOM - terminal_card.height
    scatter_stars(image, star_sprites(dark),
                  [(0, VILLAGE_Y, width, VILLAGE_Y + village.height), (x0 - 40, y - 40, x0 + total + 40, height)])
    image.paste(village, (0, VILLAGE_Y), feather(village, *VILLAGE_FADE))
    card(image, terminal_card, (x0, y), bg=TERMINAL_BG)
    card(image, rail_card, (x0 + terminal_card.width + CARD_GAP, y), bg=RAIL_BG)
    return image


def layout640(light):
    x0, y0, x1, y1 = LAYOUT
    return light.crop((x0, y0, x1, y1)).resize((640, 400), Image.LANCZOS)


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
        sys.stderr.write("compose.py: no dark frame keeps three residents and three puffs\n")
        sys.exit(1)
    light = pick_light(light_paths, light_images)
    if light is None:
        sys.stderr.write("compose.py: no light frame keeps two residents by the tree\n")
        sys.exit(1)

    sys.stderr.write(f"compose.py: dark {dark[1]}\n")
    sys.stderr.write(f"compose.py: light {light[1]}\n")

    poster(dark[0]).save(args.out_hero)
    layout640(light[0]).save(args.out_layout)


if __name__ == "__main__":
    main()
