// A terminal-looking panel for preview pictures: one invented Claude Code exchange, drawn by a
// mod so a capture never shows a real terminal. Preview only, never installed.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, fonts, settings } from "herdr";

const LINE = 19;
const BLANK = null;
const RULE = "  ──────────────────────────────────────────────────────────────────────────────────────────────────────────";

const LINES = [
  [["snow-api ❯ ", "accent"], ["run the sleigh route tests and print the gift sync table", "ink"]],
  BLANK,
  [["● ", "accent"], ["I'll read the route suite and the gift tracker, then rerun it on the ridge.", "ink"]],
  [["  └ Read tests/sleigh/route.test.js (218 lines)", "dim"]],
  [["  └ Read src/gift/tracker.js (96 lines)", "dim"]],
  BLANK,
  [["● ", "accent"], ["Three routes still fail on the north ridge: retries run before the queue writes a gift row, so packs leave empty.", "ink"]],
  [["  └ Updated src/gift/tracker.js (+18 −6)", "dim"]],
  [["  └ Updated src/gift/queue.js (+4 −2)", "dim"]],
  BLANK,
  [["  ✓ ", "green"], ["sleigh route suite — branch snow-api-limit, 3 routes, 73 gifts, run at 04:12", "ink"]],
  [["  route          packages    gifts      avg latency   retries   backlog   result", "ink"]],
  [[RULE, "dim"]],
  [["  north-ridge    24 / 24     26 / 26    182 ms        3         2         PASS (2 fixed)", "ink"]],
  [["  cocoa-lane     18 / 18     19 / 19    141 ms        0         0         PASS", "ink"]],
  [["  chimney-run    31 / 31     28 / 28    209 ms        1         1         PASS", "ink"]],
  [[RULE, "dim"]],
  [["  ✓ ", "green"], ["3 of 3 routes pass · 73 gifts tracked · 9.4 s wall time · 0 dropped rows · retry window 2 min", "ink"]],
  BLANK,
  [["● ", "accent"], ["The queue now drains before the next bell, so every package has a pack when the sleigh leaves at dawn.", "ink"]],
  [["  └ Updated tests/sleigh/route.test.js (+34 −9) and src/gift/tracker.js (+21 −6)", "dim"]],
  BLANK,
  [["snow-api ❯ ", "accent"]],
];

export default class DemoTerm extends View {
  render(_cx) {
    const t = theme();
    const colors = { ink: t.foreground, dim: t.dim ?? t.muted, accent: t.accent, green: t.done ?? t.working };
    const font = fonts().includes("JetBrains Mono") ? "JetBrains Mono" : settings()?.font || "Menlo";
    const line = (parts) => h_flex().h(LINE).flex_none().items_start().whitespace_nowrap()
      .children(parts.map(([text, tone]) => div().font_family(font).text_size(13).line_height(`${LINE}px`)
        .text_color(colors[tone] ?? t.foreground).child(text)));
    return v_flex().id("x-mas-paper-demo-term").size_full().bg(t.background).rounded(12).px(16).py(14)
      .children(LINES.map((parts) => (parts ? line(parts) : div().h(LINE).flex_none())));
  }
}
