// Invented sessions in the shape scan.sh prints, for a layout that shows the village with no real
// work behind it (props { demo: true }): previews and a first look. Nine sessions, one for every
// picture the scene draws, and no company, repository or ticket names.
import { ackOf, lastActivityOf } from "./model.js";

const MIN = 60 * 1000;

const ROWS = [
  ["snow-api", "working", "Snow API warmup", "Warming the cache before the first snow.", 22],
  ["gift-tracker", "waiting", "Gift list sync", "Sync the wishlist to the new sheet?", 2],
  ["sleigh-router", "working", "Sleigh route tests", "Three route tests still to fix.", 9],
  ["cocoa-docs", "approve", "Cocoa guide", "Publish the cocoa guide to the site?", 5],
  ["elf-queue", "idle", "Queue retries", "Retries now back off for two minutes.", 3],
  ["star-ui", "idle", "Star toggle", "The tree topper toggles with the keyboard.", 11],
  ["bell-cli", "idle", "Bell CLI flags", "The bell flags are documented.", 45],
  ["wreath-sync", "idle", "Wreath sync", "Wreath colours match the new palette.", 6],
  ["sock-notes", "working", "Sock notes", "Sorting this week's notes by sock size.", 14],
];

// Sessions the person has already looked at; every other finished one is still an unread result.
const READ_IDS = new Set(["bell-cli", "wreath-sync"]);

export function demoSessions(now = Date.now()) {
  return ROWS.map(([id, kind, title, line, mins]) => ({
    t: "s",
    pid: null,
    sessionId: id,
    cwd: `/demo/${id}/${id}-demo`,
    name: null,
    kind: null,
    status: kind === "working" ? "busy" : kind === "approve" ? "waiting" : kind,
    waitingFor: kind === "approve" ? "permission prompt" : kind === "waiting" ? "reply" : null,
    startedAt: now - 90 * MIN,
    updatedAt: now - mins * MIN,
    statusUpdatedAt: now - mins * MIN,
    lastMeaningfulAt: now - mins * MIN,
    identity: { handoff: title },
    customTitle: title,
    lastSentence: line,
    background: { shells: 0, agents: 0, monitors: 0, total: 0 },
    completed: [],
    deadhd: null,
    pages: [],
    where: { kind: null },
    agent: "claude",
  }));
}

export function demoRead(sessions = demoSessions()) {
  return sessions.filter((raw) => READ_IDS.has(raw.sessionId)).map((raw) => ackOf(raw, lastActivityOf(raw)));
}
