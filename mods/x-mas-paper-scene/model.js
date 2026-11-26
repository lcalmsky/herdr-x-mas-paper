// What the scene knows about sessions, with no drawing in it: the scan's records, the five
// pictures the village shows, the two hills' seats and the one-line text the signs carry.

export const SCENE_H = 240;
export const FRONT_Y = 198;
export const BACK_Y = 160;
export const SLEEP_MS = 30 * 60 * 1000;
export const BACK_SCALE = 0.72;
export const SEAT_FIRST = 130;
export const SEAT_STEP = 110;
export const SEAT_MIN_STEP = 84;
// Half the drawn tree and half the widest drawn house plus 4 px: the nearest front seat's clearance.
export const SEAT_TREE_CLEAR = 100;
export const EDGE_CLEAR = 70;
export const DISPLAY_STATES = ["working", "turn", "unread", "sleeping", "other"];

// Every length the village draws with, in logical px for a 240 px scene. scene.js multiplies each
// by the block's scale and, on the back row, by BACK_SCALE.
export const ART_W = 1778 / 2;
export const TREE_H = 168, TREE_Y = 200, TREE_WALK_GAP = 66;
export const HOUSE_H = 92, HOUSE_GIFT_X = 16, HOUSE_VILLAGER_X = 30, HOUSE_BELL_X = 4;
export const CHIMNEY_X = 0.28, CHIMNEY_Y = 6, SMOKE_H = 18, SMOKE_RISE = 14;
export const VILLAGER_H = 38, GIFT_H = 18, STOCKING_H = 20, SNOWMAN_H = 42, SNOWMAN_Y = 198, SNOWMAN_X = 45;
export const NUMBER_SIZE = 11, NUMBER_H = 16, NUMBER_RADIUS = 3, NUMBER_PAD = 3, NUMBER_AT = 0.4;
export const NAME_SIZE = 11, LABEL_MIN_W = 96, NAME_TOP = 2;
export const ASK_SIZE = 11, ASK_H = 20, ASK_PAD = 6, ASK_RADIUS = 8, ASK_MAX_W = 180, ASK_GAP = 8;
export const ASK_MIN_W = 48, ASK_LIFT = 4, ASK_MARGIN = 4, ASK_CLEAR = 2;
export const OVERFLOW_Y = 198, OVERFLOW_W = 32, OVERFLOW_H = 14;
export const ZZZ_SIZE = 11;
// The background tiles carry a black strip along their bottom edge (12 px of the 2x file); the
// scene covers that much of each tile's foot with the land's colour.
export const LAND_BAND = 7;
export const LAND_COLORS = { light: "#D9C3A0", dark: "#141C30" };
export const FADE_MS = 400, SMOKE_MS = 2000, WALK_MS = 12000, ZZZ_MS = 2400, BELL_MS = 800;

// The six paper houses, light tone and dark tone. The dark names are the manifest's own, so
// `house_green_dark` and `house_green_dark2` are two different light-tone houses.
export const HOUSES = {
  light: ["house_red", "house_green_dark", "house_red2", "house_green", "house_charcoal", "house_cream"],
  dark: ["house_red_dark", "house_green_dark_dark", "house_red2_dark", "house_green_dark2", "house_charcoal_dark", "house_cream_dark"],
};
export const PROPS = {
  light: { tree: "tree", villager: "villager", bell: "villager_bell", snowman: "snowman", gift: "gift", stocking: "stocking", smoke: "smoke", shadow: "shadow" },
  dark: { tree: "tree_dark", villager: "villager_dark", bell: "villager_bell_dark", snowman: "snowman_dark", gift: "gift_dark", stocking: "stocking_dark", smoke: "smoke_dark", shadow: "shadow" },
};
export const ART_FILE = { bg_light: "bg_light.webp", bg_dark: "bg_dark.webp" };

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

export function lastActivityOf(raw) {
  return raw?.lastMeaningfulAt ?? raw?.statusUpdatedAt ?? raw?.updatedAt ?? raw?.startedAt ?? null;
}

// The same FNV-1a slot the rail uses, so a session keeps one house throughout the day.
export function hashIndex(key, count) {
  let h = 0x811c9dc5;
  for (const ch of String(key ?? "")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return count > 0 ? h % count : 0;
}

export const houseOf = (id, tone = "light") => HOUSES[tone === "dark" ? "dark" : "light"][hashIndex(id, HOUSES.light.length)];
export const propOf = (role, tone = "light") => PROPS[tone === "dark" ? "dark" : "light"][role];

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

// House seats on the front hill, right of the tree first. The outermost 70 px of the scene stay empty.
export function seatXs(width, first = SEAT_FIRST, step = SEAT_STEP) {
  const mid = width / 2, out = [];
  for (let k = 0; ; k++) {
    const d = first + k * step;
    const pair = [mid + d, mid - d].filter((x) => x >= EDGE_CLEAR && x <= width - EDGE_CLEAR);
    if (!pair.length) break;
    out.push(...pair);
  }
  return out;
}

// The widest front-row pitch that seats `count` sessions: from SEAT_STEP down to SEAT_MIN_STEP. The
// first seat keeps that ratio, but never closer to the tree than SEAT_TREE_CLEAR.
export function seatPlan(width, count) {
  for (let step = SEAT_STEP; step > SEAT_MIN_STEP; step -= 1) {
    const first = Math.max(SEAT_TREE_CLEAR, Math.round((SEAT_FIRST * step) / SEAT_STEP));
    const xs = seatXs(width, first, step);
    if (xs.length >= count) return { xs, first, step };
  }
  const first = Math.max(SEAT_TREE_CLEAR, Math.round((SEAT_FIRST * SEAT_MIN_STEP) / SEAT_STEP));
  return { xs: seatXs(width, first, SEAT_MIN_STEP), first, step: SEAT_MIN_STEP };
}

// Sessions fill the front row first, then a smaller back row; what is left becomes one `+N` at
// each end. Every x stays inside the scene.
export function placeSessions(items, width) {
  const list = items ?? [];
  const { xs: slots, step } = seatPlan(width, list.length);
  const front = list.slice(0, slots.length).map((item, i) => ({ ...item, x: slots[i], y: FRONT_Y, scale: 1, row: "front", number: i + 1 }));
  const back = list.slice(slots.length, slots.length * 2).map((item, i) => ({ ...item, x: slots[i], y: BACK_Y, scale: BACK_SCALE, row: "back", number: slots.length + i + 1 }));
  const hidden = Math.max(0, list.length - front.length - back.length);
  const left = Math.min(EDGE_CLEAR / 2, width / 2);
  const right = Math.max(width - EDGE_CLEAR / 2, width / 2);
  const overflow = hidden > 0 ? [
    { side: "left", x: left, text: `+${hidden}` },
    { side: "right", x: right, text: `+${hidden}` },
  ] : [];
  return { units: [...front, ...back], hidden, overflow, step };
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

// Where the waiting sessions' bubbles go, left to right. Each new bubble is checked against every
// bubble already placed, whatever its row: the back row starts its bubbles a level lower, so a
// row-blind check lets the two rows cover each other. A bubble that would cover one goes up a
// level (its height plus a gap), two levels at most. With both levels taken it is cut into the
// first free span right of what blocks it, and left out when less than minW remains. No bubble may
// leave the scene's top; one that cannot is slid aside on its own level instead. Asks that do not
// claim room (`claim: false`, a session not waiting, drawn only so its bubble can fade) keep the
// first level and block nothing.
// o: { width, size, pad, maxW, bh, minW, gap, margin, clear }
export function layoutBubbles(asks, o) {
  const { width, size, pad, maxW, bh, minW = ASK_MIN_W, gap = ASK_LIFT, margin = ASK_MARGIN, clear = ASK_CLEAR } = o;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const touches = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const centred = (x, top, w) => {
    const left = clamp(x - w / 2, margin, width - w - margin);
    return { left, top, w, right: left + w, bottom: top + bh };
  };
  const placed = [];
  const out = [];
  const keep = (ask, rect, text) => {
    const item = { id: ask.id, left: rect.left, top: rect.top, w: rect.w, right: rect.right, bottom: rect.bottom, h: bh, text };
    out.push(item);
    return item;
  };
  const blocked = (rect) => placed.some((p) => touches(rect, p));

  // The widest cut that clears every placed bubble to the right of this level's blockers.
  const cutAt = (level, x, top, full, text) => {
    const at = top - level * (bh + gap);
    if (at < clear) return null;
    const own = centred(x, at, full);
    let left = placed.filter((p) => touches(own, p)).reduce((right, p) => Math.max(right, p.right + gap), own.left);
    for (let tries = 0; tries <= placed.length; tries += 1) {
      const room = Math.min(full, width - margin - left);
      if (room < minW) return null;
      const line = clipText(text, room - 2 * pad, size);
      const w = Math.min(room, textWidth(line, size) + 2 * pad);
      if (w < minW) return null;
      const rect = { left, top: at, w, right: left + w, bottom: at + bh };
      const hit = placed.find((p) => touches(rect, p));
      if (!hit) return { level, rect, text: line };
      left = hit.right + gap;
    }
    return null;
  };

  const order = [...(asks ?? [])].sort((a, b) => a.x - b.x || String(a?.id ?? "").localeCompare(String(b?.id ?? "")));
  for (const ask of order) {
    const text = String(ask?.text ?? "");
    if (!text) continue;
    const full = Math.min(maxW, textWidth(clipText(text, maxW - 2 * pad, size), size) + 2 * pad);
    if (!ask.claim) {
      keep(ask, centred(ask.x, ask.top, full), clipText(text, full - 2 * pad, size));
      continue;
    }
    let box = null;
    for (let level = 0; level < 2 && !box; level += 1) {
      const top = ask.top - level * (bh + gap);
      if (top < clear) break;
      const rect = centred(ask.x, top, full);
      if (!blocked(rect)) box = keep(ask, rect, clipText(text, full - 2 * pad, size));
    }
    if (box) {
      placed.push(box);
      continue;
    }
    const best = [cutAt(0, ask.x, ask.top, full, text), cutAt(1, ask.x, ask.top, full, text)]
      .filter(Boolean).sort((a, b) => b.rect.w - a.rect.w)[0];
    if (best) placed.push(keep(ask, best.rect, best.text));
  }
  return out;
}
