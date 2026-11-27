// X-mas paper: the scene band of the layout. Every agent session is a paper house in one painted
// village — the house's state picture and a little text say what the session is doing. scan.sh is
// read every 3 s; a click visits the session's terminal. The rail reads the places published here,
// and the tab bar the notice.
import { View, div } from "gpui-kit";
import { exec, appHome, run, props, shared, setShared, theme, agents, terminals, panes } from "herdr";
import { parseScan, buildSessions, placesOf, countStates, placeSessions, sceneFrame, SCENE_H, WALK_MS, WALK_FIRST_MS, DEMO_STAND_MS } from "./model.js";
import { sceneLayers } from "./scene.js";
import { demoSessions, demoRead } from "./demo.js";

const POLL_MS = 3000;
const SHARED_KEY = "x-mas-paper-scene";
const NOTICE_KEY = "x-mas-paper-scene.notice";
const NOTICE_ACT_KEY = "x-mas-paper-scene.notice-act";
const READ_KEY = "paper.scene.read";

export function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
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
    this.width = 1200;
    this.height = SCENE_H;
    this.sessions = this.demo ? demoSessions(Date.now()) : [];
    this.error = null;
    this.scanning = false;
    this.since = {};
    this.read = this.demo ? new Set() : loadRead();
    this.items = [];
    this.walkStep = 0;
    this.refresh(Date.now());
    this.publishNotice();
    this.startWalkers(cx);
    if (this.demo) return;
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    this.poll(cx);
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
      this.items = buildSessions({ sessions, read: new Set(demoRead(sessions)), now });
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
    this.publish();
  }

  pruneRead() {
    const live = new Set(this.items.map((item) => item.ackKey));
    const kept = [...this.read].filter((key) => live.has(key));
    if (kept.length === this.read.size) return;
    this.read = new Set(kept);
    this.saveRead();
  }

  saveRead() {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify([...this.read]));
    } catch {}
  }

  visit(item, cx) {
    if (this.demo) return;
    if (item.terminal) run("pane.focus", item.pane ? { pane: item.pane } : { terminal: item.terminal });
    if (item.ackKey && !this.read.has(item.ackKey)) {
      this.read.add(item.ackKey);
      this.saveRead();
    }
    this.refresh(Date.now());
    cx.notify();
  }

  publish() {
    const value = { places: placesOf(this.items), counts: countStates(this.items) };
    const text = JSON.stringify(value);
    if (text === this.published) return;
    this.published = text;
    setShared(SHARED_KEY, value);
  }

  publishNotice() {
    const value = this.error ? { tone: "err", text: this.error, action: "Retry" } : null;
    const text = JSON.stringify(value);
    if (text === this.publishedNotice) return;
    this.publishedNotice = text;
    setShared(NOTICE_KEY, value);
  }

  render(cx) {
    // The tab bar's Retry asks back over the paired keys, as the office's strip does.
    const act = shared(NOTICE_ACT_KEY);
    if (act?.token && act.token !== this.lastAct) {
      this.lastAct = act.token;
      if (act.act === "retry") this.poll(cx);
    }

    const mode = appearance();
    const height = this.height > 0 ? this.height : SCENE_H;
    const plan = placeSessions(this.items, sceneFrame(this.width, height));
    const nodes = sceneLayers({
      width: this.width, height, mode, seats: plan.seats, plus: plan.plus,
      walkStep: this.walkStep, visit: (seat) => this.visit(seat, cx),
    });
    return div().id("paper-scene").size_full().relative().overflow_hidden()
      .bg(mode === "dark" ? "#15181E" : "#F7F4EE")
      .on_size_change((size, cx) => {
        if (size.width === this.width && size.height === this.height) return;
        this.width = size.width;
        this.height = size.height;
        cx.notify();
      })
      .children(nodes);
  }
}
