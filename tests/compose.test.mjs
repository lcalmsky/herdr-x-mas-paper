// Tests for tools/preview/compose.py: it keeps the dark frame whose chimney shows three puffs and
// whose tree keeps two walkers (the one whose puffs cover the most when several fit), keeps the
// first light frame with the two walkers, writes the two picture sizes, and writes nothing when no
// frame fits or an input is not a 6720x1800 shot. It also checks that render.sh refuses fewer than
// five frames before it opens a window.
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

// The fixture script draws two rectangles inside the walkers band and up to three grey circles in
// the smoke box. Frame 4 of the dark set is the only one whose walkers sit in 2980..3230 and that
// has all three circles; frame 2 of the light set is the first with the walkers in range. The area
// set has two frames that fit, with small circles in frame 2 and large ones in frame 5.
const FIXTURES = `
import os, shutil, sys
from PIL import Image, ImageDraw
out = sys.argv[1]
DARK_BG, LIGHT_BG = (0x1E, 0x2A, 0x44), (0xFB, 0xF8, 0xF2)
DARK_RECT, LIGHT_RECT = (232, 238, 248), (32, 48, 79)
SMOKE = (170, 175, 190)
CIRCLES = [(2740, 160), (2780, 220), (2830, 280)]

def frame(bg, rect, walkers, circles, radius=20):
    im = Image.new("RGB", (6720, 1800), bg)
    d = ImageDraw.Draw(im)
    for x in walkers:
        d.rectangle((x, 520, x + 39, 619), fill=rect)
    for i in range(circles):
        cx, cy = CIRCLES[i]
        d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=SMOKE)
    return im

dark = [([2900, 3300], 1), ([2850, 3350], 0), ([3000], 1),
        ([3000, 3150], 3), ([2950, 3250], 0), ([3050, 3300], 1)]
light = [([2900, 3300], 0), ([3000, 3150], 0), ([2950, 3250], 0),
         ([3050, 3300], 0), ([2850, 3350], 0), ([3000], 0)]
area = [([2900, 3300], 0), ([3000, 3150], 3, 16), ([2850, 3350], 0),
        ([2950, 3250], 0), ([3000, 3150], 3, 24), ([3050, 3300], 0)]
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
# A dark set where the only frame with the walkers in range shows a single puff.
frame(DARK_BG, DARK_RECT, [3000, 3150], 1).save(os.path.join(no_puff, "dark_4.png"))
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

test("compose.py keeps the puff frame with two walkers and the first light frame with two", () => {
  const dir = mkdtempSync(join(tmpdir(), "xmas-compose-"));
  try {
    prepare(dir);
    const hero = join(dir, "hero.png");
    const layout = join(dir, "layout.png");
    const run = uv([COMPOSE, "--out-hero", hero, "--out-layout", layout,
      "--dark", ...frames(join(dir, "main"), "dark"), "--light", ...frames(join(dir, "main"), "light")]);
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stderr, /dark_4\.png/, "the dark frame with the puffs and both walkers");
    assert.match(run.stderr, /light_2\.png/, "the first light frame with both walkers");
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
    assert.match(run.stderr, /dark/, "the failure names the theme");
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
