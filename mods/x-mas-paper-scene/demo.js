// Invented sessions in the shape scan.sh prints, for a layout that shows the village with no real
// work behind it (props { demo: true }): previews and a first look. Eight sessions in the order the
// approved picture seats them, and no company, repository or ticket names.
import { ackOf, lastActivityOf } from "./model.js";

const MIN = 60 * 1000;

const ROWS = [
  ["notes", "waiting", "The release notes are ready for a last look.", 6],
  ["web-app", "busy", "Warming the app shell before the first snow.", 0],
  ["api", "idle", "The gift list endpoint returns the first page.", 4],
  ["docs", "idle", "The cocoa guide builds green.", 75],
  ["design", "busy", "Sketching a folding gift card.", 0],
  ["deploy", "idle", "The preview deploy is up and warm.", 5],
  ["chat", "busy", "Drafting a short reply to the thread.", 0],
  ["scratch", "idle", "The scratch notes are filed away.", 40],
];

// Sessions the person has already looked at; every other finished one is still an unread result.
const READ_IDS = new Set(["docs", "deploy", "scratch"]);

export function demoSessions(now = Date.now()) {
  return ROWS.map(([id, kind, line, mins]) => ({
    t: "s",
    pid: null,
    sessionId: id,
    cwd: `/demo/${id}`,
    name: null,
    kind: null,
    status: kind === "busy" ? "busy" : kind,
    waitingFor: kind === "waiting" ? "reply" : null,
    startedAt: now - 90 * MIN,
    updatedAt: now - mins * MIN,
    statusUpdatedAt: now - mins * MIN,
    lastMeaningfulAt: now - mins * MIN,
    identity: { handoff: id },
    customTitle: id,
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
