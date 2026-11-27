// What the scene's keyboard decides, with no drawing in it: the houses ←→ walk, the sessions Space
// and ⇧Space visit, the typed search, and the terminal visits ⌘[ / ⌘] follow. main.js wires these
// to Herdr and scene.js draws the result.

export const HISTORY_MAX = 50;

// The houses a key can reach: the seats the strip shows now, in door-number order.
export function keySeats(seats) {
  return (seats ?? []).filter((seat) => seat.visible !== false);
}

// Where ← (step -1) or → (step 1) lands, and ⌥← / ⌥→ for the first and last house. A missing
// selection starts at the far end in that direction, and the ends wrap around. Null when the
// strip shows no house.
export function stepSeat(seats, selected, step) {
  const list = keySeats(seats);
  if (!list.length) return null;
  if (step === "first") return list[0].id;
  if (step === "last") return list[list.length - 1].id;
  const at = list.findIndex((seat) => seat.id === selected);
  if (at < 0) return step < 0 ? list[list.length - 1].id : list[0].id;
  return list[(at + step + list.length) % list.length].id;
}

// The sessions Space ("turn", your turn) and ⇧Space ("unread", a finished result) visit, the one
// that has waited longest first. Every session counts, off-strip ones and those past the twelfth.
export function waitTargets(items, kind) {
  const state = kind === "unread" ? "unread" : kind === "turn" ? "turn" : null;
  if (!state) return [];
  const waited = (item) => item.since ?? item.at ?? 0;
  return (items ?? [])
    .filter((item) => item.display === state)
    .sort((a, b) => waited(a) - waited(b) || String(a.id).localeCompare(String(b.id)))
    .map((item) => item.id);
}

// The target after the cursor, wrapping; a cursor that has gone starts at the oldest.
export function cycle(list, cursor) {
  if (!list.length) return null;
  const at = list.indexOf(cursor);
  return list[at < 0 ? 0 : (at + 1) % list.length];
}

// The first visible house whose name contains the query, in any case.
export function searchSeat(seats, query) {
  const needle = String(query ?? "").toLowerCase();
  if (!needle) return null;
  const hit = keySeats(seats).find((seat) => String(seat.name ?? "").toLowerCase().includes(needle));
  return hit ? hit.id : null;
}

export function eraseWord(query) {
  return String(query ?? "").replace(/\S*\s*$/, "");
}

// The terminals visited, in visit order; list[at] is where the person is and the entries after it
// are the forward ones.
export function visitHistory(history, terminal) {
  if (!terminal || history.list[history.at] === terminal) return history;
  let list = [...history.list.slice(0, history.at + 1), terminal];
  if (list.length > HISTORY_MAX) list = list.slice(list.length - HISTORY_MAX);
  return { list, at: list.length - 1 };
}

// A terminal that has ended is skipped rather than stopping the walk: the person asked for the
// previous one still open.
export function stepHistory(history, delta, alive) {
  const { list, at } = history;
  for (let index = at + delta; index >= 0 && index < list.length; index += delta) {
    const terminal = list[index];
    if (alive.has(terminal) && terminal !== list[at]) return { history: { list, at: index }, target: terminal };
  }
  return { history, target: null };
}

// The screenshot and test command carries a key event as data: `press:{"key":"right","alt":false}`.
export function pressSpec(command) {
  const text = String(command ?? "").trim();
  if (text === "press") return {};
  const from = text.startsWith("press:") ? text.slice("press:".length) : text.startsWith("{") ? text : null;
  if (from == null) return null;
  try {
    const value = JSON.parse(from);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export function keyEventOf(spec = {}) {
  const key = String(spec.key ?? "");
  return {
    key,
    key_char: typeof spec.key_char === "string" ? spec.key_char : key.length === 1 ? key : undefined,
    modifiers: { alt: !!spec.alt, shift: !!spec.shift, platform: !!spec.cmd, control: !!spec.ctrl, function: false },
    is_held: !!spec.held,
  };
}
