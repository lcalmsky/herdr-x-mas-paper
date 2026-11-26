// The ChatGPT plan's rate limits come from the usage endpoint Codex itself asks, with the login in
// <home>/auth.json. Rollout logs only hold the snapshot of the last local Codex turn, so usage from
// the web, Work or another machine never reaches them; they are read only when the endpoint fails.

import { closeSync, openSync, readdirSync, readFileSync, readSync, realpathSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAIL_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 5;
const MAX_DAYS = 3;

const windowOf = (w) => {
  if (!w || w.used_percent == null) return null;
  const used = Number(w.used_percent);
  if (!Number.isFinite(used)) return null;
  const at = w.resets_at == null ? null : Number(w.resets_at);
  return { used, resets_at: Number.isFinite(at) ? at : null };
};

// The last event whose rate_limits carry a window: the newest line wins, and a line cut by the tail
// read is skipped because it cannot parse.
export function rateLimitsOf(text) {
  const lines = String(text ?? "").split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const rl = obj?.payload?.rate_limits;
    if (!rl || (!rl.primary && !rl.secondary)) continue;
    const five = windowOf(rl.primary);
    const seven = windowOf(rl.secondary);
    if (!five && !seven) continue;
    return { five, seven, plan: typeof rl.plan_type === "string" ? rl.plan_type : null };
  }
  return null;
}

// The endpoint's rate_limit carries the same two windows under other names.
export function liveLimitsOf(body) {
  const rl = body?.rate_limit;
  if (!rl) return null;
  const win = (w) => w && windowOf({ used_percent: w.used_percent, resets_at: w.reset_at });
  const five = win(rl.primary_window);
  const seven = win(rl.secondary_window);
  if (!five && !seven) return null;
  return { five, seven, plan: typeof body.plan_type === "string" ? body.plan_type : null };
}

// No token refresh here: refreshing rotates the refresh token Codex owns, so an expired login
// falls back to the rollouts until Codex refreshes it.
async function fetchLive(home) {
  const tokens = JSON.parse(readFileSync(join(home, "auth.json"), "utf8"))?.tokens;
  if (typeof tokens?.access_token !== "string") return null;
  const headers = { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json", "User-Agent": "codex_cli_rs" };
  if (typeof tokens.account_id === "string") headers["ChatGPT-Account-Id"] = tokens.account_id;
  const r = await fetch("https://chatgpt.com/backend-api/wham/usage", { headers, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  return liveLimitsOf(await r.json());
}

const subdirs = (path) => {
  try {
    return readdirSync(path, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => join(path, d.name)).sort().reverse();
  } catch {
    return [];
  }
};

// Day folders are YYYY/MM/DD, so descending names put the newest first.
function newestDayDirs(sessions) {
  const days = [];
  for (const year of subdirs(sessions)) {
    for (const month of subdirs(year)) {
      days.push(...subdirs(month));
      if (days.length >= MAX_DAYS) return days.slice(0, MAX_DAYS);
    }
  }
  return days.slice(0, MAX_DAYS);
}

function newestRollouts(days) {
  const files = [];
  for (const day of days) {
    let names = [];
    try { names = readdirSync(day).filter((n) => /^rollout-.*\.jsonl$/.test(n)); } catch { continue; }
    for (const name of names) {
      const path = join(day, name);
      try { files.push([statSync(path).mtimeMs, path]); } catch {}
    }
  }
  return files.sort((a, b) => b[0] - a[0]).slice(0, MAX_FILES).map(([, path]) => path);
}

function tailOf(path) {
  const size = statSync(path).size;
  const start = Math.max(0, size - TAIL_BYTES);
  const fd = openSync(path, "r");
  let text;
  try {
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    text = buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
  if (start > 0) {
    const nl = text.indexOf("\n");
    text = nl < 0 ? "" : text.slice(nl + 1);
  }
  return text;
}

// The login's email sits in auth.json's id_token payload; an absent token or unreadable file
// reads as no email.
export function emailOf(home) {
  try {
    const data = JSON.parse(readFileSync(join(String(home ?? ""), "auth.json"), "utf8"));
    const token = data?.tokens?.id_token;
    if (typeof token !== "string") return "";
    const payload = token.split(".")[1];
    if (!payload) return "";
    const body = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const email = JSON.parse(body)?.email;
    return typeof email === "string" ? email : "";
  } catch {
    return "";
  }
}

const print = (r) => {
  const cell = (w, key) => (w && w[key] != null ? String(w[key]) : "");
  const fields = [cell(r.five, "used"), cell(r.five, "resets_at"),
    cell(r.seven, "used"), cell(r.seven, "resets_at"), r.plan ?? ""];
  process.stdout.write(`${fields.join("\t")}\n`);
};

async function main() {
  try {
    const home = process.argv[2];
    if (home === "--email") {
      const email = emailOf(process.argv[3] ?? "");
      if (email) process.stdout.write(`${email}\n`);
      return;
    }
    if (!home) return;
    let live = null;
    try { live = await fetchLive(home); } catch {}
    if (live) { print(live); return; }
    for (const file of newestRollouts(newestDayDirs(join(home, "sessions")))) {
      let r = null;
      try { r = rateLimitsOf(tailOf(file)); } catch { continue; }
      if (!r) continue;
      print(r);
      return;
    }
  } catch {}
}

const entry = process.argv[1] && realpathSync(process.argv[1]);
if (entry === realpathSync(fileURLToPath(import.meta.url))) main();
