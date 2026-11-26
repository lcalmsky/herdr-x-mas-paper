// Tests for the x-mas paper scene's model: the five pictures a session can show, the seats on the
// two hills, the one-line signs and the demo sessions. Run:
// node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DISPLAY_STATES, HOUSES, PROPS, SLEEP_MS, displayState, stateOf, placeSessions, clipText, buildSessions,
  layoutBubbles,
} from "../mods/x-mas-paper-scene/model.js";
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

test("seats fill the front hill, then a smaller back row, then +N at both ends", () => {
  const W = 1200;
  const cases = [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [2, 2, 0, 0],
    [9, 8, 1, 0],
    [30, 8, 8, 2],
  ];
  for (const [count, front, back, plus] of cases) {
    const list = Array.from({ length: count }, (_, i) => ({ id: `s-${i}` }));
    const placed = placeSessions(list, W);
    assert.equal(placed.units.filter((u) => u.row === "front").length, front, `${count} sessions: front row`);
    assert.equal(placed.units.filter((u) => u.row === "back").length, back, `${count} sessions: back row`);
    assert.equal(placed.overflow.length, plus, `${count} sessions: +N marks`);
    assert.equal(placed.hidden, count - front - back, `${count} sessions: hidden count`);
    for (const unit of placed.units) assert.ok(unit.x > 0 && unit.x < W, `${count} sessions: seat ${unit.x} inside`);
    for (const mark of placed.overflow) {
      assert.ok(mark.x > 0 && mark.x < W, `${count} sessions: +N at ${mark.x} inside`);
      assert.equal(mark.text, `+${count - front - back}`);
    }
  }
  // The nearest right-hand seat, and its mirror, come first.
  assert.deepEqual(placeSessions([{ id: "a" }, { id: "b" }], W).units.map((u) => u.x), [730, 470]);
  assert.deepEqual(placeSessions([{ id: "a" }], W).units.map((u) => u.number), [1]);
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
  }
  assert.ok(files.has("bg_light.webp") && files.has("bg_dark.webp"), "both backgrounds are in art/");
});
