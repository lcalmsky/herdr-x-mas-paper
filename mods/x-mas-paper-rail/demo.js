// Invented rail data for preview pictures (props().demo): the office demo's spaces and sessions.
const MIN = 60 * 1000;
const SPACES = [
  { repo: "orbit-api", space: "orbit", key: "ORB-112", active: true, agents: [
    ["s-ada", "needs", "Auth cleanup", 14],
    ["s-cy", "working", "Refactor auth middleware", 22],
    ["s-ivy", "working", "Session store tests", 9],
    ["s-gus", "done", "Draft API docs", 19],
  ] },
  { repo: "lumen-web", space: "lumen", key: "LUM-58", agents: [
    ["s-ben", "approve", "Release 2.4", 3],
    ["s-dee", "working", "Write release notes", 8],
    ["s-hal", "idle", "Changelog sweep", 33],
  ] },
  { repo: "pebble-app", space: "pebble", agents: [
    ["s-eli", "working", "Profile cold start", 41],
    ["s-fay", "done", "Bump dependencies", 2],
  ] },
  { repo: null, space: "kite", agents: [
    ["s-jo", "working", "Map tile cache", 5],
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
        title: id, seq: 0, pinned: false, focused: id === "s-cy" });
      places[id] = s.key ? { key: s.key, rest: s.space, topic, slack: false } : { topic };
      since[id] = now - mins * MIN;
    }
  });
  return { rows, list, places, since };
}
