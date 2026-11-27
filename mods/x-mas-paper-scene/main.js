// X-mas paper: the scene band of the layout. Every agent session is a paper house in one painted
// village — the house's state picture and a little text say what the session is doing. scan.sh is
// read every 3 s; a click visits the session's terminal. The rail reads the places published here,
// and the tab bar the notice.
//
// ctrl+opt+p takes the keyboard into the scene (and gives it back), the way cozy-office's PiP does:
// ←→ select a house, ↩ visits it, Space / ⇧Space jump to the waiting / unread sessions, typing
// searches the names, and ⌘[ / ⌘] walk the terminals visited before.
import { View, div } from "gpui-kit";
import {
  exec, appHome, run, props, shared, setShared, theme, agents, terminals, panes, focused, nextCommand,
} from "herdr";
import {
  parseScan, buildSessions, placesOf, countStates, placeSessions, sceneFrame, liveOf,
  ackOf, lastActivityOf, rollPuff,
  SCENE_H, WALK_MS, WALK_FIRST_MS, DEMO_STAND_MS, ACCENT_COLORS, PUFF_TICK_MS, PUFF_FLIP_MS,
} from "./model.js";
import { SLOTS } from "./slots.js";
import { sceneLayers } from "./scene.js";
import { demoSessions, demoRead } from "./demo.js";
import { typeJamo, eraseJamo } from "./hangul.js";
import {
  stepSeat, waitTargets, cycle, searchSeat, eraseWord, visitHistory, stepHistory, pressSpec, keyEventOf,
} from "./keys.js";

const POLL_MS = 3000;
const FOCUS_WATCH_MS = 100;
const NAV_SETTLE_MS = 1000;
const FLASH_MS = 3000;
const READ_NOTICE_MS = 6000;
const SHARED_KEY = "x-mas-paper-scene";
const NOTICE_KEY = "x-mas-paper-scene.notice";
const NOTICE_ACT_KEY = "x-mas-paper-scene.notice-act";
const READ_KEY = "paper.scene.read";
const READ_NOTICE = "Marked as read · ⌘Z Undo";

export function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}

function accentOf(mode) {
  const accent = theme()?.accent;
  return typeof accent === "string" && accent ? accent : ACCENT_COLORS[mode];
}

function loadRead() {
  try {
    const list = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((key) => typeof key === "string") : []);
  } catch {
    return new Set();
  }
}

export default class PaperScene extends View {
  init(_props, cx) {
    this.demo = props()?.demo === true;
    this.handle = cx.focus_handle();
    this.width = 1200;
    this.height = SCENE_H;
    this.sessions = this.demo ? demoSessions(Date.now()) : [];
    this.error = null;
    this.scanning = false;
    this.since = {};
    this.read = this.demo ? new Set() : loadRead();
    this.demoReads = new Set();
    this.items = [];
    this.walkStep = 0;
    this.rand = Math.random;
    this.puffs = new Map();
    this.workingHouses = new Set();
    if (SLOTS.smoke_puffs) {
      const maxDur = SLOTS.smoke_puffs.duration_s[1] * 1000;
      const now = Date.now();
      const rand = this.rand;
      for (const house of SLOTS.houses) {
        const cells = Array.from({ length: SLOTS.smoke_puffs.puffs_per_chimney }, () =>
          ({ n: 0, phase: "idle", spec: null, nextAt: now + rand() * maxDur }));
        this.puffs.set(house.id, cells);
      }
    }
    this.keysHeld = false;
    this.backPane = null;
    this.pressed = null;
    this.sel = null;
    this.query = "";
    this.showKeys = false;
    this.notice = null;
    this.noticeSeq = 0;
    this.undo = null;
    this.turnCursor = null;
    this.unreadCursor = null;
    this.history = { list: [], at: -1 };
    this.navTarget = null;
    this.navUntil = 0;
    this.refresh(Date.now());
    this.publishNotice();
    this.startWalkers(cx);
    this.startCommands(cx);
    cx.timer.every(PUFF_TICK_MS, (cx) => this.stepPuffs(cx));
    if (this.demo) return;
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
    this.poll(cx);
  }

  // The "layout:x-mas-paper" keys of keys.json: ctrl+opt+p, ⌘[ and ⌘], and the screenshot/test
  // press command, whose arguments ride on the command string (`press:{"key":"right"}`).
  startCommands(cx) {
    cx.spawn(async (later) => {
      for (;;) {
        const command = await nextCommand();
        try {
          this.command(command, later);
        } catch (error) {
          console.error(error);
        }
        later.notify();
      }
    });
  }

  command(command, cx) {
    const text = String(command ?? "");
    if (text === "toggle") return this.toggle(cx);
    if (text === "focus") return this.grabKeys(cx);
    if (text === "back") return this.navigate(-1);
    if (text === "forward") return this.navigate(1);
    const spec = pressSpec(text);
    if (spec) this.press(spec, cx);
    return null;
  }

  // Each walker's crossing is a left transition, so a render must follow each end of it: the first
  // render draws both waiting at their starts, then these timers walk them to one lane end and
  // turn them back at every end after that.
  startWalkers(cx) {
    cx.timer.after(this.demo ? DEMO_STAND_MS : WALK_FIRST_MS, (cx) => this.stepWalkers(cx));
  }

  stepWalkers(cx) {
    this.walkStep = this.walkStep === 0 ? 1 : this.walkStep === 1 ? 2 : 1;
    cx.notify();
    cx.timer.after(WALK_MS, (cx) => this.stepWalkers(cx));
  }

  // One tick starts a fresh round for every working house's cell whose time has come. The start
  // render draws each new element at its start values; PUFF_FLIP_MS later the same element moves
  // to its end values, so the transition runs.
  stepPuffs(cx) {
    const cfg = SLOTS.smoke_puffs;
    if (!cfg) return;
    const now = Date.now();
    const started = [];
    for (const houseId of this.workingHouses) {
      for (const cell of this.puffs.get(houseId) ?? []) {
        if (now < cell.nextAt) continue;
        cell.n += 1;
        cell.spec = rollPuff(cfg, this.rand);
        cell.phase = "start";
        cell.nextAt = now + cell.spec.dur;
        started.push(cell);
      }
    }
    if (!started.length) return;
    cx.notify();
    cx.timer.after(PUFF_FLIP_MS, (later) => {
      for (const cell of started) if (cell.phase === "start") cell.phase = "run";
      later.notify();
    });
  }

  poll(cx) {
    if (this.scanning || this.demo) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      let error = null;
      try {
        const result = await exec("sh", [`${appHome()}/mods/x-mas-paper-scene/scan.sh`]);
        if (result.code !== 0) {
          throw new Error((result.stderr || result.stdout || "").trim() || `scan.sh exited ${result.code}`);
        }
        const parsed = parseScan(result.stdout ?? "");
        this.sessions = parsed.sessions;
        error = parsed.meta?.error ?? null;
      } catch (error_) {
        error = String(error_?.message ?? error_);
      }
      this.error = error ? String(error).replace(/\.$/, "") : null;
      this.scanning = false;
      this.refresh(Date.now());
      this.publishNotice();
      cx.notify();
    });
  }

  // Rebuilds the session model from the last scan and Herdr's live data, then publishes what
  // the rail reads. Herdr gives no last-activity time for agents, so their elapsed time counts
  // from when this view last saw their status change.
  refresh(now) {
    if (this.demo) {
      const sessions = demoSessions(now);
      // The demo's activity times follow the clock, so a demo read mark is kept by session, not ack key.
      const read = new Set([...demoRead(sessions), ...this.read]);
      for (const raw of sessions) {
        if (this.demoReads.has(raw.sessionId)) read.add(ackOf(raw, lastActivityOf(raw)));
      }
      this.items = buildSessions({ sessions, read, now });
      this.pruneSelection();
      this.publish();
      return;
    }
    const list = agents();
    const alive = new Set(list.map((a) => a.address));
    for (const a of list) if (this.since[a.address]?.status !== a.status) this.since[a.address] = { status: a.status, at: now };
    for (const address of Object.keys(this.since)) if (!alive.has(address)) delete this.since[address];
    this.items = buildSessions({
      sessions: this.sessions, agents: list, terminals: terminals(), panes: panes(),
      read: this.read, since: this.since, now,
    });
    this.pruneRead();
    this.pruneSelection();
    this.publish();
  }

  pruneRead() {
    const live = new Set(this.items.map((item) => item.ackKey));
    const kept = [...this.read].filter((key) => live.has(key));
    if (kept.length === this.read.size) return;
    this.read = new Set(kept);
    this.saveRead();
  }

  // The selection is a session address, so a redrawn list keeps pointing at the same session;
  // once that session is gone the selection goes with it.
  pruneSelection() {
    if (this.sel && !this.items.some((item) => item.id === this.sel)) this.sel = null;
  }

  saveRead() {
    if (this.demo) return;
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...this.read]));
    } catch {}
  }

  plan() {
    return placeSessions(this.items, sceneFrame(this.width, this.height));
  }

  selectedSeat() {
    return this.plan().seats.find((seat) => seat.id === this.sel && seat.visible !== false) ?? null;
  }

  visit(item, cx) {
    if (this.demo) {
      this.keysHeld = false;
      this.backPane = null;
      cx?.notify?.();
      return;
    }
    if (item.terminal) {
      this.keysHeld = false;
      this.backPane = null;
      run("pane.focus", item.pane ? { pane: item.pane } : { terminal: item.terminal });
    } else if (this.isGrabbed()) {
      this.leaveKeys(cx);
    }
    if (item.ackKey && !this.read.has(item.ackKey)) {
      this.read.add(item.ackKey);
      this.saveRead();
    }
    this.refresh(Date.now());
    cx?.notify?.();
  }

  publish() {
    const value = { places: placesOf(this.items), counts: countStates(this.items) };
    const text = JSON.stringify(value);
    if (text === this.published) return;
    this.published = text;
    setShared(SHARED_KEY, value);
  }

  // The tab bar draws a scan error's Retry and the read notice's Undo over the same pair of keys.
  publishNotice() {
    const live = this.notice && this.notice.text && this.notice.until > Date.now() ? this.notice : null;
    const value = this.error
      ? { tone: "err", text: this.error, action: "Retry" }
      : live?.undo
        ? { tone: "info", text: live.text, action: "Undo" }
        : null;
    const text = JSON.stringify(value);
    if (text === this.publishedNotice) return;
    this.publishedNotice = text;
    setShared(NOTICE_KEY, value);
  }

  // ---- the keyboard ----

  // The keys stay grabbed until leaveKeys, a visit, or the focus watch sees the handle lose focus.
  isGrabbed() {
    return this.keysHeld === true;
  }

  toggle(cx) {
    if (this.isGrabbed()) this.leaveKeys(cx);
    else this.grabKeys(cx);
  }

  // Takes the keyboard and remembers the pane it came from, so leaveKeys can hand it back.
  grabKeys(cx) {
    if (this.isGrabbed()) return;
    this.backPane = panes().find((pane) => pane.focused)?.pane ?? null;
    this.keysHeld = true;
    this.handle?.focus?.();
    cx?.notify?.();
  }

  leaveKeys(cx) {
    this.keysHeld = false;
    this.query = "";
    this.sel = null;
    const pane = this.demo ? null : this.returnPane();
    this.backPane = null;
    if (!this.demo) {
      if (pane) run("pane.focus", { pane });
      else run("pane.go", { direction: "down" });
    }
    cx?.notify?.();
  }

  // The remembered pane while it is still open.
  returnPane() {
    const live = panes();
    return live.some((pane) => pane.pane === this.backPane) ? this.backPane : null;
  }

  // The band is a window_drag block: only a press that ends near where it started takes the keys.
  clickRelease(event, cx) {
    const pressed = this.pressed;
    this.pressed = null;
    if (!pressed || !event?.position) return;
    if (Math.hypot(event.position.x - pressed.x, event.position.y - pressed.y) > 4) return;
    this.grabKeys(cx);
  }

  key(event, cx) {
    if (!this.keysHeld) return;
    this.handleKey(event, cx);
  }

  // The screenshot and test path: the same handling, acting as if the scene held the keyboard,
  // and the pane moves still run (pane.focus / pane.go).
  press(spec, cx) {
    this.handleKey(keyEventOf(spec), cx);
  }

  handleKey(event, cx) {
    const modifiers = event.modifiers ?? {};
    const alt = Boolean(modifiers.alt);
    const shift = Boolean(modifiers.shift);
    const command = Boolean(modifiers.platform);
    const control = Boolean(modifiers.control);
    const key = event.key;
    const plain = !command && !control && !alt;
    const searching = Boolean(this.query);
    let handled = true;
    if (key === "p" && control && alt && !command) {
      // ctrl+opt+p while the scene has the keyboard: keys.json bindings do not arrive, so the
      // scene hands it back itself, like Esc's last step.
      this.leaveKeys(cx);
    } else if (key === "escape") {
      this.escapeStep(cx);
    } else if (key === "backspace" && plain) {
      if (searching) {
        this.query = eraseJamo(this.query);
        this.research(cx);
      } else if (!event.is_held) {
        this.acknowledge(cx);
      }
    } else if (key === "backspace" && searching && command && !control && !alt) {
      this.query = "";
      this.research(cx);
    } else if (key === "backspace" && searching && alt && !command && !control) {
      this.query = eraseWord(this.query);
      this.research(cx);
    } else if (key === "left" && alt) {
      this.choose("first", cx);
    } else if (key === "right" && alt) {
      this.choose("last", cx);
    } else if (key === "left") {
      this.choose(-1, cx);
    } else if (key === "right") {
      this.choose(1, cx);
    } else if (key === "enter" && plain) {
      this.enter(cx);
    } else if (key === "space" && !command && !control && !alt && !searching) {
      this.jump(shift ? "unread" : "turn", cx);
    } else if ((key === "?" || (key === "/" && shift)) && !searching) {
      this.showKeys = !this.showKeys;
    } else if (key === "z" && command && !shift && !control && !alt) {
      if (!this.undoRead(cx)) handled = false;
    } else if (event.key_char && event.key_char.length === 1 && plain) {
      const ch = event.key_char;
      if (searching || ch.trim()) {
        const code = ch.codePointAt(0);
        this.query = code >= 0x3131 && code <= 0x3163 ? typeJamo(this.query, ch) : this.query + ch;
        this.research(cx);
      } else handled = false;
    } else {
      handled = false;
    }
    if (handled) {
      cx?.stop_propagation?.();
      cx?.notify?.();
    }
    return handled;
  }

  choose(step, cx) {
    const next = stepSeat(this.plan().seats, this.sel, step);
    if (next == null) return;
    this.sel = next;
    cx?.notify?.();
  }

  enter(cx) {
    const seat = this.selectedSeat();
    if (!seat) return false;
    this.visit(seat, cx);
    return true;
  }

  // Space / ⇧Space visit the waiting / unread sessions, the one that has waited longest first,
  // cycling on repeat. Sessions off the strip and past the twelfth count too.
  jump(kind, cx) {
    const list = waitTargets(this.items, kind);
    const cursor = kind === "unread" ? this.unreadCursor : this.turnCursor;
    const target = cycle(list, cursor);
    if (target == null) {
      this.flash(kind === "unread" ? "No unread result" : "No session is waiting for you", FLASH_MS, cx);
      return;
    }
    if (kind === "unread") this.unreadCursor = target;
    else this.turnCursor = target;
    const item = this.items.find((entry) => entry.id === target);
    if (item) this.visit(item, cx);
  }

  research(cx) {
    if (!this.query) return;
    const hit = searchSeat(this.plan().seats, this.query);
    if (hit != null) this.sel = hit;
    cx?.notify?.();
  }

  // The selected unread session becomes read: its gift box goes, as when its house is clicked.
  acknowledge(cx) {
    const seat = this.selectedSeat();
    if (!seat || seat.display !== "unread" || !seat.ackKey) return false;
    if (this.demo) this.demoReads.add(seat.id);
    else this.read.add(seat.ackKey);
    this.saveRead();
    this.undo = { ackKey: seat.ackKey, id: seat.id };
    this.refresh(Date.now());
    this.flash(READ_NOTICE, READ_NOTICE_MS, cx, { undo: true });
    return true;
  }

  undoRead(cx) {
    if (!this.undo) return false;
    if (this.demo) this.demoReads.delete(this.undo.id);
    else this.read.delete(this.undo.ackKey);
    this.saveRead();
    this.undo = null;
    this.notice = null;
    this.refresh(Date.now());
    this.publishNotice();
    cx?.notify?.();
    return true;
  }

  // Esc steps back: the search, then the selection, then the keyboard.
  escapeStep(cx) {
    if (this.query) {
      this.query = "";
    } else if (this.sel) {
      this.sel = null;
    } else {
      this.leaveKeys(cx);
    }
    cx?.notify?.();
  }

  flash(text, ms, cx, options = {}) {
    const seq = (this.noticeSeq += 1);
    this.notice = { text, undo: options.undo === true, until: Date.now() + ms };
    this.publishNotice();
    cx?.timer?.after?.(ms, (later) => {
      if (seq !== this.noticeSeq) return;
      this.notice = null;
      if (options.undo) this.undo = null;
      this.publishNotice();
      (later ?? cx)?.notify?.();
    });
    cx?.notify?.();
  }

  noticeText() {
    return this.notice && this.notice.until > Date.now() ? this.notice.text : null;
  }

  // The terminals visited before, by ⌘[ and ⌘]: the focused terminal is recorded, and the walk
  // skips terminals that have ended.
  trackVisit() {
    if (this.demo) return;
    const terminal = focused()?.terminal ?? null;
    if (!terminal) return;
    if (this.navTarget) {
      if (terminal === this.navTarget) {
        this.navTarget = null;
        return;
      }
      if (Date.now() < this.navUntil) return;
      this.navTarget = null;
    }
    this.history = visitHistory(this.history, terminal);
  }

  navigate(delta) {
    if (this.demo) return;
    const alive = new Set(liveOf(terminals()).map((terminal) => terminal.address));
    const { history, target } = stepHistory(this.history, delta, alive);
    if (!target) return;
    this.history = history;
    this.navTarget = target;
    this.navUntil = Date.now() + NAV_SETTLE_MS;
    run("pane.focus", { terminal: target });
  }

  watchFocus(cx) {
    this.trackVisit();
    if (this.keysHeld && this.handle?.is_focused?.() === false) {
      this.keysHeld = false;
      this.query = "";
      this.sel = null;
    }
    const key = `${this.isGrabbed() ? 1 : 0}|${focused()?.terminal ?? ""}`;
    if (key === this.drawnFocus) return;
    this.drawnFocus = key;
    cx.notify();
  }

  render(cx) {
    // The tab bar's Retry and Undo ask back over the paired keys, as the office's strip does.
    const act = shared(NOTICE_ACT_KEY);
    if (act?.token && act.token !== this.lastAct) {
      this.lastAct = act.token;
      if (act.act === "retry") this.poll(cx);
      else if (act.act === "undo") this.undoRead(cx);
    }

    const mode = appearance();
    const height = this.height > 0 ? this.height : SCENE_H;
    const plan = placeSessions(this.items, sceneFrame(this.width, height));
    // A house that starts working re-rolls each cell's first-round offset, so its chimneys never
    // share a beat. Houses off the strip neither puff nor count as working.
    const working = new Set(plan.seats
      .filter((seat) => seat.display === "working" && seat.visible !== false)
      .map((seat) => seat.house.id));
    if (SLOTS.smoke_puffs) {
      const now = Date.now();
      const maxDur = SLOTS.smoke_puffs.duration_s[1] * 1000;
      for (const houseId of working) {
        if (this.workingHouses.has(houseId)) continue;
        for (const cell of this.puffs.get(houseId) ?? []) cell.nextAt = now + this.rand() * maxDur;
      }
    }
    this.workingHouses = working;
    const selected = plan.seats.find((seat) => seat.id === this.sel && seat.visible !== false)?.house.id ?? null;
    const nodes = sceneLayers({
      width: this.width, height, mode, seats: plan.seats, plus: plan.plus, puffs: this.puffs,
      walkStep: this.walkStep, visit: (seat, click) => this.visit(seat, click),
      keysHeld: this.isGrabbed(), showKeys: this.showKeys, query: this.query,
      selected, accent: accentOf(mode), notice: this.noticeText(),
    });
    return div().id("paper-scene").size_full().relative().overflow_hidden()
      .bg(mode === "dark" ? "#15181E" : "#F7F4EE")
      .track_focus(this.handle).tab_index(0)
      .on_key_down((event, cx) => this.key(event, cx))
      .on_mouse_down("left", (event) => { this.pressed = event?.position ?? null; })
      .on_mouse_up("left", (event, cx) => this.clickRelease(event, cx))
      .on_size_change((size, cx) => {
        if (size.width === this.width && size.height === this.height) return;
        this.width = size.width;
        this.height = size.height;
        cx.notify();
      })
      .children(nodes);
  }
}
