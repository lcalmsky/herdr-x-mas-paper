// Tests for the x-mas paper scene's model: the five pictures a session can show, the seats on the
// two hills, the one-line signs and the demo sessions. Run:
// node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DISPLAY_STATES, HOUSES, PROPS, EXTRAS, SLEEP_MS, displayState, stateOf, placeSessions, clipText, buildSessions,
  layoutBubbles, SEAT_STEP, SEAT_MIN_STEP, HOUSE_H, TREE_H, LAND_BAND, LAND_COLORS, LABEL_MIN_W, NUMBER_H, NAME_SIZE,
  FLAKES, STARS, FRONT_Y, SLEIGH_MS, SLEIGH_REST_MS, GARLAND_H,
} from "../mods/x-mas-paper-scene/model.js";
import { sceneLayers } from "../mods/x-mas-paper-scene/scene.js";
import { ASSETS } from "../mods/x-mas-paper-scene/manifest.js";
import { demoSessions, demoRead } from "../mods/x-mas-paper-scene/demo.js";

const NOW = 1_700_000_000_000;
const ART = fileURLToPath(new URL("../mods/x-mas-paper-scene/art/", import.meta.url));

test("a session's model state becomes one of the five pictures", () => {
  assert.equal(stateOf({ status: "waiting", waitingFor: "reply" }), "needs");
  assert.equal(stateOf({ status: "waiting", waitingFor: "permission prompt" }), "approve");
  assert.equal(stateOf({ status: "busy" }), "working");
  assert.equal(stateOf({ status: "shell" }), "working");
  assert.equal(stateOf({ status: "idle" }, false), "done");
  assert.equal(stateOf({ status: "idle" }, true), "idle");
  assert.equal(stateOf({ status: "something else" }), null);

  assert.equal(displayState("working", NOW), "working");
  assert.equal(displayState("needs", NOW), "turn");
  assert.equal(displayState("approve", NOW), "turn");
  assert.equal(displayState("done", NOW), "unread");
  // The thirty-minute line: exactly at it is still awake, a minute later is asleep.
  assert.equal(displayState("idle", NOW - SLEEP_MS, NOW), "other");
  assert.equal(displayState("idle", NOW - SLEEP_MS - 1, NOW), "sleeping");
  assert.equal(displayState("idle", null, NOW), "other");
  assert.equal(displayState(null, NOW - 10 * SLEEP_MS, NOW), "other");
  assert.deepEqual([...DISPLAY_STATES], ["working", "turn", "unread", "sleeping", "other"]);
});

const drawnW = (name, height) => ASSETS[name].size[0] * (height / ASSETS[name].size[1]);
const HOUSE_DRAWN_W = Math.max(...[...HOUSES.light, ...HOUSES.dark].map((name) => drawnW(name, HOUSE_H)));
const TREE_DRAWN_W = drawnW("tree", TREE_H);

test("the front row closes its pitch before a session takes the back row", () => {
  const W = 1060;
  const list = Array.from({ length: 9 }, (_, i) => ({ id: `s-${i}` }));
  const placed = placeSessions(list, W);
  const front = placed.units.filter((u) => u.row === "front").sort((a, b) => a.x - b.x);
  assert.equal(front.length, 9, "nine sessions sit in the front row");
  assert.equal(placed.units.length, 9, "nothing goes to the back row");
  assert.ok(placed.step < SEAT_STEP, `the pitch narrowed from ${SEAT_STEP} (got ${placed.step})`);
  assert.ok(placed.step >= SEAT_MIN_STEP, `the pitch keeps its minimum (got ${placed.step})`);
  for (let i = 1; i < front.length; i += 1) {
    assert.ok(front[i].x - front[i - 1].x >= HOUSE_DRAWN_W,
      `houses at ${front[i - 1].x} and ${front[i].x} keep their boxes apart`);
  }
  const nearest = Math.min(...front.map((u) => Math.abs(u.x - W / 2)));
  assert.ok(nearest - HOUSE_DRAWN_W / 2 - TREE_DRAWN_W / 2 >= 4, "the nearest house clears the tree by 4 px");
  // 700 px: even the narrowest pitch runs out, so the rest takes the back row.
  const narrow = placeSessions(list, 700);
  assert.equal(narrow.units.filter((u) => u.row === "front").length, 6, "six fit the front row at 700");
  assert.equal(narrow.units.filter((u) => u.row === "back").length, 3, "the other three go behind");
  assert.equal(narrow.step, SEAT_MIN_STEP, "the pitch stops at its minimum");
});

test("with a handful of sessions the front row keeps its default pitch", () => {
  const placed = placeSessions([{ id: "a" }, { id: "b" }], 1200);
  assert.deepEqual(placed.units.map((u) => u.x), [730, 470]);
  assert.equal(placed.step, SEAT_STEP);
  assert.deepEqual(placeSessions([{ id: "a" }], 1200).units.map((u) => u.number), [1]);
});

test("more sessions than both rows hold end in +N marks", () => {
  const W = 1200;
  const list = Array.from({ length: 30 }, (_, i) => ({ id: `s-${i}` }));
  const placed = placeSessions(list, W);
  const front = placed.units.filter((u) => u.row === "front").length;
  const back = placed.units.filter((u) => u.row === "back").length;
  assert.equal(placed.overflow.length, 2, "one +N at each end");
  assert.equal(placed.hidden, 30 - front - back);
  for (const unit of placed.units) assert.ok(unit.x > 0 && unit.x < W, `seat ${unit.x} inside`);
  for (const mark of placed.overflow) {
    assert.ok(mark.x > 0 && mark.x < W, `+N at ${mark.x} inside`);
    assert.equal(mark.text, `+${placed.hidden}`);
  }
});

// The scene's bubbles at scale 1, as scene.js passes them.
const ASK_OPTS = { width: 1200, size: 11, pad: 6, maxW: 180, bh: 20, gap: 4, margin: 4, clear: 2, minW: 48 };
const CUT_TEXT = "A long question that will need cutting somewhere";
const askAt = (x, i, extra = {}) => ({ id: `a${i}`, text: CUT_TEXT, x, top: 78, claim: true, ...extra });
const covers = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const overlapsAmong = (boxes) => boxes.some((a, i) => boxes.slice(i + 1).some((b) => covers(a, b)));

test("neighbouring waiting bubbles rise a level instead of covering each other", () => {
  const boxes = layoutBubbles([
    { id: "cocoa", text: "Publish the cocoa guide to the site?", x: 360, top: 78, claim: true },
    { id: "gift", text: "Sync the wishlist to the new sheet?", x: 470, top: 78, claim: true },
  ], ASK_OPTS);
  assert.equal(boxes.length, 2);
  assert.equal(boxes.find((b) => b.id === "gift").top, 78 - 20 - 4, "the right bubble rises one level");
  assert.equal(overlapsAmong(boxes), false, "the two bubbles do not cover each other");
  for (const box of boxes) assert.ok(box.left >= 0 && box.right <= ASK_OPTS.width, `${box.id} stays in the scene`);
});

test("three bubbles in a row use both levels", () => {
  const boxes = layoutBubbles([140, 250, 360].map(askAt), ASK_OPTS);
  assert.deepEqual(boxes.map((b) => b.top), [78, 54, 78], "the middle one takes the upper level");
  assert.equal(overlapsAmong(boxes), false);
});

test("with no room left a bubble is cut, then left out", () => {
  const asks = [60, 70, 80].map(askAt);
  const cut = layoutBubbles(asks, { ...ASK_OPTS, width: 300 });
  assert.equal(cut.length, 3, "the third is cut, not dropped");
  assert.ok(cut[2].w < cut[0].w, "the third is narrower than its text wanted");
  assert.ok(cut[2].text.endsWith("…"), "the third's line is cut");
  assert.equal(overlapsAmong(cut), false);
  const dropped = layoutBubbles(asks, { ...ASK_OPTS, width: 210 });
  assert.deepEqual(dropped.map((b) => b.id), ["a0", "a1"], "no room for a 48 px bubble, so it is left out");
});

test("a raised bubble stays below the scene's top and is slid aside", () => {
  const boxes = layoutBubbles([100, 140].map((x, i) => askAt(x, i, { top: 16 })), ASK_OPTS);
  assert.equal(boxes.length, 2);
  for (const box of boxes) assert.ok(box.top >= ASK_OPTS.clear, `${box.id} keeps y ≥ 2`);
  assert.equal(overlapsAmong(boxes), false, "the second slid past the first");
});

// The back row starts its bubbles 12 px higher, so a front bubble and a back bubble that share
// neither level nor row can still cover each other if the layout only looks at its own row.
const QUESTIONS = [
  "Should I merge the gift tracker branch now please?",
  "Publish the cocoa guide to the site?",
  "Allow the sleigh router to run",
];
const askOf = (unit, question) => ({ id: unit.id, text: question, x: unit.x, top: unit.row === "back" ? 66 : 78, claim: true });
const optsAt = (width) => ({ ...ASK_OPTS, width, maxW: Math.min(180, width - 12) });

test("bubbles clear the other row as well as their own", () => {
  // 13 sessions at 1200: the front row takes 12 seats and s12 goes behind them.
  const units = placeSessions(Array.from({ length: 13 }, (_, i) => ({ id: `s${i}` })), 1200).units;
  const [s1, s2, s12] = ["s1", "s2", "s12"].map((id) => units.find((u) => u.id === id));
  assert.deepEqual([s1.row, s1.x, s2.row, s2.x, s12.row, s12.x], ["front", 500, "front", 784, "back", 700]);
  const boxes = layoutBubbles([s1, s2, s12].map((unit) => askOf(unit, QUESTIONS[0])), optsAt(1200));
  assert.equal(boxes.length, 3);
  assert.equal(overlapsAmong(boxes), false, "the back bubble stays clear of both front ones");
});

test("two thousand scenes of real seat positions never overlap a bubble", () => {
  let seed = 1;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 2000; i += 1) {
    const width = 700 + Math.floor(rnd() * 1701);
    const count = 1 + Math.floor(rnd() * 14);
    const units = placeSessions(Array.from({ length: count }, (_, j) => ({ id: `r${j}` })), width).units;
    const asks = units.map((unit) => askOf(unit, QUESTIONS[Math.floor(rnd() * QUESTIONS.length)]));
    const boxes = layoutBubbles(asks, optsAt(width));
    assert.equal(overlapsAmong(boxes), false, `scene ${i}: width ${width}, ${count} sessions`);
    for (const box of boxes) {
      assert.ok(box.left >= 0 && box.right <= width, `scene ${i}: ${box.id} stays in the scene`);
    }
  }
});

test("a one-line sign is cut at a Korean word, never inside one", () => {
  const line = "눈사람이 크리스마스 선물을 포장하고 있습니다";
  const cut = clipText(line, 120, 11);
  assert.ok(cut.endsWith("…"));
  const kept = cut.slice(0, -1);
  assert.ok(line.startsWith(kept), "the kept text is the original's start");
  assert.equal(line[kept.length], " ", "the cut landed on a space");
  assert.equal(clipText("short line", 120, 11), "short line");
  assert.equal(clipText("  ", 120, 11), "");
});

test("the demo sessions show all five pictures", () => {
  const sessions = demoSessions(NOW);
  assert.equal(sessions.length, 9);
  const items = buildSessions({ sessions, read: new Set(demoRead(sessions)), now: NOW });
  assert.deepEqual([...new Set(items.map((item) => item.display))].sort(), [...DISPLAY_STATES].sort());
  for (const id of ["snow-api", "gift-tracker", "sleigh-router", "cocoa-docs", "elf-queue", "star-ui", "bell-cli", "wreath-sync", "sock-notes"]) {
    assert.ok(items.some((item) => item.id === id), `${id} is in the demo`);
  }
});

test("every asset the village names is in the manifest, dark names included", () => {
  const files = new Set(readdirSync(ART));
  for (const tone of ["light", "dark"]) {
    for (const name of HOUSES[tone]) {
      const asset = ASSETS[name];
      assert.ok(asset, `${name} is in the manifest`);
      assert.ok(files.has(asset.file), `${asset.file} is in art/`);
      for (const overlay of Object.values(asset.overlays ?? {})) assert.ok(files.has(overlay), `${overlay} is in art/`);
    }
    for (const name of Object.values(PROPS[tone])) {
      const asset = ASSETS[name];
      assert.ok(asset, `${name} is in the manifest`);
      assert.ok(files.has(asset.file), `${asset.file} is in art/`);
    }
    for (const name of Object.values(EXTRAS[tone])) {
      const asset = ASSETS[name];
      assert.ok(asset, `${name} is in the manifest`);
      assert.ok(files.has(asset.file), `${asset.file} is in art/`);
    }
  }
  assert.ok(files.has("bg_light.webp") && files.has("bg_dark.webp"), "both backgrounds are in art/");
});

// The scene's nodes as the stub records them, for one render at a tone and height. The colours
// are main.js's TOKENS, which is what sceneLayers is given in the real window.
const COLORS = {
  light: { text: "#3A3530", muted: "#8A7868", accent: "#C8423B", surface: "#FFFDF8", ground: "#FBF8F2" },
  dark: { text: "#DCE3EE", muted: "#8A94A8", accent: "#F2C46D", surface: "#18203A", ground: "#1E2A44" },
};
const round2 = (n) => Math.round(n * 100) / 100;
const callOf = (node, name) => node.calls.find(([key]) => key === name)?.[1];
const loopOf = (node, name) => node.calls.find(([key, prop]) => key === "loop" && prop === name)?.[2];
const transitionOf = (node) => node.calls.find(([key]) => key === "transition")?.[2];
function renderScene(units, { width, height = 240, tone = "light", sleigh = false }) {
  globalThis.uiIds = [];
  globalThis.uiNodes = new Map();
  globalThis.uiSizes = new Map();
  try {
    sceneLayers({ width, height, tone, units, overflow: [], sleigh, colors: COLORS[tone], visit() {} });
    return { ids: [...globalThis.uiIds], nodes: new Map(globalThis.uiNodes), sizes: new Map(globalThis.uiSizes) };
  } finally {
    delete globalThis.uiIds;
    delete globalThis.uiNodes;
    delete globalThis.uiSizes;
  }
}
const demoUnits = (width) => {
  const sessions = demoSessions(NOW);
  return placeSessions(buildSessions({ sessions, read: new Set(demoRead(sessions)), now: NOW }), width).units;
};

test("the land band closes the block's foot in the mode's own colour", () => {
  const units = placeSessions([{ id: "a", name: "a" }], 1200).units;
  for (const height of [240, 320]) {
    const k = height / 240;
    for (const tone of ["light", "dark"]) {
      const { nodes, sizes } = renderScene(units, { width: 1200, height, tone });
      const band = nodes.get("paper-land");
      assert.ok(band, `${tone} at ${height}: the band is drawn`);
      assert.equal(callOf(band, "top"), round2(height - LAND_BAND * k), `${tone} at ${height}: the band starts at the foot`);
      assert.deepEqual(sizes.get("paper-land"), { w: 1200, h: round2(LAND_BAND * k) }, `${tone} at ${height}: the band spans the block`);
      assert.equal(band.bg, LAND_COLORS[tone], `${tone} at ${height}: the band takes the land's colour`);
    }
  }
});

test("every house hangs its door number on a plate over the ground", () => {
  const units = demoUnits(1140);
  for (const tone of ["light", "dark"]) {
    const { nodes, sizes } = renderScene(units, { width: 1140, height: 240, tone });
    for (const unit of units) {
      const size = sizes.get(`paper-number-${unit.id}`);
      const plate = nodes.get(`paper-number-plate-${unit.id}`);
      assert.ok(size && plate, `${tone}: ${unit.id} has a number plate`);
      assert.equal(size.h, round2(NUMBER_H * unit.scale), `${tone}: ${unit.id}'s plate row is ${round2(NUMBER_H * unit.scale)} tall`);
      assert.deepEqual(plate.texts, [String(unit.number)], `${tone}: ${unit.id}'s door says its number`);
      assert.equal(plate.ink, COLORS[tone].accent, `${tone}: ${unit.id}'s number is in the accent`);
      assert.equal(plate.bg, COLORS[tone].ground, `${tone}: ${unit.id}'s plate is the ground's colour`);
    }
  }
});

test("a front-row house's name sits under it, inside the block and in the text colour", () => {
  const units = demoUnits(1140);
  for (const tone of ["light", "dark"]) {
    const { nodes, sizes } = renderScene(units, { width: 1140, height: 240, tone });
    for (const unit of units.filter((u) => u.row === "front")) {
      const node = nodes.get(`paper-name-${unit.id}`);
      assert.ok(node, `${unit.id} has its name node`);
      const left = callOf(node, "left");
      const top = callOf(node, "top");
      const size = sizes.get(`paper-name-${unit.id}`);
      assert.ok([left, top, size.w].every(Number.isFinite), `${unit.id}'s box is real (left ${left}, top ${top}, w ${size.w})`);
      assert.ok(size.w >= LABEL_MIN_W, `${unit.id}'s label is at least ${LABEL_MIN_W} px wide`);
      assert.ok(left >= 0 && left + size.w <= 1140, `${unit.id}'s name stays inside the block`);
      assert.ok(top >= 0 && top + NAME_SIZE <= 240, `${unit.id}'s name ends inside the block`);
      assert.ok(!node.calls.some(([key, value]) => key === "opacity" && value !== 1), `${unit.id}'s name is fully opaque`);
      assert.notEqual(node.ink, COLORS[tone].ground, `${unit.id}'s name is not the ground's colour`);
      assert.equal(node.texts.length, 1);
      assert.ok(node.texts[0].length > 0, `${unit.id}'s name is not empty`);
    }
  }
});

test("only the front row is named; a back-row house has no label", () => {
  const placed = placeSessions(Array.from({ length: 9 }, (_, i) => ({ id: `b${i}`, name: `Back ${i}` })), 700);
  const back = placed.units.filter((u) => u.row === "back");
  const front = placed.units.filter((u) => u.row === "front");
  assert.ok(back.length > 0, "the narrow scene has a back row");
  const { ids } = renderScene(placed.units, { width: 700, height: 240 });
  for (const unit of front) assert.ok(ids.includes(`paper-name-${unit.id}`), `${unit.id} is named`);
  for (const unit of back) assert.ok(!ids.includes(`paper-name-${unit.id}`), `${unit.id} behind the front houses is not`);
});

const ART_SRC = "mods/x-mas-paper-scene/art/";
const garlandIds = (nodes) => [...nodes.keys()].filter((id) => id.startsWith("paper-garland-"));

test("the sky and roof extras come from the tone's own sheet", () => {
  const units = demoUnits(1200);
  for (const tone of ["light", "dark"]) {
    const { nodes } = renderScene(units, { width: 1200, height: 240, tone });
    assert.equal(nodes.get("paper-sleigh").src, `${ART_SRC}${EXTRAS[tone].sleigh}.webp`, `${tone}: the sleigh`);
    FLAKES.forEach((_, i) => assert.equal(nodes.get(`paper-flake-${i}`)?.src, `${ART_SRC}${EXTRAS[tone].snowflake}.webp`,
      `${tone}: flake ${i}`));
    STARS.forEach((_, i) => {
      const star = nodes.get(`paper-star-${i}`);
      if (tone === "dark") assert.equal(star?.src, `${ART_SRC}${EXTRAS.dark.star}.webp`, `star ${i} at night`);
      else assert.equal(star, undefined, "the light sky has no stars");
    });
    const garlands = garlandIds(nodes);
    assert.ok(garlands.length > 0, `${tone}: the roofs are joined`);
    for (const id of garlands) assert.equal(nodes.get(id).src, `${ART_SRC}${EXTRAS[tone].garland}.webp`, `${tone}: ${id}`);
  }
});

test("a garland joins every neighbouring pair of front roofs except the tree's gap", () => {
  for (const [width, count] of [[700, 9], [1060, 9], [1200, 13], [2400, 13]]) {
    const units = placeSessions(Array.from({ length: count }, (_, i) => ({ id: `g${i}`, name: `G ${i}` })), width).units;
    const front = units.filter((u) => u.row === "front").sort((a, b) => a.x - b.x);
    const pairs = [];
    for (let j = 1; j < front.length; j += 1) {
      if (front[j - 1].x < width / 2 && front[j].x > width / 2) continue;
      pairs.push([front[j - 1], front[j]]);
    }
    const { nodes, sizes } = renderScene(units, { width, height: 240, tone: "light" });
    const ids = garlandIds(nodes);
    assert.equal(ids.length, pairs.length, `width ${width}: one garland per pair but the tree's`);
    for (const id of ids) {
      const left = callOf(nodes.get(id), "left"), top = callOf(nodes.get(id), "top"), size = sizes.get(id);
      assert.equal(size.h, GARLAND_H, `${id} hangs ${GARLAND_H} px`);
      assert.ok(left + size.w / 2 > 0 && left + size.w / 2 < width, `${id} stays in the block`);
      assert.ok(Math.abs(left + size.w / 2 - width / 2) > 1, `${id} is not the tree's gap`);
      assert.ok(pairs.some(([l, r]) => left > l.x && left + size.w < r.x), `${id} spans the gap between two houses`);
      assert.ok(top + size.h < FRONT_Y, `${id} hangs from the roofs, above the ground`);
    }
  }
});

test("the sleigh crosses the sky between two rests off the edges", () => {
  const units = demoUnits(1200);
  for (const height of [240, 320]) {
    for (const tone of ["light", "dark"]) {
      const parked = renderScene(units, { width: 1200, height, tone });
      const node = parked.nodes.get("paper-sleigh");
      const size = parked.sizes.get("paper-sleigh");
      assert.equal(callOf(node, "left"), round2(1200 + 4), `${tone} at ${height}: waits off the right edge`);
      assert.equal(transitionOf(node).duration, 0, "the return is not animated");
      assert.ok(callOf(node, "top") >= 0 && callOf(node, "top") + size.h <= height, "the sleigh stays in the block");

      const crossing = renderScene(units, { width: 1200, height, tone, sleigh: true });
      const flying = crossing.nodes.get("paper-sleigh");
      const fsize = crossing.sizes.get("paper-sleigh");
      assert.ok(callOf(flying, "left") + fsize.w <= 0, `${tone} at ${height}: leaves the left edge`);
      assert.equal(transitionOf(flying).duration, SLEIGH_MS, "a crossing takes the sleigh's time");
    }
  }
});

test("the paper snow falls inside the block, above the roofs", () => {
  for (const width of [700, 1200, 2400]) {
    for (const height of [240, 320]) {
      const k = height / 240;
      const { nodes, sizes } = renderScene(demoUnits(width), { width, height, tone: "light" });
      FLAKES.forEach((_, i) => {
        const node = nodes.get(`paper-flake-${i}`);
        const size = sizes.get(`paper-flake-${i}`);
        const left = callOf(node, "left"), top = callOf(node, "top");
        assert.ok(left >= 0 && left + size.w <= width, `${width}: flake ${i} stays in the block`);
        assert.ok(top >= 0 && top + size.h <= height, `${width}: flake ${i} starts in the block`);
        assert.ok(loopOf(node, "top").to + size.h < (FRONT_Y - HOUSE_H) * k, `${width}: flake ${i} turns above the roofs`);
        assert.equal(node.calls.filter(([key, prop]) => key === "loop" && prop !== "top").length, 0, "only top moves");
      });
    }
  }
});

test("the sleigh rises above a bubble in the sky's height", () => {
  // A front and a back house at the same x: the back bubble rises to its second level, which the
  // sleigh's sky height would cover.
  const question = "Will this line fit above the houses?";
  const units = [
    { id: "front", name: "Front", row: "front", x: 470, y: FRONT_Y, scale: 1, number: 1, display: "turn", question },
    { id: "back", name: "Back", row: "back", x: 500, y: 160, scale: 0.72, number: 2, display: "turn", question },
  ];
  for (const tone of ["light", "dark"]) {
    const { nodes, sizes } = renderScene(units, { width: 1200, height: 240, tone, sleigh: true });
    const asks = [...nodes.entries()].filter(([id]) => id.startsWith("paper-ask-"));
    assert.ok(asks.length > 0, "the waiting sessions have bubbles");
    const lowest = Math.min(...asks.map(([, node]) => callOf(node, "top")));
    const sleighTop = callOf(nodes.get("paper-sleigh"), "top"), sleighH = sizes.get("paper-sleigh").h;
    assert.ok(sleighTop < 26, `the sleigh rose from its sky height (top ${sleighTop})`);
    assert.ok(sleighTop + sleighH <= lowest, `the sleigh (${sleighTop}–${sleighTop + sleighH}) clears the highest bubble (${lowest})`);
  }
});

test("the sleeping z's are the dark picture at night and the text in the light", () => {
  const sessions = demoSessions(NOW);
  const items = buildSessions({ sessions, read: new Set(demoRead(sessions)), now: NOW });
  const sleeping = items.find((item) => item.display === "sleeping");
  assert.ok(sleeping, "the demo has a sleeping session");
  const units = placeSessions(items, 1200).units;
  const id = `paper-zzz-${sleeping.id}`;

  const dark = renderScene(units, { width: 1200, height: 240, tone: "dark" }).nodes.get(id);
  const picture = dark.kids.find((kid) => kid.src);
  assert.equal(picture?.src, `${ART_SRC}zzz_dark.webp`, "the night uses the paper zzz");
  assert.ok(picture.calls.some(([key, prop]) => key === "loop" && prop === "opacity"), "the picture blinks");
  assert.equal(callOf(dark, "opacity"), 1, "a sleeping house shows its z's");

  const light = renderScene(units, { width: 1200, height: 240, tone: "light" }).nodes.get(id);
  assert.ok(!light.kids.some((kid) => kid.src), "the light keeps the text");
  assert.ok(light.kids.some((kid) => kid.texts[0] === "z z z"), "the light's z's are still letters");

  const awake = placeSessions(items.map((item) => ({ ...item, display: "other" })), 1200).units;
  const hidden = renderScene(awake, { width: 1200, height: 240, tone: "dark" }).nodes.get(id);
  assert.equal(callOf(hidden, "opacity"), 0, "a house that is not asleep shows none");
});
