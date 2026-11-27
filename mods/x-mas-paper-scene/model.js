// What the scene knows about sessions, with no drawing in it: the scan's records, the five
// pictures the village shows, and how a session's house is found on the fixed 3112×320 canvas.

import { SLOTS } from "./slots.js";

export const SCENE_H = 320;
export const SLEEP_MS = 30 * 60 * 1000;
export const DISPLAY_STATES = ["working", "turn", "unread", "sleeping", "other"];

// The texts the scene draws itself, in logical canvas px; scene.js multiplies them by the block's
// scale and the mode picks the ink from the tables below.
export const LABEL_SIZE = 11, LABEL_WEIGHT = 600, LABEL_PAD_Y = 3, LABEL_PAD_X = 6, LABEL_RADIUS = 4;
export const LABEL_FONT = ".SystemUIFont", TEXT_FONT = "Helvetica";
export const LABEL_MAX_W = 120, LABEL_BOX = 140;
export const PLATE_MAX_SIZE = 13, PLATE_WEIGHT = 600, PLATE_BOX = 40, PLATE_INK = "#3A3530";
export const BUBBLE_TEXT = "Your turn", BUBBLE_SIZE = 11, BUBBLE_WEIGHT = 600, BUBBLE_PAD_Y = 5, BUBBLE_PAD_X = 7;
export const BUBBLE_RADIUS = 8, BUBBLE_TAIL_RADIUS = 2, BUBBLE_BOX = 160;
export const BUBBLE_BG = "#FFFCF6", BUBBLE_INK = "#3A3530";
export const ZZZ_TEXT = "zzz", ZZZ_SIZE = 12, ZZZ_WEIGHT = 600, ZZZ_BOX = 80;
export const PLUS_SIZE = 13, PLUS_WEIGHT = 700, PLUS_PAD_Y = 5, PLUS_PAD_X = 8, PLUS_RADIUS = 5;
export const PLUS_TOP = 10, PLUS_RIGHT = 12;
export const EDGE = 4;
export const LABEL_COLORS = {
  light: { ink: "#3A3530", bg: "#FFFCF6B8" },
  dark: { ink: "#DCE3EE", bg: "#16203CCC" },
};
export const ZZZ_COLORS = { light: "#3A3530", dark: "#DCE3EE" };
export const PLUS_COLORS = {
  light: { ink: "#3A3530", bg: "#FFFCF6CC" },
  dark: { ink: "#DCE3EE", bg: "#16203CCC" },
};
export const FADE_MS = 400, SMOKE_MS = 1200, WALK_MS = 9000, STEP_MS = 500;
export const WALK_FIRST_MS = 600, DEMO_STAND_MS = 2000;

const KEY_RE = /(?:^|[^A-Za-z0-9])([A-Za-z][A-Za-z0-9]{1,9}-\d{1,5})(?![0-9])/;

export function parseScan(output) {
  const sessions = [];
  let meta = null;
  for (const line of String(output ?? "").split("\n")) {
    if (!line.trim()) continue;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      continue;
    }
    if (value?.t === "s" && typeof value.sessionId === "string" && value.sessionId.length) sessions.push(value);
    else if (value?.t === "meta") meta = value;
  }
  return { sessions, meta };
}

// The model's state for one scan record, read or not. A finished turn is an unread result until
// someone looked at the terminal; Herdr says that with idle, the scene's own marks with `viewed`.
export function stateOf(raw, viewed = false) {
  if (!raw) return null;
  if (raw.status === "waiting") return /permission|approv/i.test(String(raw.waitingFor ?? "")) ? "approve" : "needs";
  if (raw.status === "busy" || raw.status === "shell") return "working";
  if (raw.status === "idle") return viewed ? "idle" : "done";
  return null;
}

// State -> one of the five pictures. An idle session is asleep once its last activity is more
// than thirty minutes back; a session with no state is simply "other", however old it is.
export function displayState(state, lastActivity, now = Date.now()) {
  if (state === "working") return "working";
  if (state === "needs" || state === "approve") return "turn";
  if (state === "done") return "unread";
  if (state === "idle" && Number.isFinite(lastActivity) && now - lastActivity > SLEEP_MS) return "sleeping";
  return "other";
}

// The state picture a display hangs on its house, or null for the two plain ones.
export function overlayState(display) {
  if (display === "working") return "working";
  if (display === "turn") return "turn";
  if (display === "sleeping") return "sleep";
  return null;
}

export function lastActivityOf(raw) {
  return raw?.lastMeaningfulAt ?? raw?.statusUpdatedAt ?? raw?.updatedAt ?? raw?.startedAt ?? null;
}

const folder = (path) => String(path ?? "").replace(/\/+$/, "");

// The Herdr terminal a scanned session runs in: by its foreground pid, else by its terminal id and folder.
export function terminalOf(raw, live) {
  const byPid = live.find((t) => raw.pid != null && Number(t.foreground?.pid) === Number(raw.pid));
  if (byPid) return byPid;
  const id = raw.where?.terminalId;
  const terminal = id ? live.find((t) => t.address === id) : null;
  if (!terminal || !raw.cwd) return null;
  return [terminal.foreground?.cwd, terminal.cwd].filter(Boolean).map(folder).includes(folder(raw.cwd)) ? terminal : null;
}

export const liveOf = (list) => (list ?? []).filter((t) => t.state === "live" && !String(t.address).includes("/"));

export const ackOf = (raw, since) => `${raw.sessionId}+${since != null ? Math.floor(since / 1000) : "none"}`;

function firstSentence(text, max = 96) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const end = flat.search(/[.!?。](\s|$)/);
  const cut = end >= 0 && end < max ? flat.slice(0, end + 1) : flat;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

// What a session is about, from scan.sh's identity: the handoff, a Slack thread's topic, a pasted
// brief's heading, else the first sentence of its first prompt.
export function topicOf(raw) {
  const id = raw?.identity ?? {};
  return id.handoff ?? firstSentence(id.thread?.topic) ?? id.paste ?? firstSentence(id.firstPrompt) ?? null;
}

export function nameOf(raw, place = null) {
  const name = topicOf(raw) ?? raw?.customTitle ?? raw?.agentName ?? raw?.name ?? raw?.deadhd?.title ?? place?.label ?? null;
  return name ? String(name) : String(raw?.sessionId ?? "").slice(0, 8) || "session";
}

const firstNonEmpty = (...values) => values.find((value) => typeof value === "string" && value.trim()) ?? null;

// The one line a bubble carries: the question the session is waiting on.
export function questionOf(raw) {
  return raw ? firstNonEmpty(raw.deadhd?.blockedAsk, raw.lastSentence, raw.lastAnswer, raw.waitingFor) ?? "" : "";
}

// Where a session runs, ticket key first: `app-api-ABC-12` is ABC-12 / api / app. The rail reads
// this through shared("x-mas-paper-scene").places.
export function placeOf(cwd) {
  const parts = String(cwd ?? "").split("/").filter(Boolean);
  if (!parts.length) return { key: null, rest: null, label: null };
  let leaf = parts.at(-1);
  const workspaces = parts.indexOf("workspaces");
  const worktrees = parts.lastIndexOf("worktrees");
  if (workspaces >= 0 && parts[workspaces + 2]) leaf = parts[workspaces + 2];
  else if (worktrees >= 2 && parts[worktrees - 1] === ".claude" && parts[worktrees + 1]) leaf = parts[worktrees + 1];
  const match = leaf.match(KEY_RE);
  if (!match) return { key: null, rest: null, label: leaf };
  const rest = leaf.replace(match[1], " ").split(/[\s-]+/).filter(Boolean).join("-")
    .replace(/(^|-)rd-\d{8}-\d{6}(?=-|$)/, "").replace(/(^|-)(?=[0-9a-f]*[a-f])[0-9a-f]{6}(?=-|$)/, "")
    .replace(/^-+|-+$/g, "") || null;
  return { key: match[1].toUpperCase(), rest, label: rest ?? match[1].toUpperCase() };
}

// One item per session: the scan's records first, then the Herdr agents the scan does not list.
export function buildSessions({ sessions, agents: agentList = [], terminals: terminalList = [], panes: paneList = [], read = new Set(), since = {}, now = Date.now() } = {}) {
  const live = liveOf(terminalList);
  const seen = read instanceof Set ? read : new Set(read ?? []);
  const claimed = new Set();
  const items = [];
  for (const raw of sessions ?? []) {
    const terminal = terminalOf(raw, live);
    if (terminal) claimed.add(terminal.address);
    const spoke = terminal ? agentList.find((a) => a.address === terminal.address) : null;
    const at = lastActivityOf(raw);
    let state = stateOf(raw, spoke ? spoke.status === "idle" : seen.has(ackOf(raw, at)));
    if (state === null && spoke?.status === "blocked") state = "needs";
    const place = placeOf(raw.cwd);
    const pane = terminal ? paneList.find((p) => p.terminal === terminal.address) : null;
    items.push({
      id: raw.sessionId,
      state,
      display: displayState(state, at, now),
      name: nameOf(raw, place),
      topic: topicOf(raw),
      question: questionOf(raw),
      place,
      terminal: terminal?.address ?? null,
      pane: pane?.pane ?? null,
      since: raw.statusUpdatedAt ?? raw.startedAt ?? null,
      at,
      ackKey: ackOf(raw, at),
    });
  }
  for (const a of agentList) {
    if (claimed.has(a.address) || a.app === "claude-code" || a.program?.key === "claude") continue;
    const status = String(a.status ?? "");
    const ackKey = `agent:${a.address}+${a.seq ?? 0}`;
    const state = status === "blocked" ? "needs" : status === "working" ? "working" : status === "done" && !seen.has(ackKey) ? "done" : "idle";
    const at = since[a.address]?.at ?? now;
    const place = placeOf(a.space_name);
    items.push({
      id: `agent:${a.address}`,
      state,
      display: displayState(state, at, now),
      name: a.title || a.tab_name || a.program?.name || a.address,
      topic: null,
      question: "",
      place,
      terminal: a.address,
      pane: a.pane ?? null,
      since: null,
      at,
      ackKey,
    });
  }
  return items;
}

// { [terminal address]: { key, rest, topic, slack } }, the shape the rail reads.
export function placesOf(items) {
  const places = {};
  for (const item of items ?? []) {
    if (!item.terminal) continue;
    places[item.terminal] = { key: item.place?.key ?? null, rest: item.place?.rest ?? null, topic: item.topic ?? null, slack: false };
  }
  return places;
}

export function countStates(items) {
  const counts = { working: 0, turn: 0, unread: 0, sleeping: 0, other: 0 };
  for (const item of items ?? []) if (item.display in counts) counts[item.display] += 1;
  return counts;
}

const HOUSES = new Map(SLOTS.houses.map((house) => [house.id, house]));
export const houseById = (id) => HOUSES.get(id) ?? null;

// The block in canvas px: k takes the taller of the two axis fits, so the picture is never
// squashed; the block shows the canvas's middle strip. (sx, sy) -> (left + sx·k, top + sy·k).
export function sceneFrame(width, height) {
  const w = Math.max(0, Number(width) || 0);
  const h = Math.max(0, Number(height) || 0);
  const k = Math.max(h / SCENE_H, w / SLOTS.canvas_logical[0]);
  if (!(k > 0)) return { k: 0, left: 0, top: 0, vx0: 0, vx1: 0 };
  const left = (w - SLOTS.canvas_logical[0] * k) / 2;
  const top = h - SCENE_H * k;
  const vx0 = -left / k;
  return { k, left, top, vx0, vx1: vx0 + w / k };
}

// Session i sits in house fill_order[i] and carries number i+1. `plus` counts the seats whose
// house centre is off the visible strip plus every session past the twelfth.
export function placeSessions(items, frame) {
  const list = items ?? [];
  const view = frame ?? sceneFrame(0, 0);
  const seats = [];
  let beyond = 0;
  for (let i = 0; i < list.length; i += 1) {
    if (i >= SLOTS.fill_order.length) {
      beyond += 1;
      continue;
    }
    const house = houseById(SLOTS.fill_order[i]);
    seats.push({
      ...list[i],
      house,
      number: i + 1,
      visible: house.center_x >= view.vx0 && house.center_x <= view.vx1,
    });
  }
  const offscreen = seats.filter((seat) => !seat.visible).length;
  return { seats, offscreen, beyond, plus: offscreen + beyond };
}

// The door plate's digit size: a share of the plate's height, never over 13.
export function plateSize(house) {
  return Math.min(house.door_plate.max_height * 0.62, PLATE_MAX_SIZE);
}

// An approximate text width: CJK and Hangul take a full em, Latin about half. The scene cuts its
// own lines with it, so a Korean word is never split in the middle.
export function textWidth(text, size) {
  let w = 0;
  for (const ch of String(text ?? "")) {
    const code = ch.codePointAt(0);
    if (code >= 0x2e80) w += size;
    else if (ch === " ") w += size * 0.28;
    else if (/[A-Z0-9]/.test(ch)) w += size * 0.62;
    else w += size * 0.54;
  }
  return w;
}

// One line within maxPx, cut at a space and closed with an ellipsis.
export function clipText(text, maxPx, size) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return "";
  if (textWidth(flat, size) <= maxPx) return flat;
  const room = maxPx - textWidth("…", size);
  let cut = "";
  for (const ch of flat) {
    if (textWidth(cut + ch, size) > room) break;
    cut += ch;
  }
  const at = cut.lastIndexOf(" ");
  const out = (at > 0 ? cut.slice(0, at) : cut).trimEnd();
  return out ? `${out}…` : "…";
}
