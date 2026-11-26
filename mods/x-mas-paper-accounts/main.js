// Fork of ~/git-repo/herdr-claude-accounts with the x-mas-paper palette.
// Accounts for Herdr: the head shows two usage gauges for every Claude account, then a chip
// naming the focused agent's account, and the rail one staff-ID badge per account. The popup lists
// the installed agent CLIs from knownAgents(), with the Claude and Codex account sub-lists under
// their own rows: the row starts that agent in a pane, an account row picks the login new sessions
// start under. Custom commands from models.json keep their own section, and the focused session
// can be resumed under another Claude account. The shell work lives in `cca`.
// props().role: "chip" draws the head, "rail" one staff-ID badge per account for the bottom of a
// side rail, "menu" (or none, as mod.open gives) the accounts popup, and mode "add" the custom-
// command form.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, terminals, focused, run, exec, props, appHome, openOverlay, closeOverlay, knownAgents, shared, theme } from "herdr";
import { demoAccounts } from "./demo.js";

const FONT = "Nunito";

// The light and dark theme colours, and the account-order accents.
const TOKENS = {
  light: { text: "#3A3530", t2: "#3A3530B3", muted: "#3A353099", faint: "#D9C3A0", line: "#F1E6D2", surface: "#FFFDF8", raised: "#FBF8F2", hover: "#E9DEC8", selected: "#F1E6D2", accent: "#C8423B", accentText: "#FFFDF8", danger: "#C8423B", ok: "#3F6B4F", warn: "#D9C3A0", card: "#FFFDF8" },
  dark: { text: "#DCE3EE", t2: "#DCE3EEB3", muted: "#DCE3EE99", faint: "#25324F", line: "#25324F", surface: "#18203A", raised: "#1E2A44", hover: "#26334F", selected: "#25324F", accent: "#F2C46D", accentText: "#1E2A44", danger: "#FFB24A", ok: "#F2C46D", warn: "#FFB24A", card: "#18203A" },
};
const ACCOUNT_COLORS = ["#D9805F", "#7E9FC2", "#9DB89A", "#8E6C8A"];
const meterColor = (pct) => (pct >= 90 ? "#D9805F" : pct >= 70 ? "#E5B54F" : "#9DB89A");

export function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}
const FOCUS_WATCH_MS = 100;

// Account names go into a shell command line, so only these characters are accepted anywhere.
const ACCOUNT_NAME = /^[A-Za-z0-9_-]+$/;
const RESERVED = new Set(["ls", "add", "share", "help"]);
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Herdr has no API for a mod's own folder; the app home is where Herdr keeps mods.
const cca = () => `${appHome()}/mods/x-mas-paper-accounts/cca`;

const MODELS_FILE = '"${XDG_STATE_HOME:-$HOME/.local/state}/herdr-tower/models.json"';
const DEFAULT_LAUNCH = "claude";
const shellQuote = (s) => `'${s.replace(/'/g, "'\\''")}'`;

// The command a resumed or new session starts with, editable in the popup. cca keeps it
// (`cca launch`, `cca launch set`), so every copy of this mod and every layout reads the same value.
async function readLaunch() {
  try {
    const r = await exec("sh", [cca(), "launch"]);
    return r?.code === 0 ? (r.stdout ?? "").trim() || DEFAULT_LAUNCH : DEFAULT_LAUNCH;
  } catch {
    return DEFAULT_LAUNCH;
  }
}

// The porcelain record carries only whether a model can resume, so the template comes from the
// models file, indexed by id; the first usable entry wins, as in models.mjs.
export function resumeTemplates(text) {
  let list;
  try {
    list = JSON.parse(String(text ?? ""));
  } catch {
    return {};
  }
  if (!Array.isArray(list)) return {};
  const out = {};
  const seen = new Set();
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    if (typeof entry.id !== "string" || !ACCOUNT_NAME.test(entry.id)) continue;
    if (typeof entry.command !== "string" || !entry.command.trim() || /[\t\r\n]/.test(entry.command)) continue;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    if (typeof entry.resume === "string" && entry.resume.trim() && !/[\t\r\n]/.test(entry.resume)) {
      out[entry.id] = entry.resume.trim();
    }
  }
  return out;
}

async function modelResumes() {
  try {
    const r = await exec("sh", ["-c", `cat ${MODELS_FILE} 2>/dev/null`]);
    return resumeTemplates(r?.stdout);
  } catch {
    return {};
  }
}

// A command other than plain claude may be a shell function or alias (ccode), which only the
// user's interactive shell defines, so it runs through `$SHELL -ic`.
export const launchLine = (env, command, args) => (command === DEFAULT_LAUNCH
  ? `${env} exec claude${args}`
  : `${env} exec "\${SHELL:-/bin/zsh}" -ic ${shellQuote(command + args)}`);

// A model is a shell command of its own, so it ignores the saved start command and always runs
// through the interactive shell that defines it.
export function launchFor(name, args, command = DEFAULT_LAUNCH) {
  if (name && typeof name === "object") {
    return `unset CLAUDE_CONFIG_DIR; CCA_ACCOUNT=${name.name} exec "\${SHELL:-/bin/zsh}" -ic ${shellQuote(`${name.command}${args}`)}`;
  }
  // The default account must run with CLAUDE_CONFIG_DIR unset, or Claude Code reads ~/.claude/.claude.json.
  const env = name === "default"
    ? "unset CLAUDE_CONFIG_DIR; CCA_ACCOUNT=default"
    : `CLAUDE_CONFIG_DIR="$HOME/.claude-accounts/${name}" CCA_ACCOUNT=${name}`;
  return launchLine(env, command, args);
}

export function resumeArgs(target, id) {
  if (target?.kind === "model") {
    return target.resume ? ` ${target.resume.split("{id}").join(id)}` : null;
  }
  return ` --resume ${id}`;
}

// Claude Code writes a session's transcript only with its first message, and `--resume` of a session
// without one fails with "No conversation found", so an empty session starts afresh in that account.
export function resumeOrStart(name, id, command = DEFAULT_LAUNCH) {
  const home = name === "default" ? '"$HOME/.claude"' : `"$HOME/.claude-accounts/${name}"`;
  return `set -- ${home}/projects/*/${id}.jsonl; if [ -s "$1" ]; then ${launchFor(name, ` --resume ${id}`, command)}; `
    + `else ${launchFor(name, "", command)}; fi`;
}

// The account the rail marks as this pane's and puts on top. Without a focused Claude Code pane there is
// none. `current` counts only once a read for the pane focused now has come back; until then the last
// account shown stays, so moving between two panes of one account never drops back to the list order.
export function railHere(focusKey, currentKey, current, held) {
  if (!focusKey) return null;
  return currentKey === focusKey ? current : held ?? null;
}

// The display label cca keeps for an account, falling back to the account name.
const display = (a) => a?.label || a?.name || "";
// A failure line ends without a full stop and carries the next step in its fallback.
export const errorText = (r, fallback) => ((r?.stderr || r?.stdout) ?? "").trim().replace(/\.$/, "") || fallback;

// The CLI agents Herdr can start, Claude first and Codex second so an account sub-list sits under
// each; an entry with no installed flag was already filtered by the popup's props.
export function orderAgents(list) {
  if (!Array.isArray(list)) return [];
  const installed = list.filter((a) => a && typeof a.key === "string" && a.installed !== false);
  const pick = (key) => installed.filter((a) => a.key === key);
  return [...pick("claude"), ...pick("codex"), ...installed.filter((a) => a.key !== "claude" && a.key !== "codex")];
}

// A Codex agent runs under its active account's CODEX_HOME. A leading ~ stays outside the quotes
// so the shell expands it; the account name is validated, so the rest is safe to quote.
export function codexLaunch(dir, run) {
  const words = (Array.isArray(run) ? run : []).filter((w) => typeof w === "string" && w);
  const command = `exec ${words.map(shellQuote).join(" ")}`;
  if (!dir) return command;
  const path = String(dir);
  const target = path.startsWith("~/") ? `"$HOME"/${shellQuote(path.slice(2))}` : shellQuote(path);
  return `CODEX_HOME=${target} ${command}`;
}

// One pure read of cca's porcelain, so the menu, rail and chip all see the same lists.
export function parsePorcelain(text) {
  const out = {
    current: "default", globalDefault: "default", session: null,
    accounts: [], models: [], labels: {},
    codex: { active: "default", accounts: [] },
  };
  const byName = {};
  const codexByName = {};
  const win = (u, at) => (/^\d+(\.\d+)?$/.test(u ?? "")
    ? { used: Number(u), reset: /^\d+$/.test(at ?? "") ? Number(at) : null } : null);
  const codexAccount = (name) => {
    if (name !== "default" && !ACCOUNT_NAME.test(name ?? "")) return null;
    let c = codexByName[name];
    if (!c) {
      c = { name, email: "", usage: null, plan: null, label: null };
      codexByName[name] = c;
      out.codex.accounts.push(c);
    }
    return c;
  };
  // ~/.codex is always offered, whether or not cca reported it.
  codexAccount("default");
  for (const line of String(text ?? "").split("\n")) {
    if (!line) continue;
    const f = line.split("\t");
    const kind = f[0];
    const name = f[1];
    if (kind === "C" && name) out.current = name;
    else if (kind === "D" && ACCOUNT_NAME.test(name ?? "")) out.globalDefault = name;
    else if (kind === "A" && ACCOUNT_NAME.test(name ?? "")) {
      if (!byName[name]) {
        byName[name] = { name, email: (f[2] ?? "").trim(), usage: null, label: null, plan: null };
        out.accounts.push(byName[name]);
      }
    } else if (kind === "M" && ACCOUNT_NAME.test(name ?? "")) {
      if (!byName[name]) {
        byName[name] = { name, kind: "model", command: (f[2] ?? "").trim(), resumable: f[3] === "1",
          label: null, usage: null, plan: null, resume: null };
        out.models.push(byName[name]);
      }
    } else if (kind === "E" && byName[name]?.kind === "model") {
      // The login a model runs on (cca's E line), so its badge shows that email.
      byName[name].email = (f[2] ?? "").trim();
    } else if (kind === "L" && name && (f[2] ?? "").trim()) {
      out.labels[name] = f[2].trim();
    } else if (kind === "U" && byName[name]) {
      byName[name].usage = { five: win(f[2], f[3]), seven: win(f[4], f[5]), fable: win(f[6], f[7]) };
    } else if (kind === "P" && byName[name]) {
      byName[name].plan = (f[2] ?? "").trim() || null;
    } else if (kind === "S" && SESSION_ID.test(name ?? "")) {
      out.session = { id: name, cwd: (f[2] ?? "").trim() };
    } else if (kind === "Y" && name && (name === "default" || ACCOUNT_NAME.test(name))) {
      out.codex.active = name;
    } else if (kind === "X") {
      const c = codexAccount(name);
      if (c) c.email = (f[2] ?? "").trim();
    } else if (kind === "V") {
      const c = codexAccount(name);
      if (c) c.usage = { five: win(f[2], f[3]), seven: win(f[4], f[5]), fable: null };
    } else if (kind === "Q") {
      const c = codexAccount(name);
      if (c) c.plan = (f[2] ?? "").trim() || null;
    }
  }
  for (const a of out.accounts) a.label = out.labels[a.name] ?? null;
  for (const m of out.models) m.label = out.labels[m.name] ?? null;
  for (const c of out.codex.accounts) c.label = out.labels[`codex:${c.name}`] ?? null;
  return out;
}

// The popup cannot resize after opening, so its height is the sum of the rows rendered from these
// lists: 12 px padding, a 24 px Agents header, one 40 px agent row each, the account sub-rows and
// their 28 px add rows, the 32 px Claude command row, a 24 px not-installed line, 13 px separators,
// the always-shown custom-command section, the resume section, and the 18 px hint line.
export function menuHeight({ agents = [], claudeAccounts = [], codexAccounts = [], models = [], resumeCount = 0, notInstalledCount = 0 } = {}) {
  const list = Array.isArray(agents) ? agents : [];
  const claude = list.some((a) => a?.key === "claude");
  const codex = list.some((a) => a?.key === "codex");
  const claudeList = Array.isArray(claudeAccounts) ? claudeAccounts : [];
  const codexList = Array.isArray(codexAccounts) ? codexAccounts : [];
  const modelList = Array.isArray(models) ? models : [];
  let height = 12 + 24 + list.length * 40;
  if (claude || claudeList.length) {
    height += claudeList.reduce((sum, a) => sum + accountRowHeight(a), 0);
    height += 28 + 32;
  }
  if (codex) {
    height += codexList.reduce((sum, a) => sum + accountRowHeight(a), 0);
    height += 28;
  }
  if (notInstalledCount > 0) height += 24;
  height += 13 + 24 + modelList.reduce((sum, m) => sum + accountRowHeight(m), 0) + 32;
  if (resumeCount > 0) height += 13 + 24 + resumeCount * 32;
  return height + 18;
}

// The popup's keys: ↑↓ move the highlight and wrap, ↩ and Space run the row shown, o opens the
// row shown in a new pane, and Esc cancels an open rename or start-command editor.
export function popupKey(key, at, count, editing) {
  if (key === "escape") return editing ? { at, cancelEdit: true, run: false, open: false } : null;
  if (editing || !(count > 0)) return null;
  if (key === "down") return { at: (at + 1) % count, cancelEdit: false, run: false, open: false };
  if (key === "up") return { at: (at - 1 + count) % count, cancelEdit: false, run: false, open: false };
  if (key === "enter" || key === "space") return { at: Math.min(at, count - 1), cancelEdit: false, run: true, open: false };
  if (key === "o") return { at: Math.min(at, count - 1), cancelEdit: false, run: false, open: true };
  return null;
}
// Badges widen with the rail (16 px each side, up to the rail's max of 320 px in
// layouts/x-mas-paper.json) and spell the account out once there is room.
export const POCKET_FULL_W = 150;
export function pocketWidth(railWidth) {
  return Math.min(320 - 32, Math.max(44, Math.floor((Number(railWidth) || 0) - 32)));
}
// A full badge is 120 px: a 6 px lanyard, a 4 px gap and a 110 px card. Too narrow for the name
// and meters, the badge falls back to a 52 px face card. The "rail-accounts" block of
// layouts/x-mas-paper.json is resized to hold every badge, 8 px apart and 8 px below.
const BADGE_H = 120;
const POCKET_H = 52;
export function pocketHeight(w) {
  return Number(w) >= POCKET_FULL_W ? BADGE_H : POCKET_H;
}
export function pocketBlock(count, w) {
  return Math.max(1, count) * (pocketHeight(w) + 8) + 8;
}

// Herdr's JS engine ignores toLocaleDateString's weekday option and prints the whole date.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// A rate-limit window past its reset time is spent: it counts as 0 % and has no reset time to show.
const liveWindow = (w) => (w?.reset && w.reset * 1000 <= Date.now() ? { used: 0, reset: null } : w);

// Clock time within a day, else the weekday.
const resetLabel = (at) => {
  const d = new Date(at * 1000);
  return d - Date.now() < 86400000
    ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    : WEEKDAYS[d.getDay()];
};

const USAGE_KEYS = { "5h": "five", "7d": "seven", Fable: "fable" };

// The two windows a card and the head show: Ultra has no 5h window, and its Fable week runs out first.
export function cardWindows(a) {
  const labels = /ultra/i.test(a?.plan ?? "") ? ["7d", "Fable"] : ["5h", "7d"];
  return labels.map((label) => [label, liveWindow(a?.usage?.[USAGE_KEYS[label]])]);
}

// An account whose 5h or 7d window is used up cannot start a session; the Fable week only blocks
// that one model, so it never makes the account sick. A spent window counts as empty (liveWindow).
export function blockedNow(a) {
  return ["five", "seven"].some((key) => {
    const w = liveWindow(a?.usage?.[key]);
    return w ? (w.used ?? 0) >= 100 : false;
  });
}

// When the last blocking window resets: blockedNow's two windows, so the card's Fable week never
// sets the time. A spent window counts as empty (liveWindow).
export function blockedUntil(a) {
  return ["five", "seven"]
    .map((key) => liveWindow(a?.usage?.[key]))
    .filter((w) => w && (w.used ?? 0) >= 100 && w.reset)
    .map((w) => w.reset).sort((x, y) => x - y).pop() ?? null;
}

// The popup lists every window the account reports, and the card's two even before any usage is read.
export function popupWindows(a) {
  const card = cardWindows(a).map(([label]) => label);
  return Object.keys(USAGE_KEYS).filter((label) => card.includes(label) || a?.usage?.[USAGE_KEYS[label]])
    .map((label) => [label, liveWindow(a?.usage?.[USAGE_KEYS[label]])]);
}

const MODEL_WINDOWS = ["5h", "7d"];
export function modelWindows(a) {
  return MODEL_WINDOWS
    .map((label) => [label, liveWindow(a?.usage?.[USAGE_KEYS[label]])])
    .filter(([, w]) => w);
}

// "7d 9% ↻ Fri", or "5h –" before the window has any usage.
export function windowText([label, w]) {
  if (!w) return `${label} –`;
  const pct = Math.round(w.used);
  return w.reset ? `${label} ${pct}% ↻ ${resetLabel(w.reset)}` : `${label} ${pct}%`;
}

// The popup's account row: a 52 px head, then a 22 px bar per window and 8 px below them. A model
// with no usage spends that bar's space on one "usage not tracked" line.
export const accountRowHeight = (a) => (a?.kind === "model"
  ? 52 + Math.max(1, modelWindows(a).length) * 22 + 8
  : 52 + popupWindows(a).length * 22 + 8);

const resetIcon = (px, color = TOKENS[appearance()].faint) => svg("mods/x-mas-paper-accounts/reset.svg").size(px).flex_none().text_color(color);

const FACES = 24;
// The account's face slot: the same FNV-1a id the cards and the rail use, so a reorder for the
// focused pane keeps faces.
export function faceIndex(key) {
  let h = 0x811c9dc5;
  for (const ch of String(key ?? "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % FACES;
}

export default class ClaudeAccounts extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.role = p.role ?? "menu";
    this.demo = p.demo === true;
    this.width = 0;
    this.blockPx = null;
    this.accounts = this.demo ? demoAccounts()
      : p.accounts?.length ? p.accounts : [{ name: "default", email: "", usage: null }];
    this.agents = Array.isArray(p.agents) ? p.agents : null;
    this.notInstalled = Array.isArray(p.notInstalled) ? p.notInstalled : [];
    this.codex = p.codex ?? null;
    this.current = p.current ?? "default";
    this.globalDefault = p.globalDefault ?? "default";
    this.session = p.session ?? null;
    this.readError = p.error ?? null;
    this.hover = null;
    this.rename = null;
    this.renameError = null;
    this.addEdit = null;
    this.actionError = null;
    this.keyboard = false;
    if (this.demo) {
      this.current = "Work";
      this.globalDefault = "Work";
      this.focusKey = this.currentKey = "demo";
      return;
    }
    if (this.role === "menu" && p.mode === "add") {
      this.cx = cx;
      this.nameInput = InputState.new({ value: "" });
      this.commandInput = InputState.new({ value: "" });
      this.nameInput.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      this.commandInput.on("change", (_e, cx) => { this.error = null; cx.notify(); });
      // There is no Tab handling on Input, so ↩ in the name moves on to the command while it is empty.
      this.nameInput.on("submit", () => {
        if (!(this.commandInput.value() ?? "").trim()) { this.commandInput.focus(); return; }
        this.addModel();
      });
      this.commandInput.on("submit", () => this.addModel());
      this.cancelHandle = cx.focus_handle();
      this.createHandle = cx.focus_handle();
      this.nameInput.focus();
      cx.timer.after(600, () => this.nameInput.focus());
      cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
      return;
    }
    if (this.role === "menu") {
      this.handle = cx.focus_handle();
      this.at = 0;
      this.launch = null;
      this.launchEdit = null;
      this.launchError = null;
      cx.timer.after(50, (cx) => { if (!this.rename && !this.addEdit && !this.launchEdit) this.handle.focus(); });
      cx.timer.every(FOCUS_WATCH_MS, (cx) => this.watchFocus(cx));
      cx.spawn(async (cx) => { this.launch = await readLaunch(); cx.notify(); });
    }
    if (!this.agents) {
      const cached = shared("new-menu.agents")?.[""];
      if (Array.isArray(cached)) this.agents = cached;
    }
    // knownAgents checks again at most once a minute; the menu needs the list before it opens.
    if (!Array.isArray(p.agents)) this.loadAgents(cx);
    cx.timer.every(60000, (cx) => this.loadAgents(cx));
    cx.timer.every(30000, (cx) => this.readAccounts(cx));
    this.readAccounts(cx);
  }

  loadAgents(cx) {
    cx.spawn(async (cx) => {
      let list = null;
      try { list = await knownAgents(); } catch {}
      if (!Array.isArray(list)) list = shared("new-menu.agents")?.[""];
      if (!Array.isArray(list)) return;
      this.agents = list;
      cx.notify();
    });
  }

  // The focused agent's pid when it is a local Claude Code process.
  focusedPid() {
    const f = focused();
    const a = agents().find((x) => x.focused || (f && (f.terminal === x.address || f.agent === x.address)));
    if (!a || a.address.includes("/")) return null;
    const t = terminals().find((x) => x.address === a.address);
    const claude = [t?.program?.key, t?.foreground?.name].some((n) => String(n ?? "").toLowerCase().includes("claude"));
    return claude ? t?.foreground?.pid ?? null : null;
  }

  readAccounts(cx, pid = this.focusedPid()) {
    if (this.demo || this.readingAccounts) return;
    this.focusKey = pid == null ? "" : String(pid);
    const key = this.focusKey;
    this.readingAccounts = true;
    cx.spawn(async (cx) => {
      let r = null;
      try {
        r = await exec("sh", this.focusKey ? [cca(), "--porcelain", this.focusKey] : [cca(), "--porcelain"]);
      } catch {}
      const p = parsePorcelain(r?.stdout ?? "");
      const accounts = p.accounts;
      const models = p.models;
      const resumes = await modelResumes();
      for (const m of models) m.resume = resumes[m.name] ?? null;
      accounts.push(...models);
      this.readingAccounts = false;
      if (accounts.length) {
        this.readError = null;
        this.accounts = accounts;
        if (this.role === "rail") this.syncBlock();
        this.current = p.current;
        this.currentKey = key;
        this.globalDefault = p.globalDefault;
        this.session = p.session?.cwd ? p.session : null;
        this.codex = p.codex;
      } else if (!r || r.code === 127) {
        this.readError = `cca not found: ${cca()} — reinstall the accounts mod`;
      }
      cx.notify();
      // A focus change that landed during the read is picked up here, not on the 30 s timer.
      const now = this.focusedPid();
      if ((now == null ? "" : String(now)) !== this.focusKey) this.readAccounts(cx, now);
    });
  }

  // Opens the chosen account's Claude Code in a pane beside the focused one; running agents keep their own account.
  openAgent(name) {
    if (!ACCOUNT_NAME.test(name)) return;
    this.withLaunch((command) => this.startPane(["sh", "-lc", launchFor(name, "", command)]));
  }

  // Closing the popup ends this copy of the mod, so a split asked for after the close never runs:
  // the pane is asked for first and the popup closes after it.
  startPane(argv) {
    run("pane.split", { direction: "right", argv });
    if (props().overlay) closeOverlay(props().overlay);
  }

  withLaunch(start) {
    if (this.launch) start(this.launch);
    else readLaunch().then(start);
  }

  openModel(model) {
    if (!ACCOUNT_NAME.test(model?.name ?? "")) return;
    run("pane.split", { direction: "right", argv: ["sh", "-lc", launchFor(model, "")] });
  }

  // The Claude account new sessions open as: the global default when it names one, else default.
  claudeDefault() {
    const name = this.globalDefault ?? "default";
    const list = this.accounts ?? [];
    return list.some((a) => a.kind !== "model" && a.name === name) ? name : "default";
  }

  codexState() {
    const c = this.codex;
    const accounts = Array.isArray(c?.accounts) && c.accounts.length
      ? c.accounts
      : [{ name: "default", email: "", usage: null, plan: null, label: null }];
    const active = c?.active === "default" || ACCOUNT_NAME.test(c?.active ?? "") ? c.active : "default";
    return { active, accounts };
  }

  // An account's label, with the system login named for what it is when it has no label.
  subDisplay(a) {
    return a?.label || (a?.name === "default" ? "System default" : (a?.name ?? ""));
  }

  editing() {
    return Boolean(this.rename || this.addEdit || this.launchEdit);
  }

  // A Codex pane starts under one account's CODEX_HOME; only the active one is used from the row.
  openCodex(active = this.codexState().active) {
    const agent = (this.agents ?? []).find((a) => a?.key === "codex" && a.installed !== false);
    if (!agent || !Array.isArray(agent.run)) return;
    const dir = active === "default" ? null : `~/.codex-accounts/${active}`;
    closeOverlay(props().overlay);
    run("pane.split", { direction: "right", argv: ["sh", "-lc", codexLaunch(dir, agent.run)] });
  }

  launchAgent(a) {
    if (!a || this.editing()) return;
    if (a.key === "claude") {
      this.openAgent(this.claudeDefault());
      return;
    }
    if (a.key === "codex") {
      this.openCodex();
      return;
    }
    if (!Array.isArray(a.run) || !a.run.length) return;
    closeOverlay(props().overlay);
    run("pane.split", { direction: "right", argv: a.run });
  }

  startAdd(kind, cx) {
    this.rename = null;
    this.renameError = null;
    this.launchEdit = null;
    this.launchError = null;
    this.actionError = null;
    this.hover = null;
    const input = InputState.new({ value: "" });
    input.on("submit", (_e, cx) => this.submitAdd(cx));
    this.addEdit = { kind, input };
    input.focus();
    cx.timer.after(300, () => { if (this.addEdit?.input === input) input.focus(); });
    cx.notify();
  }

  submitAdd(cx) {
    const edit = this.addEdit;
    if (!edit || this.adding) return;
    const name = (edit.input.value() ?? "").trim();
    const base = edit.kind === "codex" ? "~/.codex" : "~/.claude";
    if (!ACCOUNT_NAME.test(name)) { this.actionError = "Use letters, digits, - or _ only"; cx.notify(); return; }
    if (name === "default") { this.actionError = `default is the ${base} account — pick another name`; cx.notify(); return; }
    if (RESERVED.has(name) || name.startsWith("-")) { this.actionError = `${name} is a cca command — pick another name`; cx.notify(); return; }
    this.adding = true;
    this.actionError = null;
    cx.notify();
    if (edit.kind === "codex") this.createCodex(name, cx);
    else this.createClaude(name, cx);
  }

  createClaude(name, cx) {
    cx.spawn(async (cx) => {
      let r = null;
      try { r = await exec("sh", [cca(), "--porcelain-add", name]); } catch {}
      this.adding = false;
      if (!r || r.code !== 0) {
        this.actionError = errorText(r, "Could not create the account folder — check ~/.claude-accounts is writable");
        cx.notify();
        return;
      }
      this.addEdit = null;
      this.openAgent(name);
    });
  }

  createCodex(name, cx) {
    cx.spawn(async (cx) => {
      let r = null;
      try { r = await exec("sh", [cca(), "--porcelain-add-codex", name]); } catch {}
      this.adding = false;
      if (!r || r.code !== 0) {
        this.actionError = errorText(r, "Could not create the account folder — check ~/.codex-accounts is writable");
        cx.notify();
        return;
      }
      const dir = (r.stdout ?? "").trim();
      this.addEdit = null;
      closeOverlay(props().overlay);
      const target = dir ? shellQuote(dir) : `"$HOME"/.codex-accounts/${name}`;
      run("pane.split", { direction: "right",
        argv: ["sh", "-lc", `CODEX_HOME=${target} codex login; exec $SHELL -l`] });
    });
  }

  addModel() {
    if (this.addingModel) return;
    const label = (this.nameInput?.value() ?? "").trim();
    const command = (this.commandInput?.value() ?? "").trim();
    if (/[\t\r\n]/.test(command)) { this.error = "The start command must be one line"; this.cx.notify(); return; }
    this.addingModel = true;
    this.error = null;
    this.cx.notify();
    this.cx.spawn(async (cx) => {
      let r = null;
      try { r = await exec("sh", [cca(), "--porcelain-add-model", label, command]); } catch {}
      this.addingModel = false;
      if (!r || r.code !== 0) {
        this.error = errorText(r, "Could not add the model — check the models file is writable");
        cx.notify();
        return;
      }
      closeOverlay(props().overlay);
      this.readAccounts(cx);
    });
  }

  avatar(name, size, font) {
    const k = TOKENS[appearance()];
    return div().size(size).flex_none().rounded(size / 2).bg(k.raised).flex().items_center().justify_center()
      .text_size(font).font_family(FONT).font_bold().text_color(k.text).child([...(name || "?")][0]?.toUpperCase() ?? "?");
  }

  radio(on) {
    const k = TOKENS[appearance()];
    return h_flex().size(12).flex_none().rounded(6).border(1.5).border_color(on ? k.accent : k.line)
      .items_center().justify_center().role("radio_button").aria_selected(on)
      .when(on, (el) => el.child(div().size(6).rounded(3).bg(k.accent)));
  }

  accountChip() {
    const k = TOKENS[appearance()];
    const name = this.current ?? "default";
    const label = this.readError ? "?" : display(this.accounts.find((a) => a.name === name)) || name;
    return h_flex().id("head-accounts").h(26).flex_none().items_center().gap(6).pl(2).pr(10).rounded(13)
      .bg(k.surface).border(1).border_color(k.line)
      .hover((h) => h.bg(k.hover)).cursor_pointer().tooltip(this.readError ?? "Claude accounts")
      .on_click(() => this.openMenu())
      .child(this.avatar(label, 20, 11))
      .child(div().text_size(13).font_family(FONT).font_weight(600).text_color(k.text).child(label))
      .child(div().text_size(10).font_family(FONT).text_color(k.muted).child("▾"));
  }

  openMenu() {
    if (this.demo) return;
    const name = this.current ?? "default";
    const list = this.accounts?.length ? this.accounts : [{ name: "default", email: "", usage: null }];
    const resume = this.session ? list.filter((a) => a.name !== name && (a.kind !== "model" || a.resumable)) : [];
    const agents = orderAgents(this.agents).map((a) => ({
      key: a.key, name: a.name, icon: a.icon ?? null, tint: a.tint === true, run: Array.isArray(a.run) ? a.run : [],
    }));
    const notInstalled = (Array.isArray(this.agents) ? this.agents : [])
      .filter((a) => a && a.installed === false).map((a) => a.name).filter(Boolean);
    const codex = this.codexState();
    const height = this.readError ? 80 : Math.min(860, menuHeight({
      agents,
      claudeAccounts: list.filter((a) => a.kind !== "model"),
      codexAccounts: codex.accounts,
      models: list.filter((a) => a.kind === "model"),
      resumeCount: resume.length,
      notInstalledCount: notInstalled.length,
    }));
    openOverlay({ mod: "x-mas-paper-accounts", kind: "popup", width: 460, height,
      props: { role: "menu", current: name, globalDefault: this.globalDefault ?? "default",
        accounts: list, session: this.session, error: this.readError ?? null,
        agents, notInstalled, codex } });
  }

  // The block is as wide as the layout says; the chip keeps its place at the right end of the head.
  chip(cx) {
    const k = TOKENS[appearance()];
    const pid = this.focusedPid();
    if ((pid == null ? "" : String(pid)) !== this.focusKey) this.readAccounts(cx, pid);
    const list = this.accounts?.length ? this.accounts : [{ name: "default", email: "", usage: null }];
    const groups = [];
    for (const a of list) {
      if (groups.length) groups.push(div().w(1).h(16).flex_none().bg(k.line));
      groups.push(this.accountGauges(a));
    }
    return h_flex().size_full().items_center().justify_end().pr(20).gap(16)
      .children(groups)
      .child(this.accountChip());
  }

  accountGauges(a) {
    const k = TOKENS[appearance()];
    const me = a.name === this.current;
    return h_flex().flex_none().items_center().gap(8)
      .child(div().flex_none().text_size(12).font_family(FONT).font_bold().text_color(me ? k.text : k.faint).child(display(a)))
      .children(cardWindows(a).map(([label, w]) => this.gauge(a, label, w)));
  }

  // One rate-limit window as a fuel gauge: a 44 px bar with quarter ticks, the percentage and,
  // from 90 %, the reset time in red (clock time within a day, else the weekday).
  gauge(a, label, w) {
    const k = TOKENS[appearance()];
    const pct = w ? Math.min(100, Math.round(w.used)) : null;
    const hot = pct != null && pct >= 90;
    const when = w?.reset ? resetLabel(w.reset) : null;
    return h_flex().flex_none().gap(4).items_center()
      .tooltip(`${display(a)} ${label} window${pct == null ? ": no usage yet" : ` ${pct}% used`}`)
      .child(div().text_size(11).font_family(FONT).font_bold().text_color(k.faint).child(label))
      .child(div().relative().w(44).h(4).rounded(2).bg(k.line).overflow_hidden()
        .child(div().absolute().left(0).top(0).bottom(0).w(Math.round(((pct ?? 0) / 100) * 44)).rounded(2)
          .bg(meterColor(pct ?? 0)))
        .children([11, 22, 33].map((x) => div().absolute().left(x).top(0).bottom(0).w(1).bg(k.line))))
      .child(div().flex_none().text_size(12).font_family("Geist Mono")
        .text_color(hot ? k.danger : a.name === this.current ? k.text : k.muted)
        .child(pct == null ? "–" : `${pct}%`))
      .when(Boolean(hot && when), (el) => el.child(resetIcon(12)).child(div().flex_none().text_size(12)
        .font_family("Geist Mono").text_color(k.faint).child(when)));
  }

  // One 22 px line per window under the account's name: label and bar in the window's colour, the
  // percentage (red from 90 %) and the reset time.
  usageBars(a, hint = TOKENS[appearance()].faint) {
    return this.windowBars(popupWindows(a), hint);
  }

  modelUsageBars(m) {
    const k = TOKENS[appearance()];
    const windows = modelWindows(m);
    if (!windows.length) {
      return v_flex().w_full().flex_none().pl(54).pr(10).pb(8)
        .child(div().h(22).w_full().flex().items_center().text_size(11).font_family("Geist Mono")
          .text_color(k.faint).child("usage not tracked"));
    }
    return this.windowBars(windows, k.faint);
  }

  windowBars(windows, hint) {
    const k = TOKENS[appearance()];
    const mono = (text, color = hint) => div().flex_none().text_size(12).font_family("Geist Mono").text_color(color).child(text);
    return v_flex().w_full().flex_none().pl(54).pr(10).pb(8)
      .children(windows.map(([label, w]) => {
        const pct = w ? Math.min(100, Math.max(0, Math.round(w.used))) : null;
        const hot = pct != null && pct >= 90;
        return h_flex().h(22).w_full().items_center().gap(10)
          .child(div().w(40).flex_none().text_size(12).font_family(FONT).font_bold().text_color(k.muted).child(label))
          .child(div().flex_1().min_w(0).h(8).rounded(4).bg(k.line).overflow_hidden()
            .child(div().h_full().w(`${pct ?? 0}%`).rounded(4).bg(meterColor(pct ?? 0))))
          .child(div().w(40).flex_none().flex().justify_end()
            .child(mono(pct == null ? "–" : `${pct}%`, hot ? k.danger : k.text)))
          // Geist Mono has no ↻, and the fallback font draws it garbled, so the arrow is an icon.
          .child(h_flex().w(52).flex_none().gap(2).items_center()
            .when(Boolean(w?.reset), (el) => el.child(resetIcon(11, hint)).child(mono(resetLabel(w.reset)))));
      }));
  }

  // One staff-ID badge per account, stacked from the bottom. The focused Claude Code pane's
  // account goes on top and carries the accent "this pane" pill.
  rail(cx) {
    const pid = this.focusedPid();
    if ((pid == null ? "" : String(pid)) !== this.focusKey) this.readAccounts(cx, pid);
    const list = this.accounts?.length ? this.accounts : [{ name: "default", email: "", usage: null }];
    const here = railHere(this.focusKey, this.currentKey, this.current, this.heldHere);
    if (this.focusKey && this.currentKey === this.focusKey) this.heldHere = this.current;
    const ordered = [...list.filter((a) => a.name === here), ...list.filter((a) => a.name !== here)];
    const w = pocketWidth(this.width);
    return v_flex().id("rail-pockets").size_full().items_center().justify_end().gap(8).pb(8)
      .on_size_change((size, cx) => {
        if (size.width === this.width) return;
        this.width = size.width;
        this.syncBlock();
        cx.notify();
      })
      .children(ordered.map((a) => this.pocketAvatar(a, a.name === here, faceIndex(a.name), w)));
  }

  syncBlock() {
    const px = pocketBlock(this.accounts?.length ?? 1, pocketWidth(this.width));
    if (px === this.blockPx) return;
    this.blockPx = px;
    run("layout.resize", { id: "rail-accounts", px });
  }

  // A staff-ID badge hanging from a lanyard in the account's colour: the face, the name (a dot
  // when new sessions open as this account), the email, the plan and the next reset, then a meter
  // per rate-limit window.
  pocketAvatar(a, here, face, w = 44) {
    const t = TOKENS[appearance()];
    const accent = theme()?.accent ?? ACCOUNT_COLORS[0];
    const onAccent = theme()?.accent_foreground ?? t.accentText;
    const list = this.accounts ?? [a];
    const at = Math.max(0, list.findIndex((x) => x.name === a.name));
    const color = ACCOUNT_COLORS[at % ACCOUNT_COLORS.length];
    const windows = cardWindows(a);
    const bright = a.name === (this.globalDefault ?? "default");
    const tip = [display(a), ...windows.map(windowText), here ? "this pane" : null, bright ? "new sessions" : null]
      .filter(Boolean).join(" · ");
    const height = pocketHeight(w);
    const profile = w >= POCKET_FULL_W;
    const faceImg = (size) => div().size(size).flex_none().rounded(8).overflow_hidden()
      .child(image(`mods/x-mas-paper-accounts/faces/${face}.svg`).size_full());
    const pill = (text, bg, ink) => div().flex_none().px(6).py(2).rounded(6).bg(bg)
      .text_size(9).font_family(FONT).font_weight(900).text_color(ink).child(text);
    // Ultra's "Fable" needs a wider label lane than 5h/7d; both rows share it so the bars line up.
    const labelW = windows.some(([label]) => label.length > 2) ? 30 : 20;
    const meter = ([label, win]) => {
      const pct = win ? Math.min(100, Math.max(0, Math.round(win.used))) : null;
      return h_flex().h(10).w_full().items_center().gap(6)
        .child(div().w(labelW).flex_none().text_size(10).font_family(FONT).font_bold().text_color(t.muted).child(label))
        .child(div().flex_1().min_w(0).h(7).rounded(4).bg(t.line).overflow_hidden()
          .child(div().h_full().w(`${pct ?? 0}%`).rounded(4).bg(meterColor(pct ?? 0))))
        .child(div().w(30).flex_none().text_size(10).font_family("Geist Mono").text_color(t.muted)
          .child(pct == null ? "–" : `${pct}%`));
    };
    const resetAt = windows.map(([, win]) => win?.reset).filter(Boolean).sort((x, y) => x - y)[0];
    const head = h_flex().w_full().gap(8).items_center()
      .child(faceImg(38))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(4).items_center().min_w(0)
          .when(bright, (el) => el.child(div().flex_none().text_size(10).text_color(accent).child("●")))
          .child(div().min_w(0).truncate().text_size(13).font_family(FONT).font_bold().text_color(t.text)
            .child(display(a) || "?")))
        .child(div().min_w(0).truncate().text_size(10).font_family("Geist Mono").text_color(t.muted)
          .child(a.email || "not signed in")));
    const meta = h_flex().w_full().gap(6).items_center()
      .when(Boolean(a.plan), (el) => el.child(pill(a.plan, t.line, t.text)))
      .when(here, (el) => el.child(pill("this pane", accent, onAccent)))
      .child(div().flex_1())
      .when(Boolean(resetAt), (el) => el.child(h_flex().flex_none().gap(2).items_center()
        .child(resetIcon(10, t.muted))
        .child(div().text_size(10).font_family("Geist Mono").text_color(t.muted).child(resetLabel(resetAt)))));
    return v_flex().id(`rail-acct-${a.name}`).w(w).h(height).flex_none().gap(4).cursor_pointer()
      .tooltip(this.readError ?? tip)
      .on_click(() => this.openMenu())
      .child(div().h(6).w_full().flex_none().rounded(3).bg(color))
      .child(v_flex().flex_1().min_h(0).w_full().rounded(10).border(1).border_color(t.line).bg(t.card)
        .when(profile, (el) => el.p(10).gap(6)
          .children([head, meta, v_flex().w_full().gap(4).children(windows.map(meter))]))
        .when(!profile, (el) => el.items_center().justify_center().child(faceImg(30))));
  }

  // Resumes the focused agent's session under another account or model in a new pane; the old one
  // keeps running.
  continueAs(target, session) {
    const model = target && typeof target === "object" && target.kind === "model" ? target : null;
    const name = target && typeof target === "object" ? target.name : target;
    if (!ACCOUNT_NAME.test(name ?? "") || !SESSION_ID.test(session?.id ?? "") || !session?.cwd) return;
    const args = resumeArgs(model, session.id);
    if (!args) return;
    // pane.split takes no folder, so the shell changes into the session's cwd first.
    const cwd = `'${session.cwd.replace(/'/g, "'\\''")}'`;
    if (model) {
      this.startPane(["sh", "-lc", `cd ${cwd} && ${launchFor(model, args)}`]);
      return;
    }
    this.withLaunch((command) => this.startPane(["sh", "-lc", `cd ${cwd} && ${resumeOrStart(name, session.id, command)}`]));
  }

  startLaunchEdit(cx) {
    this.rename = null;
    this.renameError = null;
    this.addEdit = null;
    this.launchError = null;
    const input = InputState.new({ value: this.launch ?? DEFAULT_LAUNCH });
    input.on("submit", (_e, cx) => this.saveLaunch(cx));
    this.launchEdit = { input };
    input.focus();
    cx.timer.after(300, () => { if (this.launchEdit?.input === input) input.focus(); });
    cx.notify();
  }

  saveLaunch(cx) {
    const edit = this.launchEdit;
    if (!edit || this.savingLaunch) return;
    const value = (edit.input.value() ?? "").trim() || DEFAULT_LAUNCH;
    if (/[\n\r]/.test(value)) { this.launchError = "One line only — the command runs in a shell"; cx.notify(); return; }
    this.savingLaunch = true;
    cx.spawn(async (cx) => {
      let res = null;
      try {
        res = await exec("sh", [cca(), "launch", "set", value]);
      } catch {}
      this.savingLaunch = false;
      if (!res || res.code !== 0) {
        this.launchError = errorText(res, "Could not save the command — check the state folder is writable");
        cx.notify();
        return;
      }
      this.launch = value;
      this.launchEdit = null;
      this.handle.focus();
      cx.notify();
    });
  }

  // Makes the account new sessions start under; the popup stays open so the radio follows.
  useAccount(name, cx) {
    if (!ACCOUNT_NAME.test(name) || this.usingAccount) return;
    this.usingAccount = true;
    this.actionError = null;
    cx.spawn(async (cx) => {
      let r = null;
      try { r = await exec("sh", [cca(), "use", name]); } catch {}
      this.usingAccount = false;
      if (!r || r.code !== 0) {
        this.actionError = errorText(r, "Could not change the default account — check cca and retry");
        cx.notify();
        return;
      }
      this.readAccounts(cx);
      cx.notify();
    });
  }

  // The Codex half of useAccount; the popup stays open so the radio follows.
  useCodex(name, cx) {
    if (!ACCOUNT_NAME.test(name) || this.usingCodex) return;
    this.usingCodex = true;
    this.actionError = null;
    cx.spawn(async (cx) => {
      let r = null;
      try { r = await exec("sh", [cca(), "codex", "use", name]); } catch {}
      this.usingCodex = false;
      if (!r || r.code !== 0) {
        this.actionError = errorText(r, "Could not change the Codex account — check cca and retry");
        cx.notify();
        return;
      }
      this.readAccounts(cx);
      cx.notify();
    });
  }

  startRename(a, cx, key = a.name) {
    this.actionError = null;
    this.launchEdit = null;
    this.launchError = null;
    this.addEdit = null;
    this.renameError = null;
    this.hover = null;
    const input = InputState.new({ value: a.label || a.name || "" });
    input.on("submit", (_e, cx) => this.saveRename(cx));
    this.rename = { key, name: a.name, input };
    input.focus();
    cx.timer.after(300, () => { if (this.rename?.input === input) input.focus(); });
    cx.notify();
  }

  saveRename(cx) {
    const r = this.rename;
    if (!r || this.savingRename) return;
    const value = (r.input.value() ?? "").trim();
    this.savingRename = true;
    this.renameError = null;
    cx.spawn(async (cx) => {
      let res = null;
      try { res = await exec("sh", [cca(), "--porcelain-rename", r.key, value]); } catch {}
      this.savingRename = false;
      if (!res || res.code !== 0) {
        this.renameError = errorText(res, "Could not rename the account — try another name");
        cx.notify();
        return;
      }
      this.rename = null;
      this.readAccounts(cx);
      cx.notify();
    });
  }

  // readAccounts keeps the focused pane's pid in this.focusKey, so the ring's key has its own name.
  ringKey() {
    return `${this.keyboard ? 1 : 0}|${[this.handle, this.cancelHandle, this.createHandle]
      .map((handle) => (handle?.is_focused?.() ? 1 : 0)).join("")}`;
  }

  // A ring comes from is_focused(), and the shell redraws only on notify or reload; only the
  // keyboard draws it, since a click focuses the popup too.
  watchFocus(cx) {
    const key = this.ringKey();
    if (key === this.drawnFocus) return;
    this.drawnFocus = key;
    cx.notify();
  }

  focusedAt(index) {
    return this.keyboard && index === this.at && Boolean(this.handle?.is_focused?.());
  }

  accountsMenu() {
    const k = TOKENS[appearance()];
    if (this.readError) {
      return v_flex().id("accounts-menu").w_full().h_full().min_h(0).p(6).overflow_y_scroll()
        .bg(k.raised).border(1).border_color(k.line).rounded(10)
        .child(div().px(8).py(6).text_size(11).font_family(FONT).text_color(k.danger).child(this.readError));
    }
    const cur = this.current ?? "default";
    const list = this.accounts?.length ? this.accounts : [{ name: "default", email: "", usage: null }];
    const claudeAccounts = list.filter((a) => a.kind !== "model");
    const models = list.filter((a) => a.kind === "model");
    const codex = this.codexState();
    const agents = orderAgents(this.agents);
    const knownNotInstalled = (Array.isArray(this.agents) ? this.agents : [])
      .filter((a) => a && a.installed === false).map((a) => a.name).filter(Boolean);
    const notInstalled = knownNotInstalled.length ? knownNotInstalled : this.notInstalled;
    const resume = this.session
      ? list.filter((a) => a.name !== cur && (a.kind !== "model" || a.resumable))
      : [];
    const focusRows = [];

    const rows = [];
    let claudeShown = false;
    for (const a of agents) {
      rows.push(this.agentRow(a, focusRows));
      if (a.key === "claude") {
        claudeShown = true;
        for (const acct of claudeAccounts) rows.push(this.accountRow(acct, "claude", focusRows));
        rows.push(this.addAccountRow("claude", focusRows));
        rows.push(this.launchRow(focusRows));
      } else if (a.key === "codex") {
        for (const acct of codex.accounts) rows.push(this.accountRow(acct, "codex", focusRows));
        rows.push(this.addAccountRow("codex", focusRows));
      }
    }
    // The Claude accounts stay listed even when Herdr cannot start Claude itself.
    if (!claudeShown && claudeAccounts.length) {
      for (const acct of claudeAccounts) rows.push(this.accountRow(acct, "claude", focusRows));
      rows.push(this.addAccountRow("claude", focusRows));
      rows.push(this.launchRow(focusRows));
    }
    if (notInstalled.length) {
      rows.push(div().h(24).px(8).flex().items_center().truncate().text_size(11).font_family(FONT).text_color(k.faint)
        .child(`Not installed: ${notInstalled.join(", ")}`));
    }

    const root = v_flex().id("accounts-menu").w_full().h_full().min_h(0).p(6).overflow_y_scroll()
      .bg(k.raised).border(1).border_color(k.line).rounded(10)
      .track_focus(this.handle).tab_index(0)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .on_key_down((e, cx) => {
        const next = popupKey(e.key, this.at, focusRows.length, this.editing());
        if (!next) return;
        cx.stop_propagation();
        if (next.cancelEdit) {
          this.rename = null;
          this.renameError = null;
          this.addEdit = null;
          this.launchEdit = null;
          this.launchError = null;
          this.actionError = null;
          this.handle.focus();
          cx.notify();
          return;
        }
        this.keyboard = true;
        this.at = next.at;
        cx.notify();
        if (next.run) focusRows[this.at]?.run(cx);
        else if (next.open) focusRows[this.at]?.open?.(cx);
      })
      .child(div().h(24).px(8).flex().items_center().text_size(11).font_family(FONT).font_weight(600).text_color(k.faint)
        .child("Agents"))
      .children(rows);
    root.child(div().h(1).mx(2).my(6).bg(k.line))
      .child(div().h(24).px(8).flex().items_center().text_size(11).font_family(FONT).font_weight(600).text_color(k.faint)
        .child("Custom commands"))
      .children(models.map((m) => this.customRow(m, focusRows)))
      .child(this.addCustomRow(focusRows));
    if (resume.length) {
      root.child(div().h(1).mx(2).my(6).bg(k.line))
        .child(div().h(24).px(8).flex().items_center().text_size(11).font_family(FONT).font_weight(600).text_color(k.faint)
          .child("Continue this session as"))
        .children(resume.map((a) => this.resumeRow(a, focusRows)));
    }
    return root.child(this.hintRow(this.menuHint()));
  }

  menuHint() {
    if (this.actionError) return { text: this.actionError, error: true };
    if (this.renameError) return { text: this.renameError, error: true };
    if (this.launchError) return { text: this.launchError, error: true };
    if (this.rename) return { text: "↩ save · esc cancel" };
    if (this.addEdit) return { text: "↩ create · esc cancel" };
    if (this.launchEdit) return { text: "↩ save · esc cancel · empty = claude" };
    return null;
  }

  hintRow(hint) {
    const k = TOKENS[appearance()];
    return div().h(18).px(8).flex().items_center().truncate()
      .text_size(hint?.error ? 11 : 10)
      .font_family(hint?.error ? FONT : "Geist Mono")
      .text_color(hint?.error ? k.danger : k.faint)
      .child(hint?.text ?? "");
  }

  agentRow(a, focusRows) {
    const k = TOKENS[appearance()];
    const at = focusRows.push({ run: () => this.launchAgent(a), open: () => this.launchAgent(a) }) - 1;
    const icon = a.icon
      ? (a.tint ? svg(a.icon).size(16).text_color(k.text) : image(a.icon).size(16))
      : div().size(16).flex_none();
    const paneButton = h_flex().id(`pane-agent-${a.key}`).h(18).flex_none().items_center().px(4).rounded(6)
      .cursor_pointer().role("button").accessibility_label(`Open ${a.name} in a new pane`)
      .tooltip(`Open ${a.name} in a new pane`)
      .on_click((_e, cx) => { cx.stop_propagation(); this.launchAgent(a); })
      .child(div().text_size(11).font_family("Geist Mono").text_color(k.muted)
        .hover((h) => h.underline()).child("new pane"));
    return h_flex().id(`agent-${a.key}`).h(40).flex_none().px(8).gap(10).rounded(8).items_center().cursor_pointer()
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(`Start ${a.name} in a new pane`)
      .hover((h) => h.bg(k.hover))
      .tooltip(`Start ${a.name} in a new pane`)
      .on_click(() => this.launchAgent(a))
      .child(icon)
      .child(div().flex_1().min_w(0).truncate().text_size(14).font_family(FONT).font_bold().text_color(k.text).child(a.name))
      .child(paneButton);
  }

  accountRow(a, kind, focusRows) {
    const k = TOKENS[appearance()];
    const codex = kind === "codex";
    const key = codex ? `codex:${a.name}` : a.name;
    const on = codex ? a.name === this.codexState().active : a.name === this.claudeDefault();
    if (this.rename?.key === key) return this.renameRow(a, key, on, true);
    const tag = !codex && a.name === (this.current ?? "default");
    const hovered = this.hover === key;
    const select = (cx) => (codex ? this.useCodex(a.name, cx) : this.useAccount(a.name, cx));
    const open = () => (codex ? this.openCodex(a.name) : this.openAgent(a.name));
    const at = focusRows.push({ run: (cx) => select(cx), open }) - 1;
    return v_flex().id(`acct-${key}`).w_full().flex_none().rounded(8).cursor_pointer().pl(30).pr(8)
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(`New ${codex ? "Codex " : ""}sessions open as ${this.subDisplay(a)}`)
      .hover((h) => h.bg(k.hover))
      .on_hover((shown, cx) => {
        if (shown) this.hover = key;
        else if (this.hover === key) this.hover = null;
        cx.notify();
      })
      .tooltip(`New ${codex ? "Codex " : ""}sessions open as ${this.subDisplay(a)}`)
      .on_click((_e, cx) => { if (!this.editing()) select(cx); })
      .child(h_flex().h(52).flex_none().gap(8).items_center()
        .child(div().w(14).flex_none().flex().justify_center().child(this.radio(on)))
        .child(this.avatar(this.subDisplay(a), 20, 10))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().w_full().gap(8).items_center().min_w(0)
            .child(div().flex_none().truncate().text_size(13).font_family(FONT).font_bold().text_color(k.text)
              .child(this.subDisplay(a)))
            .when(tag, (el) => el.child(div().flex_none().text_size(11).font_family("Geist Mono")
              .text_color(k.muted).child("this pane"))))
          .child(div().truncate().text_size(12).font_family("Geist Mono").text_color(k.muted)
            .child(a.email || "not signed in")))
        .child(h_flex().w(16).flex_none().items_center()
          .when(hovered, (el) => el.child(h_flex().id(`pen-${key}`).size(16).flex_none().items_center()
            .justify_center().cursor_pointer()
            .on_click((_e, cx) => { cx.stop_propagation(); this.startRename(a, cx, key); })
            .child(svg("mods/x-mas-paper-accounts/pencil.svg").size(16).flex_none().text_color(k.muted))))))
      .child(this.usageBars(a));
  }

  renameRow(a, key, on, withRadio) {
    const k = TOKENS[appearance()];
    return v_flex().id(`acct-${key}`).w_full().flex_none().rounded(8).bg(k.selected)
      .pl(withRadio ? 30 : 8).pr(8)
      .child(h_flex().h(52).flex_none().gap(8).items_center()
        .when(withRadio, (el) => el.child(div().w(14).flex_none().flex().justify_center().child(this.radio(on))))
        .child(this.avatar(a.label || a.name, withRadio ? 20 : 24, withRadio ? 10 : 11))
        .child(Input.new(this.rename.input).h(28).flex_1().min_w(0).rounded(6).border(1)
          .border_color(k.accent).bg(k.raised).text_size(13).font_family(FONT).font_bold().text_color(k.text)))
      .child(a.kind === "model" ? this.modelUsageBars(a) : this.usageBars(a, k.muted));
  }

  addAccountRow(kind, focusRows) {
    const k = TOKENS[appearance()];
    const codex = kind === "codex";
    const id = codex ? "acct-add-codex" : "acct-add-claude";
    const text = codex ? "+ Add Codex account" : "+ Add Claude account";
    if (this.addEdit?.kind === kind) {
      return h_flex().id(id).h(28).flex_none().pl(30).pr(8).items_center()
        .child(Input.new(this.addEdit.input).h(24).flex_1().min_w(0).rounded(6).border(1)
          .border_color(k.accent).bg(k.raised).text_size(12).font_family("Geist Mono").text_color(k.text));
    }
    const at = focusRows.push({ run: (cx) => this.startAdd(kind, cx) }) - 1;
    return h_flex().id(id).h(28).flex_none().pl(30).pr(8).rounded(8).items_center().cursor_pointer()
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(text.replace("+ ", ""))
      .hover((h) => h.bg(k.hover))
      .on_click((_e, cx) => { if (!this.editing()) this.startAdd(kind, cx); })
      .child(div().text_size(12).font_family(FONT).font_weight(600).text_color(k.muted).child(text));
  }

  customRow(m, focusRows) {
    const k = TOKENS[appearance()];
    if (this.rename?.key === m.name) return this.renameRow(m, m.name, false, false);
    const hovered = this.hover === m.name;
    const open = () => { closeOverlay(props().overlay); this.openModel(m); };
    const at = focusRows.push({ run: open, open }) - 1;
    const paneButton = h_flex().id(`pane-${m.name}`).h(18).flex_none().items_center().px(4).rounded(6)
      .cursor_pointer().role("button").accessibility_label(`Open ${display(m)} in a new pane`)
      .tooltip(`Open ${display(m)} in a new pane`)
      .on_click((_e, cx) => { cx.stop_propagation(); open(); })
      .child(div().text_size(11).font_family("Geist Mono").text_color(k.muted)
        .hover((h) => h.underline()).child("new pane"));
    return v_flex().id(`acct-${m.name}`).w_full().flex_none().rounded(8).cursor_pointer().px(8)
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(`Start ${display(m)} in a new pane`)
      .hover((h) => h.bg(k.hover))
      .on_hover((shown, cx) => {
        if (shown) this.hover = m.name;
        else if (this.hover === m.name) this.hover = null;
        cx.notify();
      })
      .tooltip(`Start ${display(m)} in a new pane`)
      .on_click(() => { if (!this.editing()) open(); })
      .child(h_flex().h(52).flex_none().gap(8).items_center()
        .child(this.avatar(display(m), 24, 11))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().w_full().gap(8).items_center().min_w(0)
            .child(div().flex_none().text_size(14).font_family(FONT).font_bold().text_color(k.text).child(display(m)))
            .child(h_flex().flex_1().min_w(0).justify_end().child(paneButton)))
          .child(div().truncate().text_size(12).font_family("Geist Mono").text_color(k.muted).child(m.command || "?")))
        .child(h_flex().w(16).flex_none().items_center()
          .when(hovered, (el) => el.child(h_flex().id(`pen-${m.name}`).size(16).flex_none().items_center()
            .justify_center().cursor_pointer()
            .on_click((_e, cx) => { cx.stop_propagation(); this.startRename(m, cx); })
            .child(svg("mods/x-mas-paper-accounts/pencil.svg").size(16).flex_none().text_color(k.muted))))))
      .child(this.modelUsageBars(m));
  }

  addCustomRow(focusRows) {
    const k = TOKENS[appearance()];
    const open = () => {
      closeOverlay(props().overlay);
      openOverlay({ mod: "x-mas-paper-accounts", kind: "popup", width: 340, height: 340, props: { mode: "add" } });
    };
    const at = focusRows.push({ run: open }) - 1;
    return h_flex().id("custom-add").h(32).flex_none().pl(30).pr(8).rounded(8).items_center().cursor_pointer()
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label("Add custom command")
      .hover((h) => h.bg(k.hover))
      .on_click(open)
      .child(div().text_size(12).font_family(FONT).font_weight(600).text_color(k.muted).child("+ Add custom command…"));
  }

  resumeRow(a, focusRows) {
    const k = TOKENS[appearance()];
    const at = focusRows.push({ run: () => this.continueAs(a, this.session) }) - 1;
    return h_flex().id(`cont-${a.name}`).h(32).flex_none().px(8).rounded(8).gap(8).items_center().cursor_pointer()
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(`Resume this session as ${display(a)}`)
      .hover((h) => h.bg(k.hover)).tooltip(`Resume this session as ${display(a)}`)
      .on_click(() => this.continueAs(a, this.session))
      .child(div().w(14).flex_none())
      .child(this.avatar(display(a), 20, 10))
      .child(div().flex_1().min_w(0).truncate().text_size(13).font_family(FONT).font_bold().text_color(k.muted).child(display(a)))
      .child(div().flex_none().text_size(11).font_family("Geist Mono").text_color(k.muted).child("resume in pane"));
  }

  launchRow(focusRows = []) {
    const k = TOKENS[appearance()];
    const label = "Claude command";
    if (this.launchEdit) {
      return h_flex().id("acct-launch").h(32).flex_none().pl(30).pr(8).rounded(8).gap(8).items_center().bg(k.selected)
        .child(div().flex_none().text_size(12).font_family(FONT).font_weight(600).text_color(k.muted).child(label))
        .child(Input.new(this.launchEdit.input).h(26).flex_1().min_w(0).rounded(6).border(1)
          .border_color(k.accent).bg(k.raised).text_size(12).font_family("Geist Mono").text_color(k.text));
    }
    const at = focusRows.push({ run: (cx) => this.startLaunchEdit(cx) }) - 1;
    return h_flex().id("acct-launch").h(32).flex_none().pl(30).pr(8).rounded(8).gap(8).items_center().cursor_pointer()
      .when(this.focusedAt(at), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(`${label} ${this.launch ?? DEFAULT_LAUNCH}`)
      .hover((h) => h.bg(k.hover))
      .tooltip("The command resumed and new Claude sessions start with")
      .on_click((_e, cx) => this.startLaunchEdit(cx))
      .child(div().flex_none().text_size(12).font_family(FONT).font_weight(600).text_color(k.muted).child(label))
      .child(div().flex_1().min_w(0).truncate().text_size(12).font_family("Geist Mono").text_color(k.text)
        .child(this.launch ?? "…"))
      .child(svg("mods/x-mas-paper-accounts/pencil.svg").size(14).flex_none().text_color(k.muted));
  }

  addAgentView() {
    const k = TOKENS[appearance()];
    const button = (id, label, primary, handle, action) => h_flex().id(id).h(30).px(12).items_center().rounded(8).border(1)
      .border_color(primary ? k.accent : k.faint).bg(primary ? k.accent : k.raised)
      .text_color(k.text).text_size(12).font_family(FONT).font_weight(600).cursor_pointer()
      .when(Boolean(handle), (el) => el.track_focus(handle).tab_index(0))
      .when(Boolean(this.keyboard && handle?.is_focused?.()), (el) => el.border(2).border_color(k.accent))
      .role("button").accessibility_label(label)
      .when(primary, (el) => el.text_color(k.accentText).hover((h) => h.opacity(0.9)))
      .when(!primary, (el) => el.hover((h) => h.opacity(0.9)))
      .on_key_down((event, cx) => {
        if (event.key !== "enter" && event.key !== "space") return;
        this.keyboard = true;
        cx.stop_propagation();
        action(cx);
        cx.notify();
      })
      .on_click((_e, cx) => action(cx)).child(label);
    const label = (text) => div().text_size(11).font_family(FONT).font_weight(600).text_color(k.faint).child(text);
    const field = (state, mono = false) => Input.new(state).h(32).px(10).rounded(8).border(1).border_color(k.line)
      .bg(k.raised).text_size(mono ? 12 : 13).font_family(mono ? "Geist Mono" : FONT).text_color(k.text);
    return v_flex().id("account-add").w_full().min_h(0).p(12).gap(8)
      .bg(k.raised).border(1).border_color(k.line).rounded(10)
      .on_mouse_down("left", () => { this.keyboard = false; })
      .child(div().text_size(14).font_family(FONT).font_bold().text_color(k.text).child("Add custom command"))
      .child(label("Name"))
      .child(field(this.nameInput))
      .child(label("Start command"))
      .child(field(this.commandInput, true))
      .when(Boolean(this.error), (el) => el.child(div().text_size(11).font_family(FONT).text_color(k.danger).child(this.error)))
      .child(div().text_size(10).font_family("Geist Mono").text_color(k.faint)
        .child("runs in your shell, so functions like claude-gpt work · ↩ add · esc cancel"))
      .child(h_flex().justify_end().gap(8)
        .child(button("acct-cancel", "Cancel", false, this.cancelHandle, () => closeOverlay(props().overlay)))
        .child(button("acct-create", this.addingModel ? "Adding…" : "Add", true, this.createHandle, () => this.addModel())));
  }

  render(cx) {
    if (this.role === "chip") return this.chip(cx);
    if (this.role === "rail") return this.rail(cx);
    this.drawnFocus = this.ringKey();
    if (props()?.mode === "add") return this.addAgentView();
    return this.accountsMenu();
  }
}
