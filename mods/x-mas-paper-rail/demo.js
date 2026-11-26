// Invented rail data for preview pictures (props().demo): the scene demo's sessions, grouped under
// the repositories they are made up to work in.
const MIN = 60 * 1000;
const SPACES = [
  { repo: "north-pole", space: "snow", key: "SNOW-24", active: true, agents: [
    ["snow-api", "working", "Snow API warmup", 22],
    ["gift-tracker", "needs", "Gift list sync", 2],
    ["sleigh-router", "working", "Sleigh route tests", 9],
    ["elf-queue", "done", "Queue retries", 3],
  ] },
  { repo: "cocoa-house", space: "cocoa", key: "COCOA-7", agents: [
    ["cocoa-docs", "approve", "Cocoa guide", 5],
    ["wreath-sync", "idle", "Wreath sync", 6],
    ["star-ui", "done", "Star toggle", 11],
  ] },
  { repo: "chimney-tools", space: "chimney", key: "CHIM-3", agents: [
    ["bell-cli", "idle", "Bell CLI flags", 45],
    ["sock-notes", "working", "Sock notes", 14],
  ] },
];

export function demoRail(now = Date.now()) {
  const rows = [], list = [], places = {}, since = {};
  SPACES.forEach((s) => {
    const tab = { id: `demo-${s.space}-tab`, name: "1", named: true, active: true };
    const space = { id: `demo-${s.space}`, name: s.space, named: true, machine: null, branch: null,
      active: Boolean(s.active), status: null, tabs: [tab] };
    rows.push({ space, mine: [], repo: s.repo ? { common: `/demo/${s.repo}`, base: true } : null, idle: [] });
    for (const [id, status, topic, mins] of s.agents) {
      list.push({ address: id, pane: `demo-${s.space}-pane`, space: space.id, space_name: s.space, tab: tab.id,
        tab_index: 0, tab_name: "1", status, app: "claude-code", program: { name: "Claude Code", agent: true },
        title: id, seq: 0, pinned: false, focused: id === "snow-api" });
      places[id] = { key: s.key, rest: s.space, topic, slack: false };
      since[id] = now - mins * MIN;
    }
  });
  return { rows, list, places, since };
}
