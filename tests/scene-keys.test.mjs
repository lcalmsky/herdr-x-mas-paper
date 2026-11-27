// Tests for the scene band's keyboard: taking and giving the keyboard, choosing and visiting
// houses, Space / ⇧Space jumps, the typed search, reading and undoing, Esc's steps, the terminal
// visit history, and what the band draws while it holds the keys. Every key goes through press()
// or key(), so the tests drive the same path a person's key and the preview command do.
// Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import PaperScene from "../mods/x-mas-paper-scene/main.js";
import {
  SCENE_H, LABEL_COLORS, PLUS_COLORS, KEYS_LINE, LEGEND_LINE, ACCENT_COLORS,
} from "../mods/x-mas-paper-scene/model.js";
import {
  stepSeat, waitTargets, cycle, searchSeat, eraseWord, visitHistory, stepHistory, pressSpec, keySeats,
} from "../mods/x-mas-paper-scene/keys.js";
import { typeJamo } from "../mods/x-mas-paper-scene/hangul.js";

const NOW = Date.now();
const MIN = 60 * 1000;

// A live scene: scan records, their terminals and panes, and a keyboard handle. props { demo: true }
// makes the demo copy instead. The store stands in for localStorage so read marks can be counted.
function sceneOf(rows, { props = {}, width = 1192, demo = false } = {}) {
  const sessions = [];
  const terms = [];
  const paneList = [];
  if (!demo) {
    for (const row of rows) {
      const { id, status = "busy", waitingFor = null, at = NOW - 60 * MIN, handoff = `House ${id}` } = row;
      sessions.push({
        t: "s", pid: null, sessionId: id, cwd: `/w/${id}`, status, waitingFor,
        startedAt: NOW - 120 * MIN, statusUpdatedAt: at, lastMeaningfulAt: at,
        identity: { handoff }, where: { terminalId: `t-${id}` },
      });
      terms.push({ address: `t-${id}`, state: "live", cwd: `/w/${id}`, foreground: { pid: null, cwd: `/w/${id}` } });
      paneList.push({ pane: `p-${id}`, terminal: `t-${id}`, focused: false });
    }
  }
  globalThis.herdrState = { props, agents: [], terminals: terms, panes: paneList, shared: {} };
  const runs = [];
  // A pane that takes focus takes the keyboard with it: the real app moves the focus handle.
  Object.defineProperty(runs, "push", {
    value: (...entries) => {
      if (entries.some(([command]) => command === "pane.focus" || command === "pane.go")) handle.focused = false;
      return Array.prototype.push.apply(runs, entries);
    },
    enumerable: false,
  });
  globalThis.herdrRuns = runs;
  const store = new Map();
  const writes = [];
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)); writes.push(key); },
  };
  const handle = {
    focused: false,
    focus() { this.focused = true; },
    is_focused() { return this.focused; },
  };
  const timers = [];
  const cx = {
    notify() {}, stop_propagation() {},
    timer: { after(ms, fn) { timers.push({ ms, fn }); }, every() {} },
    spawn() {},
    focus_handle: () => handle,
  };
  const view = new PaperScene();
  view.init(undefined, cx);
  view.cx = cx;
  if (!demo) {
    view.sessions = sessions;
    view.width = width;
    view.height = SCENE_H;
    view.refresh(NOW);
  }
  return { view, cx, handle, timers, writes, store };
}

const press = (view, key, extra = {}) => view.press({ key, ...extra }, view.cx);
const runList = () => globalThis.herdrRuns ?? [];
const visibleIds = (view) => keySeats(view.plan().seats).map((seat) => seat.id);
const select = (view, id) => { view.sel = id; };
const selectable = (view, id) => view.plan().seats.find((seat) => seat.id === id);

test("the keys module walks only the visible houses, in door-number order", () => {
  const rows = "abcdefgh".split("").map((id) => ({ id }));
  const { view, cx } = sceneOf(rows);
  assert.deepEqual(visibleIds(view), ["a", "b", "c", "d", "e", "f"], "houses 10 and 3 are off the strip");
  assert.equal(stepSeat(view.plan().seats, null, -1), "f", "← with no selection starts at the last house");
  assert.equal(stepSeat(view.plan().seats, null, 1), "a", "→ starts at the first");
  assert.equal(stepSeat(view.plan().seats, "f", 1), "a", "the end wraps to the first");
  assert.equal(stepSeat(view.plan().seats, "a", -1), "f", "the first wraps to the end");
  assert.equal(stepSeat(view.plan().seats, "c", "first"), "a");
  assert.equal(stepSeat(view.plan().seats, "c", "last"), "f");
  assert.equal(stepSeat([], null, 1), null, "an empty strip has nothing to select");
});

test("←→ cycles and ⌥←/⌥→ take the ends, skipping the off-strip houses", () => {
  const rows = "abcdefgh".split("").map((id) => ({ id }));
  const { view, cx } = sceneOf(rows);
  press(view, "right");
  assert.equal(view.sel, "a");
  press(view, "right");
  assert.equal(view.sel, "b");
  press(view, "left");
  assert.equal(view.sel, "a");
  press(view, "left");
  assert.equal(view.sel, "f", "the last visible house, never g or h");
  press(view, "right");
  assert.equal(view.sel, "a");
  press(view, "right", { alt: true });
  assert.equal(view.sel, "f");
  press(view, "left", { alt: true });
  assert.equal(view.sel, "a");
});

test("↩ visits the selected session's pane and gives the keyboard back", () => {
  const { view, cx } = sceneOf("abc".split("").map((id) => ({ id })));
  view.grabKeys(cx);
  press(view, "right");
  press(view, "right");
  press(view, "enter");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-b" }]);
  assert.equal(view.keysHeld, false, "the keyboard goes with the visit");
});

test("ctrl+opt+p takes the keyboard and hands it back to the pane it came from", () => {
  const { view, cx, handle } = sceneOf([{ id: "a" }]);
  globalThis.herdrState.panes[0].focused = true;
  view.command("toggle", cx);
  assert.equal(view.keysHeld, true);
  assert.equal(handle.focused, true, "the scene's handle takes the keyboard");
  view.command("toggle", cx);
  assert.equal(view.keysHeld, false);
  assert.deepEqual(runList(), [["pane.focus", { pane: "p-a" }]]);

  globalThis.herdrState.panes = [];
  view.command("toggle", cx);
  view.press({ key: "p", ctrl: true, alt: true }, cx);
  assert.deepEqual(runList().at(-1), ["pane.go", { direction: "down" }],
    "a remembered pane that is gone leaves the keyboard to the pane below");
});

test("a second grab keeps the pane the first one came from", () => {
  const { view, cx } = sceneOf([{ id: "a" }, { id: "b" }]);
  globalThis.herdrState.panes[0].focused = true;
  view.grabKeys(cx);
  globalThis.herdrState.panes[0].focused = false;
  globalThis.herdrState.panes[1].focused = true;
  view.grabKeys(cx);
  view.leaveKeys(cx);
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-a" }],
    "the second grab is a no-op, so the keyboard goes back where it came from");
});

test("↩ on a session with no terminal lets the keyboard go", () => {
  const { view, cx, handle } = sceneOf([{ id: "a" }]);
  globalThis.herdrState.terminals = [];
  globalThis.herdrState.panes = [{ pane: "p-back", terminal: "t-other", focused: true }];
  view.refresh(NOW);
  view.grabKeys(cx);
  press(view, "right");
  assert.equal(selectable(view, "a").terminal, null, "the session has no live terminal");
  press(view, "enter");
  assert.equal(view.keysHeld, false);
  assert.equal(handle.focused, false, "the handle lets the keyboard go");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-back" }], "back to the pane it came from");
  view.key({ key: "x", key_char: "x" }, cx);
  assert.equal(view.query, "", "a key that reaches the scene anyway does not start a search");
});

test("losing the keyboard clears the search, so the next grab starts empty", () => {
  const rows = [{ id: "a", status: "waiting", waitingFor: "reply" }, { id: "b" }];
  const { view, cx, handle } = sceneOf(rows);
  globalThis.herdrState.panes[0].focused = true;
  view.command("toggle", cx);
  for (const key of "ab") press(view, key);
  assert.equal(view.query, "ab");
  handle.focused = false;
  view.watchFocus(cx);
  assert.equal(view.keysHeld, false);
  assert.equal(view.query, "", "the lost keyboard takes the search with it");
  assert.equal(view.sel, null, "and the selection");
  view.command("toggle", cx);
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-a" }], "Space jumps again instead of typing");
});

test("a command that throws does not stop the command loop", async () => {
  const { view, cx } = sceneOf([{ id: "a" }]);
  const seen = [];
  view.command = (command) => {
    seen.push(command);
    if (command === "boom") throw new Error("boom");
  };
  globalThis.herdrCommands = ["boom", "after"];
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args);
  let notified = 0;
  cx.spawn = (fn) => { fn({ notify() { notified += 1; } }).catch(() => {}); };
  try {
    view.startCommands(cx);
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    console.error = originalError;
    delete globalThis.herdrCommands;
  }
  assert.deepEqual(seen, ["boom", "after"], "the loop takes the next command after the throw");
  assert.equal(errors.length, 1, "the error is logged once");
  assert.equal(notified, 2, "each turn still asks for a repaint");
});

test("Space visits the waiters oldest first and cycles, off-strip sessions included", () => {
  const rows = [
    { id: "a", status: "waiting", waitingFor: "reply", at: NOW - 30 * MIN },
    { id: "b", status: "waiting", waitingFor: "reply", at: NOW - 90 * MIN },
    { id: "c" }, { id: "d" }, { id: "e" }, { id: "f" },
    { id: "g", status: "waiting", waitingFor: "reply", at: NOW - 120 * MIN },
    { id: "h" },
  ];
  const { view, cx } = sceneOf(rows);
  assert.equal(selectable(view, "g").visible, false, "g's house is off the strip and still counts");
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-g" }], "the one that waited longest");
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-b" }]);
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-a" }]);
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-g" }], "the cycle wraps");
});

test("Space reaches sessions past the twelfth house", () => {
  const rows = "abcdefghijklmn".split("").map((id, i) => (
    i === 12 ? { id, status: "waiting", waitingFor: "reply", at: NOW - 200 * MIN }
      : i === 13 ? { id, status: "waiting", waitingFor: "reply", at: NOW - 300 * MIN }
        : { id }
  ));
  const { view, cx } = sceneOf(rows, { width: 1192 });
  assert.equal(view.plan().seats.length, 12, "only twelve houses exist");
  assert.equal(view.plan().beyond, 2);
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-n" }], "the 14th session is the oldest waiter");
  press(view, "space");
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-m" }]);
});

test("⇧Space visits unread results oldest first, and Space says when nothing waits", () => {
  const rows = [
    { id: "a", status: "idle", at: NOW - 20 * MIN },
    { id: "b", status: "idle", at: NOW - 50 * MIN },
    { id: "c" },
    { id: "d", status: "idle", at: NOW - 80 * MIN },
  ];
  const { view, cx } = sceneOf(rows);
  press(view, "space", { shift: true });
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-d" }], "the oldest unread result");
  press(view, "space", { shift: true });
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-b" }]);
  // The first visit read that result, so only a's unread is left.
  press(view, "space", { shift: true });
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-a" }]);
  press(view, "space", { shift: true });
  assert.equal(view.noticeText(), "No unread result");

  const working = sceneOf([{ id: "a" }]);
  working.view.press({ key: "space" }, working.cx);
  assert.equal(working.view.noticeText(), "No session is waiting for you");
});

test("typing searches the names, Hangul composes, and the backspaces edit the query", () => {
  const rows = [
    { id: "a", handoff: "Snow API" },
    { id: "b", handoff: "Docs" },
    { id: "c", handoff: "한글 노트" },
  ];
  const { view, cx } = sceneOf(rows);
  for (const key of "snow") press(view, key);
  assert.equal(view.query, "snow");
  assert.equal(view.sel, "a", "the first visible house whose name contains the query");

  press(view, "backspace");
  assert.equal(view.query, "sno");
  press(view, "backspace", { cmd: true });
  assert.equal(view.query, "", "⌘⌫ clears the whole query");

  for (const key of "ㅎㅏㄴㄱㅡㄹ") press(view, key);
  assert.equal(view.query, "한글", "2-set jamo compose into syllables");
  assert.equal(view.sel, "c");
  press(view, "space", { key_char: " " }); // the space key types while searching
  for (const key of "노트") press(view, key);
  assert.equal(view.query, "한글 노트");
  press(view, "backspace", { alt: true });
  assert.equal(view.query, "한글 ", "⌥⌫ takes the last word");
});

test("⌫ marks the selected unread result read, and the undo notice lasts six seconds", () => {
  const rows = [{ id: "a", status: "idle", at: NOW - 10 * MIN }, { id: "b" }];
  const { view, cx, writes, timers } = sceneOf(rows);
  const ackKey = view.items.find((item) => item.id === "a").ackKey;
  press(view, "right");
  assert.equal(selectable(view, "a").display, "unread");
  press(view, "backspace");
  assert.ok(view.read.has(ackKey), "the read set the click path uses takes the mark");
  assert.ok(writes.includes("paper.scene.read"), "the mark is saved");
  assert.equal(selectable(view, "a").display, "other", "the gift box goes");
  assert.equal(view.noticeText(), "Marked as read · ⌘Z Undo");
  assert.deepEqual(globalThis.herdrState.shared["x-mas-paper-scene.notice"],
    { tone: "info", text: "Marked as read · ⌘Z Undo", action: "Undo" }, "the tab bar shows the undo");

  const notice = timers.find((timer) => timer.ms === 6000);
  assert.ok(notice, "the undo notice lasts six seconds");
  notice.fn(cx);
  assert.equal(view.noticeText(), null, "the notice goes when its time is up");
  assert.equal(globalThis.herdrState.shared["x-mas-paper-scene.notice"], null);
  assert.equal(view.read.has(ackKey), true, "an expired undo leaves the read mark");
});

test("⌘Z puts the read mark back", () => {
  const rows = [{ id: "a", status: "idle", at: NOW - 10 * MIN }, { id: "b" }];
  const { view, cx } = sceneOf(rows);
  const ackKey = view.items.find((item) => item.id === "a").ackKey;
  press(view, "right");
  press(view, "backspace");
  assert.equal(selectable(view, "a").display, "other");
  press(view, "z", { cmd: true });
  assert.equal(view.read.has(ackKey), false, "the mark comes off");
  assert.equal(selectable(view, "a").display, "unread", "the gift box comes back");
  assert.equal(view.noticeText(), null);
  assert.equal(globalThis.herdrState.shared["x-mas-paper-scene.notice"], null);
});

test("⌫ reads a finished session even while its Herdr agent still says done", () => {
  const { view, cx } = sceneOf([{ id: "a", status: "idle", at: NOW - 10 * MIN }]);
  globalThis.herdrState.agents = [{ address: "t-a", status: "done" }];
  view.refresh(NOW);
  const ackKey = view.items.find((item) => item.id === "a").ackKey;
  press(view, "right");
  assert.equal(selectable(view, "a").display, "unread");
  press(view, "backspace");
  assert.ok(view.read.has(ackKey), "the mark lands in the read set");
  assert.equal(selectable(view, "a").display, "other", "the agent's done no longer hides the read mark");
  press(view, "z", { cmd: true });
  assert.equal(selectable(view, "a").display, "unread", "⌘Z brings the result back");
});

test("a second read notice keeps its own undo after the first notice's time", () => {
  const rows = [
    { id: "a", status: "idle", at: NOW - 10 * MIN },
    { id: "b", status: "idle", at: NOW - 20 * MIN },
  ];
  const { view, cx, timers } = sceneOf(rows);
  press(view, "right");
  press(view, "backspace");
  press(view, "right");
  press(view, "backspace");
  assert.equal(view.noticeText(), "Marked as read · ⌘Z Undo");
  const notices = timers.filter((timer) => timer.ms === 6000);
  assert.equal(notices.length, 2, "each read notice sets its own timer");
  notices[0].fn(cx);
  assert.equal(view.noticeText(), "Marked as read · ⌘Z Undo", "the first timer leaves the second notice alone");
  assert.ok(view.undo, "and its undo stays");
  notices[1].fn(cx);
  assert.equal(view.noticeText(), null, "the second timer clears its own notice");
});

test("a click on the empty scene takes the keyboard, a drag does not", () => {
  const { view, cx } = sceneOf([{ id: "a" }]);
  globalThis.uiHandlers = new Map();
  try {
    view.render(cx);
    const down = globalThis.uiHandlers.get("paper-scene")?.["on_mouse_down:left"];
    const up = globalThis.uiHandlers.get("paper-scene")?.["on_mouse_up:left"];
    assert.ok(down && up, "the scene block answers a mouse down and a mouse up");
    down({ position: { x: 10, y: 10 } }, cx);
    up({ position: { x: 12, y: 11 } }, cx);
    assert.equal(view.keysHeld, true);
    view.keysHeld = false;
    down({ position: { x: 10, y: 10 } }, cx);
    up({ position: { x: 40, y: 10 } }, cx);
    assert.equal(view.keysHeld, false, "dragging the band moves the window, it does not take the keys");
  } finally {
    delete globalThis.uiHandlers;
  }
});

test("⌫ on a session that is not unread does nothing", () => {
  const { view, cx, writes } = sceneOf([{ id: "a" }]);
  press(view, "right");
  press(view, "backspace");
  assert.equal(view.noticeText(), null);
  assert.equal(writes.length, 0);
});

test("Esc steps back through the search, the selection, then the keyboard", () => {
  const { view, cx } = sceneOf([{ id: "a" }, { id: "b" }]);
  globalThis.herdrState.panes[0].focused = true;
  view.grabKeys(cx);
  press(view, "b");
  press(view, "right");
  assert.equal(view.query, "b");
  press(view, "escape");
  assert.equal(view.query, "");
  assert.equal(view.sel, "a", "the selection survives the search's clear");
  press(view, "escape");
  assert.equal(view.sel, null);
  press(view, "escape");
  assert.equal(view.keysHeld, false);
  assert.deepEqual(runList().at(-1), ["pane.focus", { pane: "p-a" }]);
});

test("⌘[/⌘] walk the terminals visited before", () => {
  const { view, cx } = sceneOf([{ id: "a" }, { id: "b" }, { id: "c" }]);
  globalThis.herdrState.focused = { terminal: "t-a" };
  view.trackVisit();
  globalThis.herdrState.focused = { terminal: "t-b" };
  view.trackVisit();
  assert.deepEqual(view.history, { list: ["t-a", "t-b"], at: 1 });

  view.command("back", cx);
  assert.deepEqual(runList().at(-1), ["pane.focus", { terminal: "t-a" }]);
  view.command("forward", cx);
  assert.deepEqual(runList().at(-1), ["pane.focus", { terminal: "t-b" }]);
  assert.deepEqual(view.history, { list: ["t-a", "t-b"], at: 1 });
});

test("the history module skips a terminal that has ended and keeps the forward entries", () => {
  let history = { list: [], at: -1 };
  history = visitHistory(history, "t-a");
  history = visitHistory(history, "t-b");
  history = visitHistory(history, "t-c");
  assert.deepEqual(history, { list: ["t-a", "t-b", "t-c"], at: 2 });
  const alive = new Set(["t-a", "t-b"]);
  const back = stepHistory(history, -1, alive);
  assert.deepEqual(back, { history: { list: history.list, at: 1 }, target: "t-b" });
  const past = stepHistory({ list: history.list, at: 1 }, -1, alive);
  assert.deepEqual(past.target, "t-a");
  const dead = stepHistory({ list: history.list, at: 2 }, -1, new Set(["t-c"]));
  assert.equal(dead.target, null, "a walk with nothing left open goes nowhere");
  assert.equal(visitHistory(history, "t-c"), history, "a repeat visit keeps the history as it is");
});

test("while the scene holds the keys it draws the guide line, the ring and the selection", () => {
  const rows = [{ id: "a", handoff: "Snow API" }, { id: "b", handoff: "Docs" }];
  const { view, cx } = sceneOf(rows);
  globalThis.uiNodes = new Map();
  globalThis.uiSizes = new Map();
  try {
    view.render(cx);
    assert.equal(globalThis.uiNodes.get("paper-keys-line-text"), undefined, "no guide line ungrabbed");

    view.grabKeys(cx);
    view.sel = "a";
    for (const key of "snow") press(view, key);
    view.render(cx);
    assert.deepEqual(globalThis.uiNodes.get("paper-keys-line-text").texts, [KEYS_LINE]);
    const keysLine = globalThis.uiNodes.get("paper-keys-line");
    assert.equal(keysLine.calls.find(([key]) => key === "top")[1], 10, "the guide line sits at the top edge, level with the +N chip");
    assert.equal(globalThis.uiNodes.get("paper-keys-line-text").bg, PLUS_COLORS.light.bg, "it takes the +N chip's fill");
    const ring = globalThis.uiNodes.get("paper-keys-ring");
    assert.deepEqual(ring.calls.find(([key]) => key === "border"), ["border", 2], "a 2 px ring");
    assert.deepEqual(ring.calls.find(([key]) => key === "border_color"), ["border_color", ACCENT_COLORS.light]);
    assert.deepEqual(globalThis.uiNodes.get("paper-query-chip").texts, ["snow"]);
    assert.equal(globalThis.uiNodes.get("paper-name-chip-a").bg, ACCENT_COLORS.light, "the selected chip takes the accent");
    assert.equal(globalThis.uiNodes.get("paper-name-chip-a").ink, "#FFFFFF", "with white ink");
    assert.equal(globalThis.uiNodes.get("paper-name-chip-b").bg, LABEL_COLORS.light.bg, "the others keep theirs");
    assert.equal(globalThis.uiNodes.get("paper-name-chip-b").ink, LABEL_COLORS.light.ink);

    press(view, "escape");
    press(view, "?");
    assert.equal(view.showKeys, true);
    view.render(cx);
    assert.deepEqual(globalThis.uiNodes.get("paper-keys-line-text").texts, [LEGEND_LINE]);
    assert.equal(globalThis.uiNodes.get("paper-keys-line").calls.find(([key]) => key === "top")[1], 10,
      "the legend keeps the guide line's place");
    assert.equal(globalThis.uiNodes.get("paper-keys-line-text").bg, PLUS_COLORS.light.bg, "and its fill");
    press(view, "?");
    assert.equal(view.showKeys, false);
  } finally {
    delete globalThis.uiNodes;
    delete globalThis.uiSizes;
  }
});

test("the query chip sits left of the +N chip", () => {
  const rows = "abcdefgh".split("").map((id) => ({ id }));
  const { view, cx } = sceneOf(rows, { width: 1192 });
  view.grabKeys(cx);
  for (const key of "ab") press(view, key);
  globalThis.uiNodes = new Map();
  globalThis.uiSizes = new Map();
  try {
    view.render(cx);
    const plus = globalThis.uiNodes.get("paper-plus-chip");
    for (const node of [globalThis.uiNodes.get("paper-plus"), globalThis.uiNodes.get("paper-query")]) {
      assert.equal(node.calls.find(([key]) => key === "top")[1], 10, "both chips share the top edge");
    }
    const queryRight = globalThis.uiNodes.get("paper-query").calls.find(([key]) => key === "right")[1];
    const plusRight = globalThis.uiNodes.get("paper-plus").calls.find(([key]) => key === "right")[1];
    assert.ok(queryRight > plusRight, `the query chip (${queryRight}) sits left of the +N chip (${plusRight})`);
    assert.ok(plus.texts.length);
    assert.equal(globalThis.uiNodes.get("paper-keys-line-text").bg, plus.bg, "the guide line shares the +N chip's fill");
  } finally {
    delete globalThis.uiNodes;
    delete globalThis.uiSizes;
  }
});

test("the demo scene never focuses a pane or saves the read marks", () => {
  const { view, cx, writes } = sceneOf([], { props: { demo: true }, demo: true, width: 3112 });
  view.grabKeys(cx);
  press(view, "right");
  press(view, "right");
  press(view, "right");
  const third = view.sel;
  press(view, "space");
  press(view, "space", { shift: true });
  press(view, "enter");
  assert.equal(view.sel, third);
  view.sel = "web-app"; // a working session in the demo village
  press(view, "backspace");
  assert.equal(view.noticeText(), null, "a non-unread house is not read");
  view.sel = "api"; // an unread result
  press(view, "backspace");
  assert.equal(view.noticeText(), "Marked as read · ⌘Z Undo");
  assert.deepEqual(runList(), [], "no pane.focus or pane.go in the demo");
  assert.deepEqual(writes, [], "the read marks are never saved in the demo");
});

test("a demo read mark survives the demo's activity clock ticking", () => {
  const { view, cx } = sceneOf([], { props: { demo: true }, demo: true, width: 3112 });
  view.sel = "api";
  press(view, "backspace");
  assert.equal(view.noticeText(), "Marked as read · ⌘Z Undo");
  assert.equal(view.items.find((item) => item.id === "api").display, "other");
  view.refresh(Date.now() + 1100);
  assert.equal(view.items.find((item) => item.id === "api").display, "other",
    "the demo's activity clock moved on; the read mark did not");
});

test("the press command reads its key data off the command string", () => {
  assert.deepEqual(pressSpec('press:{"key":"right","alt":true}'), { key: "right", alt: true });
  assert.deepEqual(pressSpec("press"), {});
  assert.deepEqual(pressSpec('{"key":"left"}'), { key: "left" });
  assert.equal(pressSpec("toggle"), null);
  assert.equal(pressSpec("press:{not json}"), null);

  const { view, cx } = sceneOf([{ id: "a" }, { id: "b" }]);
  view.command('press:{"key":"right"}', cx);
  assert.equal(view.sel, "a");
  view.command('press:{"key":"right","alt":true}', cx);
  assert.equal(view.sel, "b", "⌥→ takes the last house");
});

test("Space and ⇧Space targets come from the model, oldest first", () => {
  const items = [
    { id: "x", display: "turn", since: 30 },
    { id: "y", display: "turn", since: 10 },
    { id: "z", display: "unread", at: 5 },
    { id: "w", display: "working" },
  ];
  assert.deepEqual(waitTargets(items, "turn"), ["y", "x"]);
  assert.deepEqual(waitTargets(items, "unread"), ["z"]);
  assert.deepEqual(waitTargets(items, "nothing"), []);
  assert.equal(cycle(["y", "x"], "y"), "x");
  assert.equal(cycle(["y", "x"], "x"), "y");
  assert.equal(cycle(["y", "x"], "gone"), "y");
  assert.equal(cycle([], "y"), null);
});

test("the search and word erase work on names and the query", () => {
  const seats = [
    { id: "a", name: "Snow API", visible: true },
    { id: "b", name: "Docs", visible: false },
    { id: "c", name: "snow notes", visible: true },
  ];
  assert.equal(searchSeat(seats, "snow"), "a");
  assert.equal(searchSeat(seats, "SNO"), "a", "the search ignores case");
  assert.equal(searchSeat(seats, "docs"), null, "an off-strip house is not searched");
  assert.equal(searchSeat(seats, ""), null);
  assert.equal(eraseWord("snow api"), "snow ");
  assert.equal(eraseWord("snow"), "");
  assert.equal(typeJamo(typeJamo("", "ㅎ"), "ㅏ"), "하");
});
