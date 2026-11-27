// Tests for the x-mas paper scene: the five pictures a session can show, the block's coordinate
// mapping, the studio canvas's seats, the state overlays and text, the walkers and the demo data.
// Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SLEEP_MS, DISPLAY_STATES, displayState, stateOf, clipText, textWidth, buildSessions, placesOf,
  sceneFrame, placeSessions, overlayState, plateSize, SCENE_H, LABEL_SIZE, LABEL_COLORS, LABEL_MAX_W, LABEL_PAD_X,
  LABEL_FONT, TEXT_FONT,
  BUBBLE_INK, BUBBLE_BG, BUBBLE_SIZE, BUBBLE_PAD_X, ZZZ_SIZE, ZZZ_COLORS, PLUS_COLORS, FADE_MS, WALK_MS, STEP_MS, SMOKE_MS, EDGE, PLATE_INK, PLATE_WEIGHT,
} from "../mods/x-mas-paper-scene/model.js";
import { SLOTS, OVERLAYS } from "../mods/x-mas-paper-scene/slots.js";
import { sceneLayers } from "../mods/x-mas-paper-scene/scene.js";
import { demoSessions, demoRead } from "../mods/x-mas-paper-scene/demo.js";

const NOW = 1_700_000_000_000;
const ART = fileURLToPath(new URL("../mods/x-mas-paper-scene/art/", import.meta.url));
const SRC = "mods/x-mas-paper-scene/art/";
const close = (a, b) => Math.abs(a - b) < 1e-9;

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
  assert.equal(overlayState("working"), "working");
  assert.equal(overlayState("turn"), "turn");
  assert.equal(overlayState("sleeping"), "sleep");
  assert.equal(overlayState("unread"), null);
  assert.equal(overlayState("other"), null);
});

const demoItems = (now = NOW) => {
  const sessions = demoSessions(now);
  return buildSessions({ sessions, read: new Set(demoRead(sessions)), now });
};
const planAt = (width, height = 320, items = demoItems()) => {
  const frame = sceneFrame(width, height);
  return { frame, ...placeSessions(items, frame) };
};

test("the block fits the 3112×320 canvas by its taller axis and crops the middle", () => {
  for (const width of [1176, 1192, 3112, 4000]) {
    const frame = sceneFrame(width, SCENE_H);
    const k = Math.max(SCENE_H / 320, width / 3112);
    assert.ok(close(frame.k, k), `${width}: k ${frame.k} vs ${k}`);
    assert.ok(close(frame.left, (width - 3112 * k) / 2), `${width}: left ${frame.left}`);
    assert.ok(close(frame.top, SCENE_H - 320 * k), `${width}: top ${frame.top}`);
    const vx0 = -frame.left / frame.k;
    assert.ok(close(frame.vx0, vx0), `${width}: vx0 ${frame.vx0}`);
    assert.ok(close(frame.vx1, vx0 + width / k), `${width}: vx1 ${frame.vx1}`);
  }
  const wide = sceneFrame(3112, SCENE_H);
  [wide.k, wide.left, wide.top, wide.vx0, wide.vx1].forEach((v, i) => assert.ok(close(v, [1, 0, 0, 0, 3112][i]), `3112: value ${i}`));
  const narrow = sceneFrame(1192, SCENE_H);
  assert.deepEqual([narrow.k, narrow.left, narrow.top, narrow.vx0, narrow.vx1], [1, -960, 0, 960, 2152]);
  // A block taller than the canvas's aspect scales up and hides the top and foot.
  const tall = sceneFrame(1000, 400);
  assert.ok(close(tall.k, 400 / 320));
  assert.ok(close(tall.top, 400 - 320 * (400 / 320)));
});

test("session i takes fill_order[i] and carries number i+1", () => {
  const { seats } = planAt(3112);
  assert.equal(seats.length, 8);
  assert.deepEqual(seats.map((seat) => seat.house.id), [7, 6, 8, 5, 9, 4, 10, 3]);
  assert.deepEqual(seats.map((seat) => seat.number), [1, 2, 3, 4, 5, 6, 7, 8]);
  for (let i = 0; i < seats.length; i += 1) assert.equal(seats[i].house.id, SLOTS.fill_order[i]);
});

test("+N counts the seats off the visible strip and the sessions past the twelfth", () => {
  const narrow = planAt(1192);
  assert.equal(narrow.plus, 2);
  assert.deepEqual(narrow.seats.filter((seat) => !seat.visible).map((seat) => seat.house.id), [10, 3],
    "houses 10 and 3 sit outside the middle strip");
  assert.equal(narrow.offscreen, 2);
  assert.equal(narrow.beyond, 0);

  const full = planAt(3112);
  assert.equal(full.plus, 0, "the whole canvas is visible at 3112");
  assert.equal(full.offscreen, 0);

  const many = Array.from({ length: 14 }, (_, i) => ({ id: `m${i}`, name: `M ${i}`, display: "other" }));
  const crowded = planAt(3112, 320, many);
  assert.equal(crowded.seats.length, 12, "only twelve houses exist");
  assert.equal(crowded.beyond, 2);
  assert.equal(crowded.plus, 2);
});

test("a seat off the visible strip draws no plate or name, and keeps its words silent", () => {
  const { seats } = planAt(1176);
  const hidden = seats.filter((seat) => !seat.visible);
  assert.deepEqual(hidden.map((seat) => seat.house.id), [10, 3]);
  const { nodes } = render({ width: 1176, seats });
  for (const seat of hidden) {
    assert.equal(nodes.has(`paper-plate-${seat.id}`), false, `${seat.id} draws no number plate`);
    assert.equal(nodes.has(`paper-name-${seat.id}`), false, `${seat.id} draws no name`);
    assert.equal(nodes.has(`paper-name-chip-${seat.id}`), false, `${seat.id} draws no name chip`);
    assert.equal(callOf(nodes.get(`paper-bubble-h${seat.house.id}`), "opacity"), 0, `${seat.id}'s bubble is silent`);
    assert.equal(callOf(nodes.get(`paper-zzz-h${seat.house.id}`), "opacity"), 0, `${seat.id}'s z's are silent`);
  }
  for (const seat of seats.filter((s) => s.visible)) {
    assert.ok(nodes.get(`paper-plate-${seat.id}`), `${seat.id} keeps its plate`);
    assert.ok(nodes.get(`paper-name-${seat.id}`), `${seat.id} keeps its name`);
  }

  // A turn and a sleeping seat off the strip stay silent too; on the full canvas the same words show.
  const items = demoItems().map((item, i) => (i === 6 ? { ...item, display: "turn" } : i === 7 ? { ...item, display: "sleeping" } : item));
  const narrow = planAt(1176, 320, items);
  const narrowNodes = render({ width: 1176, seats: narrow.seats }).nodes;
  assert.equal(callOf(narrowNodes.get("paper-bubble-h10"), "opacity"), 0, "an off-strip turn shows no bubble");
  assert.equal(callOf(narrowNodes.get("paper-zzz-h3"), "opacity"), 0, "an off-strip sleep shows no z's");
  const full = planAt(3112, 320, items);
  const fullNodes = render({ width: 3112, seats: full.seats }).nodes;
  assert.equal(callOf(fullNodes.get("paper-bubble-h10"), "opacity"), 1, "the visible seat keeps its bubble");
  assert.equal(callOf(fullNodes.get("paper-zzz-h3"), "opacity"), 1, "the visible seat keeps its z's");
});

test("a name chip is placed by its own width, not by the wide label box", () => {
  const wide = planAt(3112);
  const ninth = wide.seats.find((seat) => seat.house.id === 9);
  const { nodes, sizes } = render({ width: 3112, seats: wide.seats });
  const boxCenter = (id) => callOf(nodes.get(id), "left") + sizes.get(id).w / 2;
  const target = wide.frame.left + ninth.house.name_label.x * wide.frame.k;
  assert.ok(Math.abs(boxCenter(`paper-name-${ninth.id}`) - target) < 4,
    `house 9's chip sits under its house at ${target}, not pushed in by the wide box`);

  const longName = "a long session name that runs past the block's end";
  const items = demoItems().map((item, i) => (i === 4 ? { ...item, name: longName } : item));
  const narrow = planAt(1192, 320, items);
  const seat = narrow.seats.find((s) => s.house.id === 9);
  const narrowNodes = render({ width: 1192, seats: narrow.seats });
  const id = `paper-name-${seat.id}`;
  const center = callOf(narrowNodes.nodes.get(id), "left") + narrowNodes.sizes.get(id).w / 2;
  const chipW = textWidth(clipText(longName, LABEL_MAX_W, LABEL_SIZE), LABEL_SIZE) + 2 * LABEL_PAD_X;
  assert.ok(center - chipW / 2 >= EDGE - 1e-6, "the chip's left edge stays inside the block");
  assert.ok(center + chipW / 2 <= 1192 - EDGE + 1e-6, "and its right edge too");
});

test("every house carries all three state slices, and only a seated house's own is opaque", () => {
  const { seats } = planAt(3112);
  const { nodes } = render({ width: 3112, seats });
  const byHouse = new Map(seats.map((seat) => [seat.house.id, seat]));
  for (const house of SLOTS.houses) {
    const seat = byHouse.get(house.id);
    const shown = overlayState(seat?.display);
    for (const state of ["working", "turn", "sleep"]) {
      const id = `paper-state-${house.id}-${state}`;
      const node = nodes.get(id);
      const record = OVERLAYS[state].light[house.id];
      assert.ok(node && record, `${id} is drawn`);
      assert.equal(node.src, SRC + record.file, `${id} is the house's own slice`);
      assert.equal(callOf(node, "opacity"), shown === state ? 1 : 0, `${id} opacity`);
      assert.equal(transitionOf(node).duration, FADE_MS, `${id} fades`);
    }
    assert.equal(callOf(nodes.get(`paper-smoke-h${house.id}`), "opacity"), seat?.display === "working" ? 1 : 0, `smoke of house ${house.id}`);
    assert.equal(callOf(nodes.get(`paper-gift-h${house.id}`), "opacity"), seat?.display === "unread" ? 1 : 0, `gift of house ${house.id}`);
    assert.equal(callOf(nodes.get(`paper-bubble-h${house.id}`), "opacity"), seat?.display === "turn" ? 1 : 0, `bubble of house ${house.id}`);
    assert.equal(callOf(nodes.get(`paper-zzz-h${house.id}`), "opacity"), seat?.display === "sleeping" ? 1 : 0, `z's of house ${house.id}`);
  }
  const unread = seats.find((seat) => seat.display === "unread");
  assert.equal(callOf(nodes.get(`paper-bubble-h${unread.house.id}`), "opacity"), 0, "an unread result has no bubble");
  assert.equal(callOf(nodes.get(`paper-zzz-h${unread.house.id}`), "opacity"), 0, "nor z's");
  const other = seats.find((seat) => seat.display === "other");
  for (const id of ["paper-smoke", "paper-gift", "paper-bubble", "paper-zzz"]) {
    assert.equal(callOf(nodes.get(`${id}-h${other.house.id}`), "opacity"), 0, `the plain picture draws no ${id}`);
  }
  for (const house of SLOTS.houses.filter((h) => !byHouse.has(h.id))) {
    for (const id of ["paper-smoke", "paper-gift", "paper-bubble", "paper-zzz"]) {
      assert.equal(callOf(nodes.get(`${id}-h${house.id}`), "opacity"), 0, `the empty house ${house.id} draws no ${id}`);
    }
  }
  // Only a seated house gets the clicks and the words, so those ids stay keyed by session.
  for (const prefix of ["paper-visit-", "paper-plate-", "paper-name-"]) {
    const own = [...nodes.keys()].filter((id) => id.startsWith(prefix) && !/^paper-(plate|name)-(text|chip)-/.test(id));
    assert.equal(own.length, seats.length, `${prefix}* has one node per seat`);
  }
});

test("the working smoke and the walkers flicker with native opacity loops", () => {
  const { seats } = planAt(3112);
  const { nodes } = render({ width: 3112, seats });
  const working = seats.find((seat) => seat.display === "working");
  const smoke = nodes.get(`paper-smoke-h${working.house.id}`);
  assert.equal(smoke.kids.length, 2);
  const periods = smoke.kids.map((kid) => loopOf(kid, "opacity").period);
  assert.deepEqual(periods, [SMOKE_MS, SMOKE_MS], "the two puffs alternate");
  assert.deepEqual(smoke.kids.map((kid) => [loopOf(kid, "opacity").from, loopOf(kid, "opacity").to]),
    [[50, -49], [-49, 50]], "the puffs switch instead of cross-fading");

  for (const id of ["paper-walker-a-right", "paper-walker-a-left", "paper-walker-b-right", "paper-walker-b-left"]) {
    const group = nodes.get(id);
    assert.equal(group.kids.length, 2, `${id} has two steps`);
    assert.deepEqual(group.kids.map((kid) => [loopOf(kid, "opacity").from, loopOf(kid, "opacity").to]),
      [[50, -49], [-49, 50]], `${id} switches between its two steps`);
    for (const kid of group.kids) {
      assert.equal(loopOf(kid, "opacity").period, STEP_MS, `${id} steps every ${STEP_MS} ms`);
      assert.equal(kid.calls.filter(([key, prop]) => key === "loop" && prop !== "opacity").length, 0, "only opacity moves");
    }
  }
});

test("the first frame shows A as walker_right_1 and B as walker_left_2", () => {
  const { seats } = planAt(1192);
  const { nodes } = render({ width: 1192, seats });
  const shownFrame = (group) => group.kids.find((kid) => loopOf(kid, "opacity").from === 50)?.src;
  assert.equal(shownFrame(nodes.get("paper-walker-a-right")), `${SRC}walker_right_1_light.png`);
  assert.equal(shownFrame(nodes.get("paper-walker-b-left")), `${SRC}walker_left_2_light.png`);
  assert.equal(callOf(nodes.get("paper-walker-a-right"), "opacity"), 1);
  assert.equal(callOf(nodes.get("paper-walker-a-left"), "opacity"), 0);
  assert.equal(callOf(nodes.get("paper-walker-b-left"), "opacity"), 1);
  assert.equal(callOf(nodes.get("paper-walker-b-right"), "opacity"), 0);
});

test("a walker crosses the lane in one linear transition and turns at its ends", () => {
  const { seats } = planAt(1192);
  const first = render({ width: 1192, seats }).nodes;
  const away = render({ width: 1192, seats, walkStep: 1 }).nodes;
  const back = render({ width: 1192, seats, walkStep: 2 }).nodes;
  const leftOf = (nodes, id) => callOf(nodes.get(id), "left");
  const delta = (a, b, id) => leftOf(b, id) - leftOf(a, id);
  const a = walkerId("a", 1192);
  const b = walkerId("b", 1192);
  for (const id of [a, b]) {
    assert.equal(transitionOf(first.get(id)).duration, WALK_MS);
    assert.equal(transitionOf(first.get(id)).easing, "linear");
  }
  assert.ok(Math.abs(delta(first, away, a) - 230) < 0.02, "A walks 230 px to the right end");
  assert.ok(Math.abs(delta(first, away, b) + 220) < 0.02, "B walks 220 px to the left end");
  assert.ok(Math.abs(delta(away, back, a) + 270) < 0.02, "then A crosses the 270 px lane back");
  assert.ok(Math.abs(delta(away, back, b) - 270) < 0.02, "and B crosses it the other way");
  assert.equal(callOf(away.get("paper-walker-a-left"), "opacity"), 1, "A faces left at the right end");
  assert.equal(callOf(away.get("paper-walker-b-right"), "opacity"), 1, "B faces right at the left end");
});

// The walkers' four sprites as one anchored box, the same union scene.js builds.
const walkerUnion = (k) => {
  const boxes = ["left", "right"].flatMap((side) => [1, 2].map((n) => {
    const sprite = SLOTS.sprites[`walker_${side}_${n}`].light;
    const [w, h] = sprite.size_logical;
    const [ax, ay] = sprite.anchor_logical;
    return { w: w * k, h: h * k, ax: ax * k, ay: ay * k };
  }));
  const left = Math.min(...boxes.map((b) => -b.ax));
  const top = Math.min(...boxes.map((b) => -b.ay));
  const right = Math.max(...boxes.map((b) => b.w - b.ax));
  const bottom = Math.max(...boxes.map((b) => b.h - b.ay));
  return { left, top, w: right - left, h: bottom - top };
};

test("a walker keeps its left across a crop, and a new scale redraws it instead of sliding it", () => {
  const narrow = render({ width: 1176, seats: planAt(1176).seats });
  const wide = render({ width: 3096, seats: planAt(3096).seats });
  const short = render({ width: 1176, height: 240, seats: planAt(1176, 240).seats });
  const poses = { a: 40, b: SLOTS.walker_lane.x[1] - 50 - SLOTS.walker_lane.x[0] };
  for (const id of ["a", "b"]) {
    // Width alone leaves k at 1, so the id and the own left both hold.
    const same = walkerId(id, 1176);
    assert.equal(walkerId(id, 3096), same, `${id} keeps its id while only the width changes`);
    assert.equal(callOf(narrow.nodes.get(same), "left"), callOf(wide.nodes.get(same), "left"),
      `${id} keeps its own left, so a wider crop never drags it across the lane`);
    // A shorter block lowers k: the new id draws the walker at its pose at once, so changing the
    // scale never runs the WALK_MS left transition.
    const scaled = walkerId(id, 1176, 240);
    assert.notEqual(scaled, same, `${id}'s id carries the scale`);
    assert.equal(callOf(short.nodes.get(scaled), "left"), round2(poses[id] * 0.75),
      `${id} lands on its pose at k 0.75`);
  }
  assert.notEqual(callOf(narrow.nodes.get("paper-walkers"), "left"), callOf(wide.nodes.get("paper-walkers"), "left"),
    "the lane box is what follows the crop");
});

test("a walker's feet land on its pose's scene x through the lane box", () => {
  const lane = SLOTS.walker_lane;
  const poses = { a: lane.x[0] + 40, b: lane.x[1] - 50 };
  for (const width of [1176, 3096]) {
    const { frame, seats } = planAt(width);
    const { nodes } = render({ width, seats });
    const box = walkerUnion(frame.k);
    const boxLeft = callOf(nodes.get("paper-walkers"), "left");
    for (const id of ["a", "b"]) {
      // The anchor sits -box.left into the sprite box's own left edge.
      const foot = boxLeft + callOf(nodes.get(walkerId(id, width)), "left") - box.left;
      assert.ok(Math.abs(foot - (frame.left + poses[id] * frame.k)) < 0.02,
        `${width}: walker ${id} stands at scene x ${poses[id]}`);
    }
  }
});

test("the door plate, name chips, bubble, z's and +N carry the approved sizes and inks", () => {
  const { seats, plus } = planAt(1192);
  for (const mode of ["light", "dark"]) {
    const { nodes, sizes } = render({ width: 1192, seats, plus, mode });
    for (const seat of seats.filter((s) => s.visible)) {
      const plate = nodes.get(`paper-plate-${seat.id}`);
      assert.equal(sizes.get(`paper-plate-${seat.id}`).h, round2(plateSize(seat.house)), "the plate row is the digit's line");
      assert.equal(plate.texts.length, 0);
      const digit = nodes.get(`paper-plate-text-${seat.id}`);
      assert.deepEqual(digit.texts, [String(seat.number)]);
      assert.equal(digit.ink, PLATE_INK, `${mode}: door numbers stay dark ink`);

      const chip = nodes.get(`paper-name-chip-${seat.id}`);
      assert.equal(chip.ink, LABEL_COLORS[mode].ink, `${mode}: name ink`);
      assert.equal(chip.bg, LABEL_COLORS[mode].bg, `${mode}: name band`);
      assert.equal(chip.texts.length, 1);

      const bubble = nodes.get(`paper-bubble-text-h${seat.house.id}`);
      assert.equal(bubble.ink, BUBBLE_INK);
      assert.equal(bubble.bg, BUBBLE_BG);
      assert.deepEqual(bubble.texts, ["Your turn"]);

      const zzz = nodes.get(`paper-zzz-text-h${seat.house.id}`);
      assert.equal(zzz.ink, ZZZ_COLORS[mode]);
      assert.deepEqual(zzz.texts, ["zzz"]);
    }
    const plusChip = nodes.get("paper-plus-chip");
    assert.deepEqual(plusChip.texts, ["+2"]);
    assert.equal(plusChip.ink, PLUS_COLORS[mode].ink);
    assert.equal(plusChip.bg, PLUS_COLORS[mode].bg);
  }
});

test("the bubble says Your turn whether or not the scene is demo", () => {
  const { seats } = planAt(3112);
  const turn = seats.find((seat) => seat.display === "turn");
  for (const demo of [false, true]) {
    const nodes = render({ width: 3112, seats, demo }).nodes;
    assert.deepEqual(nodes.get(`paper-bubble-text-h${turn.house.id}`).texts, ["Your turn"], `demo ${demo}`);
  }

  // The right-edge correction is the line actually drawn.
  const narrow = render({ width: 1192, seats: planAt(1192).seats }).nodes;
  const rightEdge = round2(1192 - EDGE - (textWidth("Your turn", BUBBLE_SIZE) + 2 * BUBBLE_PAD_X));
  assert.equal(callOf(narrow.get("paper-bubble-h12"), "left"), rightEdge);
});

test("the name chip takes the system UI face and every other word a plain sans", () => {
  assert.equal(LABEL_FONT, ".SystemUIFont");
  assert.equal(TEXT_FONT, "Helvetica");

  globalThis.uiMethods = new Set();
  try {
    sceneLayers({ width: 3112, height: SCENE_H, mode: "light", seats: planAt(3112).seats, plus: 0, walkStep: 0, visit() {} });
    assert.ok(globalThis.uiMethods.has("font_family"), "the render asks gpui for a font");
  } finally {
    delete globalThis.uiMethods;
  }

  // The stub keeps only method names, so the chain each text element is built with is read from the source.
  const source = readFileSync(new URL("../mods/x-mas-paper-scene/scene.js", import.meta.url), "utf8");
  const chainOf = (marker) => {
    const at = source.indexOf(marker);
    assert.ok(at >= 0, `${marker} is in scene.js`);
    return source.slice(at, source.indexOf(".child(", at));
  };
  assert.match(chainOf("paper-name-chip-"), /\.font_family\(LABEL_FONT\)/, "the name chip names the system UI font");
  assert.match(chainOf("paper-plate-text-"), /\.font_family\(LABEL_FONT\)/, "the door number inherits the body face");
  for (const marker of ["paper-bubble-text-h", "paper-zzz-text-h", "paper-plus-chip"]) {
    assert.match(chainOf(marker), /\.font_family\(TEXT_FONT\)/, `${marker} names the plain sans`);
  }
});

test("a name chip's foot touches the band's bottom edge", () => {
  const { seats } = planAt(1176);
  const notes = seats.find((seat) => seat.house.id === 7);
  assert.equal(notes.name, "notes");
  const { nodes } = render({ width: 1176, seats });
  assert.equal(callOf(nodes.get(`paper-name-${notes.id}`), "top"), 303,
    "the chip below the band sits on its bottom edge, not 4 px above it");
});

test("the z's sit one px lower than the bubble's line top", () => {
  const { seats } = planAt(3112);
  const { nodes } = render({ width: 3112, seats });
  for (const house of SLOTS.houses) {
    const expected = round2(house.bubble.y - ZZZ_SIZE + 1);
    assert.equal(callOf(nodes.get(`paper-zzz-h${house.id}`), "top"), expected, `house ${house.id} z's at ${expected}`);
  }
});

test("a plate's digit size is 62% of its height, never over 13", () => {
  for (const house of SLOTS.houses) {
    assert.equal(plateSize(house), Math.min(house.door_plate.max_height * 0.62, 13));
    assert.ok(plateSize(house) <= 13);
  }
});

test("the door number is drawn at weight 600", () => {
  assert.equal(PLATE_WEIGHT, 600);
  const source = readFileSync(new URL("../mods/x-mas-paper-scene/scene.js", import.meta.url), "utf8");
  const at = source.indexOf("paper-plate-text-");
  assert.ok(at >= 0, "the plate text element is in scene.js");
  assert.match(source.slice(at, source.indexOf(".child(", at)), /\.font_weight\(PLATE_WEIGHT\)/, "the digits carry PLATE_WEIGHT");
});

test("the door number sits 0.14 em above the plate's centre line", () => {
  const { frame, seats } = planAt(1176);
  const { nodes } = render({ width: 1176, seats });
  for (const seat of seats.filter((s2) => s2.visible)) {
    const size = plateSize(seat.house) * frame.k;
    const expected = round2(frame.top + seat.house.door_plate.y * frame.k - size / 2 - 0.14 * size);
    assert.equal(callOf(nodes.get(`paper-plate-${seat.id}`), "top"), expected, `${seat.id} plate top`);
  }
});

test("every overlay and sprite the scene names is in art/, and each house has three states", () => {
  const files = new Set(readdirSync(ART));
  for (const mode of ["light", "dark"]) {
    assert.ok(files.has(`scene_${mode}.png`), `scene_${mode}.png is in art/`);
    for (const state of ["working", "turn", "sleep"]) {
      for (const house of SLOTS.houses) {
        const record = OVERLAYS[state][mode][house.id];
        assert.ok(record, `${mode} ${state} house ${house.id} is recorded`);
        assert.ok(files.has(record.file), `${record.file} is in art/`);
        assert.equal(record.x, house.slot_x[0]);
        assert.equal(record.x + record.w, house.slot_x[1]);
        assert.ok(record.w > 0 && record.h > 0, `${record.file} has a real rectangle`);
      }
    }
    for (const name of ["smoke_1", "smoke_2", "gift", "walker_left_1", "walker_left_2", "walker_right_1", "walker_right_2"]) {
      assert.ok(files.has(SLOTS.sprites[name][mode].file), `${name} ${mode} is in art/`);
    }
  }
  assert.equal([...files].filter((name) => name.startsWith("state_")).length, 72, "twelve houses, three states, two modes");
});

test("a click on a seated house's doorway visits its session", () => {
  const { seats } = planAt(3112);
  const visited = [];
  const { handlers, sizes } = render({ width: 3112, seats, visit: (seat) => visited.push(seat) });
  for (const seat of seats) {
    const id = `paper-visit-${seat.id}`;
    const spot = sizes.get(id);
    assert.ok(spot, `${id} has a click area`);
    assert.ok(spot.w > 0 && spot.h > 0, `${id} covers the house`);
    handlers.get(id).on_click();
  }
  assert.deepEqual(visited.map((seat) => seat.id), seats.map((seat) => seat.id));
});

test("places and the three shared keys the rail and tab bar read are still there", () => {
  const places = placesOf([
    { terminal: "t1", place: { key: "SNOW-24", rest: "snow" }, topic: "Snow API" },
    { terminal: null, place: { key: "X-1", rest: "x" }, topic: null },
  ]);
  assert.deepEqual(places, { t1: { key: "SNOW-24", rest: "snow", topic: "Snow API", slack: false } });
  const main = readFileSync(new URL("../mods/x-mas-paper-scene/main.js", import.meta.url), "utf8");
  for (const key of ["x-mas-paper-scene", "x-mas-paper-scene.notice", "x-mas-paper-scene.notice-act"]) {
    assert.ok(main.includes(`"${key}"`), `main.js still uses ${key}`);
  }
  assert.match(main, /pane\.focus/, "a click still focuses the session's pane");
  assert.match(main, /localStorage/, "the read marks are still kept");
});

test("the demo seats eight invented sessions in the picture's order and states", () => {
  const items = demoItems();
  assert.deepEqual(items.map((item) => item.name), ["notes", "web-app", "api", "docs", "design", "deploy", "chat", "scratch"]);
  assert.deepEqual(items.map((item) => item.display), ["turn", "working", "unread", "sleeping", "working", "other", "working", "sleeping"]);
  assert.ok(demoRead(demoSessions(NOW)).length > 0, "some finished sessions have been looked at");
  for (const item of items) assert.doesNotMatch(item.name, /[가-힣]|\d{2,}/, `${item.name} stays English with no ticket`);
});

test("a one-line name is cut at a Korean word, never inside one", () => {
  const line = "눈사람이 크리스마스 선물을 포장하고 있습니다";
  const cut = clipText(line, 120, 11);
  assert.ok(cut.endsWith("…"));
  const kept = cut.slice(0, -1);
  assert.ok(line.startsWith(kept), "the kept text is the original's start");
  assert.equal(line[kept.length], " ", "the cut landed on a space");
  assert.equal(clipText("short line", 120, 11), "short line");
  assert.equal(clipText("  ", 120, 11), "");
});

// The scene's nodes as the stub records them. The colours are scene.js's own tables.
const round2 = (n) => Math.round(n * 100) / 100;
// The walker wrap's id carries k in thousandths, so a new scale is a new element.
const walkerId = (id, width, height = SCENE_H) =>
  `paper-walker-${id}-${Math.round(sceneFrame(width, height).k * 1000)}`;
const callOf = (node, name) => node.calls.find(([key]) => key === name)?.[1];
const loopOf = (node, name) => node.calls.find(([key, prop]) => key === "loop" && prop === name)?.[2];
const transitionOf = (node) => node.calls.find(([key]) => key === "transition")?.[2];
function render({ width, height = SCENE_H, mode = "light", seats, plus = 0, walkStep = 0, demo = false, visit = () => {} }) {
  globalThis.uiNodes = new Map();
  globalThis.uiSizes = new Map();
  globalThis.uiHandlers = new Map();
  try {
    sceneLayers({ width, height, mode, seats, plus, walkStep, demo, visit });
    return {
      nodes: new Map(globalThis.uiNodes),
      sizes: new Map(globalThis.uiSizes),
      handlers: new Map(globalThis.uiHandlers),
    };
  } finally {
    delete globalThis.uiNodes;
    delete globalThis.uiSizes;
    delete globalThis.uiHandlers;
  }
}
