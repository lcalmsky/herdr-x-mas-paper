// Invented accounts for preview pictures (props().demo): no cca run, no real email or usage.
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const ROWS = [
  ["Work", "work@example.com", "Max", 62, 38, [15, 20]],
  ["Side", "side@example.com", "Pro", 91, 74, [13, 5]],
  ["Codex", "dev@example.com", "Plus", 12, 20, [18, 40]],
];

// The 5h window resets today at the given clock time (tomorrow once that has passed); the weekly
// window is far enough out that the badge always shows the 5h time.
function resetAt(now, [hours, minutes]) {
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= now) at.setDate(at.getDate() + 1);
  return Math.floor(at.getTime() / 1000);
}

export function demoAccounts(now = Date.now()) {
  const later = Math.floor((now + 3 * DAY) / 1000);
  return ROWS.map(([name, email, plan, five, seven, clock]) => ({
    name, email, plan,
    usage: { five: { used: five, reset: resetAt(now, clock) }, seven: { used: seven, reset: later } },
  }));
}
