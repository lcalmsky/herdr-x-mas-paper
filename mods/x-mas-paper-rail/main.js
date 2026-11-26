// The space rail as a directory tree: a repository heading, each space under it with its ticket
// key and agent count, and one row per agent indented below the space with its face, status dot,
// topic and elapsed time. Spaces cut from one git repository sit under the repository's heading;
// a Slack-thread bot's space opens into one row per thread tab. A hollow ring by a space means a
// shell there has sat at its prompt for 10 min. props().role "buttons" draws only the new-space
// and settings buttons for the rail's bottom.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, agents, terminals, panes, exec, run, openOverlay, props, shared, theme } from "herdr";
import { demoRail } from "./demo.js";
import { THREAD_LABEL, THREAD_SESSIONS, SPACE_KEY, REPO_PREFIX } from "./site.js";

const TOKENS = {
  light: { text: "#3A3530", muted: "#3A353099", line: "#F1E6D2", hover: "#F1E6D2", selected: "#F1E6D2", card: "#FFFDF8", block: "#FBF8F2", focus: "#F1E6D2", bar: "#C8423B" },
  dark: { text: "#DCE3EE", muted: "#DCE3EE99", line: "#25324F", hover: "#26334F", selected: "#25324F", card: "#18203A", block: "#1E2A44", focus: "#25324F", bar: "#F2C46D" },
};
const STATE = { blocked: "#E0603F", needs: "#E0603F", approval: "#D9805F", approve: "#D9805F", working: "#E5B54F", done: "#79A877", idle: "#A39A90" };
const ISLANDS = ["#D9805F", "#7E9FC2", "#9DB89A", "#E5B54F", "#8E6C8A", "#5E8C8A"];
const FOLDER_ICON = "mods/workspace-chrome/folder.svg";

// Each space's accent colour, by its order in the list.
export function islandColors(list) {
  return new Map(list.map((s, n) => [s.id, ISLANDS[n % ISLANDS.length]]));
}

export function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}
const IDLE_MS = 10 * 60 * 1000;
const REPO_MS = 30 * 1000;
const FOCUS_WATCH_MS = 100;
const FACES = 24;
// RAIL_MAX is the rail's "max" in layouts/x-mas-paper.json; change both together. From WIDE_W up
// a heading spells the whole repository name; below it, only the name's first word.
export const RAIL_MAX = 320;
export const WIDE_W = 120;
const KEY_DIGITS = /^[A-Z]+-(\d+)$/;

// The same FNV-1a slot as the office's lookIndex (place.js), so a face keeps its person in both.
export function faceIndex(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key ?? "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % FACES;
}

// Where a terminal's program runs now; the recorded cwd is only where the terminal opened.
export function cwdOf(t) {
  return t?.foreground?.cwd || t?.cwd || null;
}

function agentName(a) {
  const live = String(a.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (live && !/^[~/]/.test(live) && !live.includes("@") && live !== a.program?.name) return live;
  return a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : a.program?.name ?? a.address;
}

// A space's crew row: its agents (blocked, working, done, idle, then address), at most 3
// faces (2 when a shell chip also needs the room) and how many shell-only terminals it has.
export function crewOf(spaceId, mine, list) {
  const rank = { blocked: 0, needs: 0, approval: 0, approve: 0, working: 1, done: 2, idle: 3 };
  const ordered = list.filter((a) => a.space === spaceId).sort((a, b) =>
    (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || String(a.address).localeCompare(String(b.address)));
  const agentAddresses = new Set(list.map((a) => a.address));
  const shells = mine.filter((t) => t.program?.shell && !agentAddresses.has(t.address)).length;
  const cap = shells > 0 && ordered.length > 3 ? 2 : 3;
  const faces = ordered.slice(0, cap);
  const tip = [ordered.map(agentName).join(", "), shells ? `${shells} shell${shells === 1 ? "" : "s"}` : ""]
    .filter(Boolean).join(" · ");
  return { faces, hidden: ordered.length - faces.length, shells, tip };
}

// A tile label: the shortest leading 2 or 3 code points no other space shares. When even three
// collide (`abc-1408-ai` / `abc-1421-ai`), the first later word no other colliding name has, a
// number first (ticket ids), cut to 4 (`1408` / `1421`); the 3-letter head when none differs.
export function tileLabels(names) {
  const norm = names.map((name) => String(name ?? "").toLowerCase().replace(/^[^\p{L}\p{N}]+/u, ""));
  const head = (name, count) => [...name].slice(0, count).join("");
  const words = (name) => name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return norm.map((name, index) => {
    if (!name) return "?";
    for (const count of [2, 3]) {
      const label = head(name, count);
      if (!norm.some((other, at) => at !== index && head(other, count) === label)) return label;
    }
    const rivals = norm.filter((other, at) => at !== index && head(other, 3) === head(name, 3)).map(words);
    const own = words(name).slice(1).filter((word) => !rivals.some((rival) => rival.includes(word)));
    const pick = own.find((word) => /^\p{N}+$/u.test(word)) ?? own[0];
    return pick ? head(pick, 4) : head(name, 3);
  });
}

function quiet(ms) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h`;
}

// A space the cards hold no session for (idle, or never scanned) is named from its own name.
export function spaceName(name) {
  const text = String(name ?? "");
  const match = text.match(SPACE_KEY);
  if (!match) return { key: null, rest: text };
  const rest = text.replace(match[1], " ").replace(REPO_PREFIX, "")
    .replace(/(^|-)rd-\d{8}-\d{6}(?=-|$)/, "$1").replace(/(^|-)(?=[0-9a-f]*[a-f])[0-9a-f]{6}(?=-|$)/, "$1")
    .split(/[\s-]+/).filter(Boolean).join("-");
  return { key: match[1].toUpperCase(), rest: rest || null };
}

// The narrow rail's heading: the name's first word, so `herdr-x-mas-paper` reads `herdr`, not a cut-off middle.
export function narrowHead(head) {
  return String(head ?? "").split(/[-_.\s]+/).find(Boolean) ?? "";
}

// The active space block's fill and the focused pane's bar colour.
export function shownFrame(_wide, tone = "light") {
  const t = TOKENS[tone] ?? TOKENS.light;
  return { bg: t.block, bar: 3, color: t.bar };
}

// The rail's rows, grouped. `rows` are spaceRows() in Herdr's order, `list` is agents() and `places`
// the cards' { [terminal address]: { key, rest, topic, slack } }. Every repository gets a heading, and a
// space named like its repository shows its agent instead; a Slack-thread bot's space becomes one row per tab.
export function railTree(rows, list, places = {}) {
  const groups = [];
  const byKey = new Map();
  const labels = tileLabels(rows.map((row) => row.space.name));
  const nameOf = (agentsHere, fallback) => {
    const place = agentsHere.map((a) => places[a.address]).find((p) => p?.key);
    return place ? { key: place.key, rest: place.rest ?? null } : spaceName(fallback);
  };
  const shortOf = (name, fallback) => name.key?.match(KEY_DIGITS)?.[1] ?? fallback;
  rows.forEach((row, index) => {
    const s = row.space;
    const here = list.filter((a) => a.space === s.id);
    const thread = here.length > 0 && here.every((a) => places[a.address]?.slack
      || (THREAD_SESSIONS && String(cwdOf(row.mine.find((t) => t.address === a.address)) ?? "").includes(THREAD_SESSIONS)));
    if (thread) {
      const tabs = s.tabs.map((tab) => ({ tab, crew: here.filter((a) => a.tab === tab.id) })).filter((t) => t.crew.length);
      groups.push({ head: THREAD_LABEL, kind: "thread", rows: tabs.map(({ tab, crew }) => {
        const topic = crew.map((a) => places[a.address]?.topic).find(Boolean);
        return { id: tab.id, space: s, tab, crew, active: s.active && tab.active,
          name: { key: null, rest: topic ?? tab.name }, short: [...String(topic ?? tab.name)].slice(0, 2).join("") };
      }) });
      return;
    }
    const key = row.repo?.common ?? `space:${s.id}`;
    let group = byKey.get(key);
    if (!group) {
      group = { head: null, kind: "repo", common: row.repo?.common ?? null, rows: [], worktree: false };
      byKey.set(key, group);
      groups.push(group);
    }
    if (row.repo && !row.repo.base) group.worktree = true;
    const name = nameOf(here, s.name);
    group.rows.push({ id: s.id, space: s, tab: null, crew: here, active: s.active, name, short: shortOf(name, labels[index]), row });
  });
  for (const group of groups) {
    if (group.kind !== "repo" || !group.common) continue;
    group.head = group.common.replace(/\/\.git\/?$/, "").split("/").pop() || null;
    for (const entry of group.rows) {
      if (entry.name.key || entry.name.rest !== group.head) continue;
      entry.name = { key: null, rest: entry.crew.map(agentName).find(Boolean) ?? entry.name.rest };
    }
  }
  return groups;
}

// A rail key: ↑↓ move to the neighbouring row and wrap; ↩ and Space pick the row shown.
export function railKey(key, at, count) {
  if (!(count > 0)) return null;
  if (key === "down") return { at: (at + 1) % count, select: false };
  if (key === "up") return { at: (at - 1 + count) % count, select: false };
  if (key === "enter" || key === "space") return { at: Math.min(at, count - 1), select: true };
  return null;
}

export default class XmasPaperRail extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "spaces";
    this.demo = props()?.demo === true;
    this.keyboard = false;
    if (this.role === "buttons") {
      this.handles = [cx.focus_handle(), cx.focus_handle()];
      cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
      return;
    }
    this.handle = cx.focus_handle();
    this.at = 0;
    this.width = 0;
    this.turns = {};
    this.since = {};
    this.repos = {};
    this.reading = false;
    cx.timer.every(30000, (cx) => cx.notify());
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
    if (this.demo) return;
    cx.timer.every(REPO_MS, (cx) => this.readRepos(cx));
    this.readRepos(cx);
  }

  focusKey() {
    return `${this.keyboard ? 1 : 0}|${(this.handles ?? [this.handle]).map((handle) => (handle?.is_focused?.() ? 1 : 0)).join("")}`;
  }

  // A ring comes from is_focused(), which the shell does not redraw on; only the keyboard draws it,
  // since a click focuses the rail too.
  watchFocus(cx) {
    const key = this.focusKey();
    if (key === this.drawnFocus) return;
    this.drawnFocus = key;
    cx.notify();
  }

  // SpaceInfo.folder is where new terminals start, not where they are, so the repo comes from where a
  // terminal's program runs now (cwdOf).
  readRepos(cx) {
    if (this.reading) return;
    this.reading = true;
    const folders = [...new Set(terminals().map(cwdOf).filter(Boolean))];
    cx.spawn(async (later) => {
      const next = {};
      for (const cwd of folders) {
        try {
          const r = await exec("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"]);
          const [common, top] = String(r.stdout ?? "").trim().split("\n");
          next[cwd] = r.code === 0 && common ? { common, base: Boolean(top) && `${top}/.git` === common } : null;
        } catch {
          next[cwd] = null;
        }
      }
      this.repos = next;
      this.reading = false;
      this.groupSpaces();
      later.notify();
    });
  }

  // Each space's first terminal cwd and the repository git found there; repo is undefined
  // while git hasn't been asked about that cwd yet.
  spaceRows() {
    const byAddress = new Map(terminals().map((t) => [t.address, t]));
    const paneList = panes();
    return spaces().map((s) => {
      const mine = this.spaceTerminals(s, byAddress, paneList);
      const cwd = mine.map(cwdOf).find(Boolean) ?? null;
      return { space: s, mine, repo: cwd ? this.repos[cwd] : null };
    });
  }

  // Keeps the spaces of one repository next to each other in Herdr's own order (base checkout
  // first), so ⌃1–9 follow the rail. Each order is tried once.
  groupSpaces() {
    const rows = this.spaceRows();
    if (rows.some((row) => row.repo === undefined)) return;
    const groups = new Map();
    for (const row of rows) {
      const key = row.repo?.common ?? row.space.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    const want = [...groups.values()].flatMap((members) =>
      [...members.filter((r) => r.repo?.base), ...members.filter((r) => !r.repo?.base)]).map((r) => r.space.id);
    const have = rows.map((r) => r.space.id);
    const key = `${have.join(",")}>${want.join(",")}`;
    if (want.join(",") === have.join(",") || this.lastMove === key) return;
    this.lastMove = key;
    const order = [...have];
    want.forEach((id, index) => {
      if (order[index] === id) return;
      run("space.move", { id, index: index + 1 });
      order.splice(order.indexOf(id), 1);
      order.splice(index, 0, id);
    });
  }

  spaceTerminals(s, byAddress, paneList) {
    const tabs = new Set(s.tabs.map((t) => t.id));
    return paneList.filter((p) => p.terminal && tabs.has(p.tab)).map((p) => byAddress.get(p.terminal)).filter(Boolean);
  }

  // hc gives no last-activity time, so a shell counts as idle from when this view last saw its turn change.
  idleShells(list, now) {
    const idle = [];
    for (const t of list) {
      if (!t.program?.shell) continue;
      const seen = this.turns[t.address];
      if (!seen || seen.turn !== t.turn) this.turns[t.address] = { turn: t.turn, at: now };
      const since = now - this.turns[t.address].at;
      if (since >= IDLE_MS) idle.push(since);
    }
    return idle;
  }

  // Herdr reports no start time, so an agent's elapsed time counts from when this view last saw
  // its status change.
  sinceOf(list, now) {
    const seen = {};
    for (const a of list) {
      const prev = this.since[a.address];
      if (!prev || prev.status !== a.status) this.since[a.address] = { status: a.status, at: now };
      seen[a.address] = this.since[a.address].at;
    }
    for (const address of Object.keys(this.since)) if (!(address in seen)) delete this.since[address];
    return seen;
  }

  select(entry) {
    if (this.demo) return;
    run("space.select", { id: entry.space.id });
    if (entry.tab) run("tab.select", { id: entry.tab.id });
  }

  render() {
    if (this.role === "buttons") return this.buttons();
    const now = Date.now();
    const tone = appearance();
    const t = TOKENS[tone];
    const accent = theme()?.accent ?? t.bar;
    const chrome = theme()?.chrome ?? t.card;
    const demo = this.demo ? demoRail(now) : null;
    const list = demo ? demo.list : agents();
    const rows = demo ? demo.rows
      : this.spaceRows().map((row) => ({ ...row, repo: row.repo ?? null, idle: this.idleShells(row.mine, now) }));
    // TODO(scene): the scene mod publishes no places yet; the rail draws without seats.
    const places = demo ? demo.places : shared("x-mas-paper-scene")?.places ?? {};
    const groups = railTree(rows, list, places);
    const wide = this.width >= WIDE_W;
    const order = groups.flatMap((group) => group.rows);
    const since = demo ? demo.since : this.sinceOf(list, now);
    this.at = Math.min(Math.max(this.at ?? 0, 0), Math.max(0, order.length - 1));
    this.drawnFocus = this.focusKey();
    const focusedAt = (entry) => this.keyboard && Boolean(this.handle?.is_focused?.()) && order[this.at] === entry;

    const heading = (group) => {
      const noRepo = group.kind === "repo" && group.head === null;
      const label = group.head ? (wide ? group.head : narrowHead(group.head)) : "No repo";
      return h_flex().h(28).flex_none().items_center().gap(6).ml(8).mr(6).pl(10)
        .text_color(t.text)
        .child(noRepo
          ? div().w(12).h(10).flex_none().rounded(2).border(1.5).border_dashed().border_color(t.muted)
          : svg(FOLDER_ICON).size(12).flex_none().text_color(t.muted))
        .child(div().min_w(0).truncate().text_size(12).font_family("Nunito").font_weight(800).child(label));
    };
    const tipOf = (entry) => {
      const idle = entry.row?.idle ?? [];
      const who = crewOf(entry.space.id, entry.row?.mine ?? [], entry.crew).tip;
      return [entry.name.key ? `${entry.name.key} ${entry.name.rest ?? ""}`.trim() : entry.name.rest, who,
        idle.length ? `${idle.length} idle shell${idle.length === 1 ? "" : "s"} · ${quiet(Math.max(...idle))}` : null]
        .filter(Boolean).join(" · ");
    };
    const ring = (entry) => (entry.row?.idle?.length ?? 0) > 0
      ? div().size(8).flex_none().rounded(4).border(1.5).border_color(t.muted) : null;
    const spaceLabel = (entry) => h_flex().flex_1().min_w(0).gap(6).items_center()
      .when(Boolean(entry.name.key), (el) => el.child(div().flex_none().px(5).py(1).rounded(5).bg(t.line)
        .text_size(10).font_family("Geist Mono").font_weight(600).text_color(t.muted).child(entry.name.key)))
      .child(div().min_w(0).truncate().text_size(13).font_family("Nunito").font_weight(800).text_color(t.text)
        .child(entry.name.rest ?? entry.name.key ?? entry.short ?? "?"));
    const spaceRow = (entry) => h_flex().id(`rail-${entry.id}`).relative().h(28).flex_none().pl(10).pr(8)
      .gap(6).items_center().rounded(8).cursor_pointer()
      .when(!entry.active, (el) => el.hover((h) => h.bg(t.hover)))
      .when(focusedAt(entry), (el) => el.border(1.5).border_color(accent))
      .role("row").aria_selected(Boolean(entry.active))
      .tooltip(tipOf(entry))
      .on_click(() => { this.at = order.indexOf(entry); this.select(entry); })
      .on_mouse_down("right", () => { if (!this.demo) openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: entry.space.id } } }); })
      .child(spaceLabel(entry))
      .when(Boolean(ring(entry)), (el) => el.child(ring(entry)))
      .child(div().flex_none().text_size(11).font_family("Nunito").font_weight(700).text_color(t.muted)
        .child(entry.crew.length ? String(entry.crew.length) : "–"));
    const rank = { blocked: 0, needs: 0, approval: 0, approve: 0, working: 1, done: 2, idle: 3 };
    const crewInOrder = (crew) => [...crew].sort((a, b) =>
      (rank[a.status] ?? 4) - (rank[b.status] ?? 4) || String(a.address).localeCompare(String(b.address)));
    const agentRow = (entry, a) => {
      const status = String(a.status ?? "idle");
      const needs = status === "blocked" || status === "needs" || status === "approval" || status === "approve";
      const focused = Boolean(a.focused) && Boolean(entry.active);
      const topic = places[a.address]?.topic ?? agentName(a);
      const ago = quiet(now - (since[a.address] ?? now));
      return h_flex().id(`agent-${a.address}`).h(28).flex_none().mx(4).pl(10).pr(8)
        .gap(8).items_center().rounded(6).relative().cursor_pointer()
        .when(focused, (el) => el.bg(t.focus))
        .when(!focused, (el) => el.hover((h) => h.bg(t.hover)))
        .tooltip([agentName(a), topic, needs ? "Needs you" : status, ago].filter(Boolean).join(" · "))
        .on_click(() => { if (!this.demo) run("pane.focus", a.pane ? { pane: a.pane } : { terminal: a.address }); })
        .when(focused, (el) => el.child(div().absolute().left(0).top(5).bottom(5).w(3).rounded(2).bg(t.bar)))
        .child(div().relative().flex_none().size(22)
          .child(div().size(22).rounded(7).overflow_hidden()
            .child(image(`mods/x-mas-paper-rail/faces/${faceIndex(a.address)}.svg`).size_full()))
          .child(div().absolute().right(-2).bottom(-2).size(8).rounded(4).bg(STATE[status] ?? STATE.idle)
            .border(1.5).border_color(focused ? t.focus : entry.active ? t.block : chrome)))
        .child(div().flex_1().min_w(0).truncate().text_size(12).font_family("Nunito").font_weight(focused ? 700 : 600)
          .text_color(needs ? STATE.needs : t.text).child(topic))
        .child(div().flex_none().text_size(10).font_family("Geist Mono").text_color(t.muted).child(ago));
    };
    const spaceBlock = (entry) => v_flex().flex_none().ml(20).mr(6).my(1)
      .when(entry.active, (el) => el.bg(t.block).rounded(10).py(2))
      .child(spaceRow(entry))
      .children(crewInOrder(entry.crew).map((a) => agentRow(entry, a)));

    return v_flex().id("rail-tiles").size_full().pt(44).overflow_y_scroll()
      .track_focus(this.handle).tab_index(0)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .on_key_down((event, cx) => {
        const next = railKey(event.key, this.at, order.length);
        if (!next) return;
        this.keyboard = true;
        this.at = next.at;
        if (next.select) this.select(order[this.at]);
        cx.stop_propagation();
        cx.notify();
      })
      .on_size_change((size, cx) => {
        if (size.width === this.width) return;
        this.width = size.width;
        cx.notify();
      })
      .children(groups.flatMap((group, index) => [
        ...(index > 0 ? [div().h(1).flex_none().mx(12).my(6).bg(t.line)] : []),
        v_flex().relative().flex_none()
          .child(div().absolute().left(23).top(30).bottom(4).w(1).bg(t.line))
          .child(heading(group))
          .children(group.rows.map(spaceBlock)),
      ]));
  }

  // props().role "buttons": the rail's bottom copy, below the Claude accounts block.
  buttons() {
    this.drawnFocus = this.focusKey();
    const t = TOKENS[appearance()];
    const accent = theme()?.accent ?? t.bar;
    const button = (index, id, tip, icon, size, action, dashed) => {
      const handle = this.handles?.[index];
      return div().id(id).size(32).rounded(9).flex().items_center().justify_center().cursor_pointer()
        .when(dashed, (el) => el.border(1.5).border_dashed().border_color(t.line))
        .when(Boolean(handle), (el) => el.track_focus(handle).tab_index(0))
        .when(Boolean(this.keyboard && handle?.is_focused?.()), (el) => el.border(2).border_color(accent))
        .role("button").accessibility_label(tip)
        .text_color(t.muted).hover((h) => h.bg(t.hover).text_color(t.text))
        .on_key_down((event, cx) => {
          if (event.key !== "enter" && event.key !== "space") return;
          this.keyboard = true;
          cx.stop_propagation();
          action();
          cx.notify();
        })
        .tooltip(tip).on_click(action).child(svg(icon).size(size));
    };
    return v_flex().size_full().justify_end().pb(12).items_center().gap(8)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .child(button(0, "rail-new", "New space", "mods/workspace-chrome/plus.svg", 14, () => run("space.new"), true))
      .child(button(1, "rail-settings", "Settings", "mods/workspace-chrome/settings.svg", 15, () => run("app.settings")));
  }
}
