// Tests for tools/preview/compose.py: it keeps the dark frame whose chimney shows three puffs and
// whose street keeps at least three residents (the one whose puffs cover the most when several fit),
// keeps the first light frame with two residents in the tree's stretch of street, writes the two
// picture sizes, and writes nothing when no frame fits or an input is not a 6720x1800 shot. It also
// checks that render.sh refuses fewer than five frames before it opens a window.
// Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPOSE = join(ROOT, "tools/preview/compose.py");
const RENDER = join(ROOT, "tools/preview/render.sh");

// The fixture script draws resident rectangles across the street band (1840..4400 for dark,
// 2738..3762 for light) and up to three grey circles in the smoke box. Frame 4 of the dark set is
// the only one with three residents on the street and all three circles; frame 2 of the light set is
// the first with two residents by the tree. Frames 2 and 5 of the area set both fit, with small
// circles in frame 2 and large ones in frame 5. Resident columns recur in at most two of six frames
// so the median background stays the background.
const FIXTURES = `
import os, shutil, sys
from PIL import Image, ImageDraw
out = sys.argv[1]
DARK_BG, LIGHT_BG = (0x1E, 0x2A, 0x44), (0xFB, 0xF8, 0xF2)
DARK_RECT, LIGHT_RECT = (232, 238, 248), (32, 48, 79)
SMOKE = (170, 175, 190)
CIRCLES = [(2740, 160), (2780, 220), (2830, 280)]

def frame(bg, rect, residents, circles, radius=20):
    im = Image.new("RGB", (6720, 1800), bg)
    d = ImageDraw.Draw(im)
    for x in residents:
        d.rectangle((x, 520, x + 39, 619), fill=rect)
    for i in range(circles):
        cx, cy = CIRCLES[i]
        d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=SMOKE)
    return im

dark = [([1880, 2000, 2120, 2240], 1), ([2360, 2480, 2600], 2), ([1700, 1780, 4500], 3),
        ([1880, 2720, 2840, 2960], 3), ([3080, 3200], 3), ([3320, 3440, 3560, 3680, 3800], 1)]
light = [([2650, 2000], 0), ([2760, 2880], 0), ([3000], 0),
         ([3000, 3120, 3240, 3360], 0), ([2650, 3800], 0), ([3720, 3920], 0)]
area = [([1880, 2000, 2120], 0), ([1880, 2000, 2120], 3, 16), ([2240, 2360], 3),
        ([2480, 2600, 2720], 2), ([2480, 2600, 2720, 2840], 3, 24), ([2960, 3080, 3200], 3, 12)]
main = os.path.join(out, "main")
no_puff = os.path.join(out, "no-puff")
small = os.path.join(out, "small")
area_dir = os.path.join(out, "area")
for folder in (main, no_puff, small, area_dir):
    os.makedirs(folder)
for i, spec in enumerate(dark, 1):
    frame(DARK_BG, DARK_RECT, *spec).save(os.path.join(main, "dark_%d.png" % i))
for i, spec in enumerate(light, 1):
    frame(LIGHT_BG, LIGHT_RECT, *spec).save(os.path.join(main, "light_%d.png" % i))
for i, spec in enumerate(area, 1):
    frame(DARK_BG, DARK_RECT, *spec).save(os.path.join(area_dir, "dark_%d.png" % i))
    shutil.copyfile(os.path.join(main, "light_%d.png" % i), os.path.join(area_dir, "light_%d.png" % i))
# A dark set where the only frame with three residents on the street shows a single puff.
frame(DARK_BG, DARK_RECT, [1880, 2720, 2840], 1).save(os.path.join(no_puff, "dark_4.png"))
for i in (1, 2, 3, 5, 6):
    shutil.copyfile(os.path.join(main, "dark_%d.png" % i), os.path.join(no_puff, "dark_%d.png" % i))
# A light set whose first frame is not a 6720x1800 shot.
Image.open(os.path.join(main, "light_1.png")).resize((3350, 900)).save(os.path.join(small, "light_1.png"))
for i in (2, 3, 4, 5, 6):
    shutil.copyfile(os.path.join(main, "light_%d.png" % i), os.path.join(small, "light_%d.png" % i))
`;

function uv(args) {
  return spawnSync("uv", ["run", "-q", "--with", "pillow", "python3", "-I", ...args], { encoding: "utf8" });
}

function frames(folder, theme) {
  return [1, 2, 3, 4, 5, 6].map((i) => join(folder, `${theme}_${i}.png`));
}

function pngSize(path) {
  const header = readFileSync(path);
  assert.equal(header.toString("ascii", 1, 4), "PNG", `${path} is a PNG`);
  return [header.readUInt32BE(16), header.readUInt32BE(20)];
}

function prepare(dir) {
  const made = uv(["-c", FIXTURES, dir]);
  assert.equal(made.status, 0, `the fixture frames were not drawn: ${made.stderr}`);
  return dir;
}

test("compose.py keeps the puff frame with three residents and the first light frame with two", () => {
  const dir = mkdtempSync(join(tmpdir(), "xmas-compose-"));
  try {
    prepare(dir);
    const hero = join(dir, "hero.png");
    const layout = join(dir, "layout.png");
    const run = uv([COMPOSE, "--out-hero", hero, "--out-layout", layout,
      "--dark", ...frames(join(dir, "main"), "dark"), "--light", ...frames(join(dir, "main"), "light")]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /dark_4\.png/, "the dark frame with the puffs and three residents");
    assert.match(run.stderr, /light_2\.png/, "the first light frame with two residents by the tree");
    assert.deepEqual(pngSize(hero), [2560, 1600], "the gallery picture is 2560x1600");
    assert.deepEqual(pngSize(layout), [640, 400], "the layout picture is 640x400");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("compose.py writes nothing when no dark frame keeps three puffs", () => {
  const dir = mkdtempSync(join(tmpdir(), "xmas-compose-"));
  try {
    prepare(dir);
    const hero = join(dir, "hero.png");
    const layout = join(dir, "layout.png");
    const run = uv([COMPOSE, "--out-hero", hero, "--out-layout", layout,
      "--dark", ...frames(join(dir, "no-puff"), "dark"), "--light", ...frames(join(dir, "main"), "light")]);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /no dark frame keeps three residents and three puffs/,
      "the failure names the dark rule");
    assert.equal(existsSync(hero), false, "no gallery picture is written");
    assert.equal(existsSync(layout), false, "no layout picture is written");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("compose.py refuses an input that is not a 6720x1800 shot", () => {
  const dir = mkdtempSync(join(tmpdir(), "xmas-compose-"));
  try {
    prepare(dir);
    const hero = join(dir, "hero.png");
    const layout = join(dir, "layout.png");
    const run = uv([COMPOSE, "--out-hero", hero, "--out-layout", layout,
      "--dark", ...frames(join(dir, "main"), "dark"), "--light", ...frames(join(dir, "small"), "light")]);
    assert.equal(run.status, 1, run.stderr);
    assert.match(run.stderr, /light_1\.png/, "the failure names the file");
    assert.equal(existsSync(hero), false, "no gallery picture is written");
    assert.equal(existsSync(layout), false, "no layout picture is written");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("compose.py keeps the passing dark frame whose puffs cover the most", () => {
  const dir = mkdtempSync(join(tmpdir(), "xmas-compose-"));
  try {
    prepare(dir);
    const hero = join(dir, "hero.png");
    const layout = join(dir, "layout.png");
    const run = uv([COMPOSE, "--out-hero", hero, "--out-layout", layout,
      "--dark", ...frames(join(dir, "area"), "dark"), "--light", ...frames(join(dir, "main"), "light")]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /dark_5\.png/, "the larger puffs win over the smaller ones");
    assert.deepEqual(pngSize(hero), [2560, 1600], "the gallery picture is 2560x1600");
    assert.deepEqual(pngSize(layout), [640, 400], "the layout picture is 640x400");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("render.sh refuses fewer than five frames before a window opens", () => {
  const run = spawnSync("sh", [RENDER], {
    encoding: "utf8",
    env: { ...process.env, LIGHT_SHOTS: "3" },
  });
  assert.equal(run.status, 2, run.stderr);
  assert.match(run.stderr, /LIGHT_SHOTS and DARK_SHOTS must be whole numbers of at least 5/);
});
