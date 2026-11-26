// Tests for x-mas-paper-tabs naming tabs after their agent's session, else their folder. Run:
// node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import Tabs, { tabFolderName, freeName, sessionName, tabTargets, takenNames } from "../mods/x-mas-paper-tabs/main.js";

const claude = { agent: true, name: "Claude Code" };
const shell = { agent: false, shell: true, name: "zsh" };

test("a tab is named after its repo, else its folder, and ~ at home", () => {
  assert.equal(tabFolderName("/Users/me/git-repo/sluice/src", "/Users/me/git-repo/sluice", "/Users/me"), "sluice");
  assert.equal(tabFolderName("/Users/me/notes/", null, "/Users/me"), "notes");
  assert.equal(tabFolderName("/Users/me", null, "/Users/me/"), "~");
  assert.equal(tabFolderName("/", null, "/Users/me"), null);
  assert.equal(tabFolderName(null, null, "/Users/me"), null);
});

test("a folder name already used in the space gets a number", () => {
  assert.equal(freeName("sluice", ["other"]), "sluice");
  assert.equal(freeName("sluice", ["sluice"]), "sluice-2");
  assert.equal(freeName("sluice", ["sluice", "sluice-2"]), "sluice-3");
});

test("only an agent's own title counts as its session name", () => {
  assert.equal(sessionName({ title: "✳ sluice-1119-06", program: claude }), "sluice-1119-06");
  assert.equal(sessionName({ title: "Claude Code", program: claude }), null);
  assert.equal(sessionName({ title: "~/git-repo/sluice", program: claude }), null);
  assert.equal(sessionName({ title: "me@mac: ~", program: claude }), null);
  assert.equal(sessionName({ title: "sluice-1119-06", program: shell }), null);
});

test("unnamed and self-named tabs follow the session, names people gave stay", () => {
  const spaceList = [
    { id: "s1", name: "sluice", named: false, machine: null, tabs: [
      { id: "t1", name: "1", named: false },
      { id: "t2", name: "sluice", named: true },
      { id: "t3", name: "fix login", named: true },
      { id: "t4", name: "4", named: false },
      { id: "t5", name: "5", named: false },
      { id: "t6", name: "old-session", named: true },
    ] },
    { id: "box/s2", name: "repo", named: true, machine: "box", tabs: [{ id: "box/t7", name: "1", named: false }] },
  ];
  const paneList = [
    { pane: "p1", terminal: "a", tab: "t1", cwd: "/w/sluice", focused: true, title: "zsh", program: shell },
    { pane: "p2", terminal: "b", tab: "t1", cwd: "/w/sluice", focused: false, title: "✳ sluice-1119-06", program: claude },
    { pane: "p3", terminal: "c", tab: "t2", cwd: "/w/sluice", focused: true, title: "sluice-1119-07", program: claude },
    { pane: "p4", terminal: "d", tab: "t3", cwd: "/w/sluice", focused: true, title: "sluice-1119-08", program: claude },
    { pane: "p5", terminal: null, mod: "x-mas-paper-editor", tab: "t4", cwd: null, focused: true, title: "editor", program: {} },
    { pane: "p6", terminal: "e", tab: "t5", cwd: "/w/sluice", focused: true, title: "zsh", program: shell },
    { pane: "p7", terminal: "f", tab: "t6", cwd: "/w/other", focused: true, title: "new-session", program: claude },
    { pane: "p8", terminal: "g", tab: "box/t7", cwd: "/home/box/repo", focused: true, title: "zsh", program: shell },
  ];
  assert.deepEqual(tabTargets(spaceList, paneList, { t6: "old-session" }), [
    { id: "t1", name: "sluice-1119-06" },
    { id: "t2", name: "sluice-1119-07" },
    { id: "t5", cwd: "/w/sluice", machine: null },
    { id: "t6", name: "new-session" },
    { id: "box/t7", cwd: "/home/box/repo", machine: "box" },
  ]);
});

test("taken names count renames sent but not shown yet", () => {
  const spaceList = [{ id: "s1", tabs: [{ id: "t1", name: "1" }, { id: "t2", name: "2" }] }];
  assert.deepEqual(takenNames(spaceList, "t2", { t1: "repo" }), ["1", "repo"]);
  assert.deepEqual(takenNames(spaceList, "t9", {}), []);
});

test("two unnamed tabs in one folder named in the same pass get different names", async () => {
  globalThis.herdrState = {
    spaces: [{ id: "s1", name: "repo", named: false, machine: null, tabs: [
      { id: "t1", name: "1", named: false }, { id: "t2", name: "2", named: false },
    ] }],
    panes: [
      { pane: "p1", terminal: "a", tab: "t1", cwd: "/w/repo", focused: true, title: "zsh", program: shell },
      { pane: "p2", terminal: "b", tab: "t2", cwd: "/w/repo", focused: true, title: "zsh", program: shell },
    ],
  };
  globalThis.herdrExecResult = { code: 0, stdout: "/w/repo\n", stderr: "" };
  globalThis.herdrRuns = [];
  const tabs = new Tabs();
  tabs.owned = {};
  tabs.naming = new Map();
  await Promise.all(tabTargets(globalThis.herdrState.spaces, globalThis.herdrState.panes).map(t => tabs.nameAfterFolder(t)));
  assert.deepEqual(globalThis.herdrRuns, [
    ["tab.rename", { id: "t1", name: "repo" }],
    ["tab.rename", { id: "t2", name: "repo-2" }],
  ]);
  delete globalThis.herdrState; delete globalThis.herdrExecResult; delete globalThis.herdrRuns;
});

test("stored tab names that are not an object start empty", () => {
  const cx = { focus_handle: () => ({}), timer: { every() {} } };
  for (const stored of ["null", "5", "{bad"]) {
    localStorage.setItem("tab-names", stored);
    const tabs = new Tabs();
    tabs.init({}, cx);
    assert.deepEqual(tabs.owned, {}, stored);
  }
  localStorage.setItem("tab-names", "{}");
});

test("a tab named or closed while git runs is not renamed", async () => {
  const unnamed = { id: "s1", name: "repo", named: false, machine: null, tabs: [{ id: "t1", name: "1", named: false }] };
  for (const after of [
    { ...unnamed, tabs: [{ id: "t1", name: "fix login", named: true }] },
    { ...unnamed, tabs: [] },
  ]) {
    globalThis.herdrState = { spaces: [unnamed] };
    globalThis.herdrExecResult = { code: 1, stdout: "", stderr: "" };
    globalThis.herdrExec = { push: () => { globalThis.herdrState = { spaces: [after] }; } };
    globalThis.herdrRuns = [];
    const tabs = new Tabs();
    tabs.owned = {};
    await tabs.nameAfterFolder({ id: "t1", cwd: "/w/repo", machine: null });
    assert.deepEqual(globalThis.herdrRuns, []);
  }
  delete globalThis.herdrState; delete globalThis.herdrExecResult; delete globalThis.herdrExec; delete globalThis.herdrRuns;
});

test("the compact bar floating over the office narrows names, drops the side-panel buttons and caps its width", async () => {
  const { default: Tabs, barShape, COMPACT_MAX, COMPACT_LABEL } = await import("../mods/x-mas-paper-tabs/main.js");
  assert.deepEqual(barShape(true), { label: COMPACT_LABEL, maxWidth: COMPACT_MAX, panels: false });
  assert.deepEqual(barShape(false), { label: 170, maxWidth: null, panels: true });
  const cx = { focus_handle: () => ({ is_focused: () => false }), timer: { every() {} } };
  const idsOf = (compact) => {
    globalThis.herdrState = { props: { demo: true, compact } };
    globalThis.uiIds = [];
    const tabs = new Tabs();
    tabs.init({}, cx);
    tabs.render();
    const ids = globalThis.uiIds;
    delete globalThis.uiIds; delete globalThis.herdrState;
    return { ids, shape: tabs.shape };
  };
  const compact = idsOf(true), full = idsOf(false);
  assert.deepEqual(compact.shape, barShape(true), "props.compact picks the compact shape");
  assert.deepEqual(full.shape, barShape(false));
  assert.ok(full.ids.includes("panel-files") && full.ids.includes("panel-changes"), "the full bar keeps Files and Changes");
  assert.ok(!compact.ids.includes("panel-files") && !compact.ids.includes("panel-changes"), "the compact bar leaves them out");
  assert.ok(compact.ids.includes("tab-demo-tab-snow") && compact.ids.includes("tab-new"), "tabs and + stay");
});
