// Modified from Herdr's shipped `tabs` mod (0.1.12, Apache License 2.0, see LICENSE in this folder):
// an unnamed tab shows its agent's session name (or its space's name), and the bar sits flush in the head row.
import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, exec, home, openOverlay, theme, window, shared, setShared, layout, props } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const TOKENS = {
  light: { text: "#3A3530", t2: "#3A3530B3", muted: "#3A353099", faint: "#D9C3A0", line: "#F1E6D2", surface: "#FFFDF8", raised: "#FBF8F2", hover: "#E9DEC8", selected: "#F1E6D2", accent: "#C8423B", accentText: "#FFFDF8", danger: "#C8423B", ok: "#3F6B4F", warn: "#D9C3A0" },
  dark: { text: "#DCE3EE", t2: "#DCE3EEB3", muted: "#DCE3EE99", faint: "#25324F", line: "#25324F", surface: "#18203A", raised: "#1E2A44", hover: "#26334F", selected: "#25324F", accent: "#F2C46D", accentText: "#1E2A44", danger: "#FFB24A", ok: "#F2C46D", warn: "#FFB24A" },
};
const CLEAR = "#00000000";

function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}

// props().compact: the bar floats over the office scene's top band (layouts/x-mas-paper.json),
// so names get a narrower slot, the side-panel buttons stay out and the bar never grows past
// COMPACT_MAX; more tabs scroll inside it.
export const COMPACT_MAX = 360;
export const COMPACT_LABEL = 88;
export function barShape(compact) {
  return compact ? { label: COMPACT_LABEL, maxWidth: COMPACT_MAX, panels: false } : { label: 170, maxWidth: null, panels: true };
}
const FOCUS_WATCH_MS = 100;
const NAME_WATCH_MS = 1000;
const NAME_RETRY_MS = 10000;
// Invented tabs for preview pictures (props().demo).
const DEMO_SPACE = { id: "demo-space", name: "orbit", named: true, status: null, tabs: [
  { id: "demo-tab-orbit", name: "orbit", named: true, active: true, status: null, zoomed: false },
  { id: "demo-tab-notes", name: "notes", named: true, active: false, status: null, zoomed: false },
] };

// A tab's name from its folder: the repo it is in, else the folder itself, "~" at home.
export function tabFolderName(cwd, top, homeDir) {
  const path = String(top || cwd || "").replace(/\/+$/, "");
  if (!path) return null;
  if (homeDir && path === String(homeDir).replace(/\/+$/, "")) return "~";
  return path.split("/").pop() || null;
}

// A tab's unused name in its space: base, else base-2, base-3, ...
export function freeName(base, taken) {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

// The session name an agent shows as its terminal title (Claude Code's `-n`), not a path,
// a user@host prompt or the program's own name.
export function sessionName(pane) {
  if (!pane?.program?.agent) return null;
  const live = String(pane.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!live || live.includes("/") || live.includes("@") || live === pane.program?.name) return null;
  return live;
}

// Names the other tabs of a tab's space have, counting renames sent but not shown yet (`owned`).
export function takenNames(spaceList, id, owned = {}) {
  const space = (spaceList ?? []).find(s => s.tabs.some(t => t.id === id));
  return (space?.tabs ?? []).filter(t => t.id !== id).flatMap(t => [t.name, owned[t.id]]).filter(Boolean);
}

// What to rename: a tab nobody named, or one this watcher named (`owned`, or the folder or
// space name an earlier version gave it), follows its first agent's session name; a tab
// nobody named and without one gets its folder's name (`cwd`). Names people gave are left alone.
export function tabTargets(spaceList, paneList, owned = {}) {
  const out = [];
  for (const space of spaceList ?? []) {
    for (const tab of space.tabs ?? []) {
      const own = (paneList ?? []).filter(p => p.tab === tab.id && p.terminal);
      const lead = own.find(p => p.program?.agent && p.cwd) ?? own.find(p => p.focused && p.cwd) ?? own.find(p => p.cwd);
      const folder = lead ? String(lead.cwd).replace(/\/+$/, "").split("/").pop() : null;
      const ours = !tab.named || owned[tab.id] === tab.name
        || (!space.named && tab.name === space.name) || (folder && tab.name === folder);
      if (!ours) continue;
      const session = sessionName(own.find(p => p.program?.agent));
      if (session) {
        if (session !== tab.name) out.push({ id: tab.id, name: session });
      } else if (!tab.named && lead) {
        out.push({ id: tab.id, cwd: lead.cwd, machine: space.machine ?? null });
      }
    }
  }
  return out;
}

// A tab-bar key: ←→ move to the neighbouring tab and wrap; ↩ and Space select the tab shown.
export function tabsKey(key, at, count) {
  if (!(count > 0)) return null;
  if (key === "right") return { at: (at + 1) % count, select: false };
  if (key === "left") return { at: (at - 1 + count) % count, select: false };
  if (key === "enter" || key === "space") return { at: Math.min(at, count - 1), select: true };
  return null;
}

export default class Tabs extends View {
  init(_props, cx) {
    this.demo = (props() ?? {}).demo === true;
    this.shape = barShape((props() ?? {}).compact === true);
    this.pressed = null;
    this.at = 0;
    this.keyboard = false;
    this.handle = cx.focus_handle();
    this.panels = this.demo ? {} : JSON.parse(localStorage.getItem("panels") ?? "{}");
    // A ring comes from is_focused(), and the shell redraws only on notify or reload.
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
    // A tab made without a name (+ menu's Terminal, ctrl-shift-t, New space) would be called "1"
    // everywhere else (Go to, agents); it takes its agent's session name, else its folder's name.
    this.naming = new Map();
    try { this.owned = JSON.parse(localStorage.getItem("tab-names") ?? "{}"); } catch {}
    if (!this.owned || typeof this.owned !== "object") this.owned = {};
    if (!this.demo) cx.timer.every(NAME_WATCH_MS, () => this.nameTabs());
  }

  nameTabs() {
    const now = Date.now();
    const list = spaces();
    for (const target of tabTargets(list, panes(), this.owned)) {
      const key = `${target.id}|${target.name ?? target.cwd}`;
      if (now < (this.naming.get(key) ?? 0)) continue;
      this.naming.set(key, now + NAME_RETRY_MS);
      if (target.name) this.rename(target.id, target.name);
      else this.nameAfterFolder(target);
    }
    const alive = new Set(list.flatMap(s => s.tabs.map(t => t.id)));
    if (Object.keys(this.owned).some(id => !alive.has(id))) {
      this.owned = Object.fromEntries(Object.entries(this.owned).filter(([id]) => alive.has(id)));
      this.saveOwned();
    }
  }

  rename(id, name) {
    run("tab.rename", { id, name });
    this.owned[id] = name;
    this.saveOwned();
  }

  saveOwned() {
    try { localStorage.setItem("tab-names", JSON.stringify(this.owned)); } catch {}
  }

  async nameAfterFolder({ id, cwd, machine }) {
    let top = null;
    try {
      const result = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { on: machine });
      if (result.code === 0) top = String(result.stdout ?? "").trim() || null;
    } catch {}
    const name = tabFolderName(cwd, top, machine ? null : home());
    // Other tabs may have been named while git ran, by this pass or by someone.
    const list = spaces();
    const tab = list.flatMap(s => s.tabs).find(t => t.id === id);
    if (name && tab && !tab.named) this.rename(id, freeName(name, takenNames(list, id, this.owned)));
  }

  focusKey() {
    return `${this.keyboard ? 1 : 0}|${this.handle?.is_focused?.() ? 1 : 0}`;
  }

  // Only the keyboard draws the tab's ring: a click focuses the bar too.
  watchFocus(cx) {
    const key = this.focusKey();
    if (key === this.drawnFocus) return;
    this.drawnFocus = key;
    cx.notify();
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      this.space = space.id; this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const k = TOKENS[appearance()];
    const space = this.demo ? DEMO_SPACE : spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    const paneList = this.demo ? [] : panes();
    this.at = Math.min(Math.max(this.at ?? 0, 0), Math.max(0, shown.length - 1));
    this.drawnFocus = this.focusKey();
    const focusedAt = (index) => this.keyboard && index === this.at && Boolean(this.handle?.is_focused?.());
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(k.muted).hover(s => s.bg(k.hover).text_color(k.text))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const item = (c, i) => {
      const program = paneList.find(p => p.tab === c.id && p.program?.agent)?.program ?? paneList.find(p => p.tab === c.id)?.program;
      // An unnamed tab shows its agent's session name (the terminal title Claude Code sets),
      // else its space's name, not its position.
      const lead = paneList.find(p => p.tab === c.id && p.program?.agent) ?? paneList.find(p => p.tab === c.id && p.focused);
      const live = (lead?.title ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();
      const telling = live && !/^[~/]/.test(live) && !live.includes("@") && live !== program?.name;
      const name = !c.named ? (telling ? live : space?.name || c.name) : /^tb\d+$/.test(c.name) ? program?.name ?? "Terminal" : c.name;
      return h_flex().id(`tab-${c.id}`).h(26).px(9).gap(6).rounded(8).items_center().flex_none().text_size(12).font_family("Nunito").font_weight(c.active ? 700 : 600)
        .relative().border(1).border_color(c.active ? k.line : CLEAR).bg(c.active ? k.surface : CLEAR).text_color(c.active ? k.text : k.t2)
        .when(c.active, el => el.shadow_sm())
        .when(focusedAt(i), el => el.border(2).border_color(k.accent))
        .role("tab").aria_selected(Boolean(c.active))
        .when(!c.active, el => el.hover(s => s.bg(k.hover)))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.keyboard = false; this.at = i; this.pressed = i; if (!this.demo && e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          if (this.demo) return;
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); if (!this.demo) openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: space.id } } }); })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(k.muted) : image(program.icon).size(14)))
        .child(div().min_w(0).max_w(this.shape.label).truncate().child(c.zoomed ? `${name} Z` : name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(k.warn).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(c.status === "blocked" ? k.danger : k.ok)))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(k.muted).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("tab.close", { id: c.id }); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = layout(), w = window();
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    // TODO(scene): the scene mod publishes no notice yet; the pill stays hidden until it does.
    const notice = this.demo ? null : shared("x-mas-paper-scene.notice");
    // A scan error or a notice comes from the cards strip; its Retry or Undo asks back over the pair of keys.
    const noticePill = () => {
      const err = notice.tone === "err";
      const action = notice.action;
      return h_flex().id("cc-notice").h(28).flex_none().max_w(360).min_w(0).pl(12).pr(action ? 4 : 12).gap(8).rounded(14).items_center()
        .bg(err ? `${k.danger}1f` : k.surface)
        .child(div().min_w(0).truncate().text_size(12).font_family("Nunito").font_weight(600).text_color(err ? k.danger : k.muted).child(notice.text))
        .when(Boolean(action), (el) => el.child(h_flex().id("cc-notice-act").h(20).flex_none().px(8).rounded(10).items_center().cursor_pointer()
          .bg(k.raised).border(1).border_color(k.line).hover((s) => s.bg(k.hover))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click(() => setShared("x-mas-paper-scene.notice-act", {
            token: `${Date.now()}-${Math.random()}`, act: notice.tone === "err" ? "retry" : "undo",
          }))
          .child(div().text_size(11).font_family("Nunito").font_weight(800).text_color(k.text).child(action))));
    };
    if (!this.demo) this.syncPanel(space, panel, body, enabled);
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return h_flex().id(`panel-${id}`).h(26).px(8).gap(4).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? k.selected : CLEAR).text_color(on ? k.text : k.t2)
        .hover(s => s.bg(k.hover)).on_mouse_down("left", stop)
        .on_click(() => {
          if (on) run("layout.hide", { id: "panel" });
          else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
        }).child(svg(icon).size(14).text_color(on ? k.text : k.t2)).child(label);
    };
    return h_flex().size_full().min_w(0).gap(2).items_center()
      .when(this.shape.maxWidth !== null, el => el.max_w(this.shape.maxWidth))
      .track_focus(this.handle).tab_index(0)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .on_key_down((event, cx) => {
        const next = tabsKey(event.key, this.at, shown.length);
        if (!next) return;
        this.keyboard = true;
        this.at = next.at;
        if (next.select && !this.demo) run("tab.select", { id: shown[this.at].id });
        cx.stop_propagation();
        cx.notify();
      })
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (!this.demo && Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(2).overflow_x_scrollbar().children(shown.map(item))
        .child(button("tab-new", "+", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }))))
      .when(Boolean(notice?.text), (el) => el.child(noticePill()))
      .when(this.shape.panels && enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(this.shape.panels && enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(w?.buttons, el => el.child(button("minimize", w.platform === "windows" ? svg("mods/x-mas-paper-tabs/win-min.svg").size(16).text_color(k.muted) : "−", () => run("window.minimize")))
        .child(button("maximize", w.platform === "windows" ? svg(`mods/x-mas-paper-tabs/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16).text_color(k.muted) : "□", () => run("window.maximize")))
        .child(button("close-window", w.platform === "windows" ? svg("mods/x-mas-paper-tabs/win-close.svg").size(16).text_color(k.muted) : svg("mods/pane/close.svg").size(13).text_color(k.muted), () => run("window.close"))));
  }
}
