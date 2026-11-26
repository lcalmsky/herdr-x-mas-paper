// A terminal-looking panel for preview pictures: one invented Claude Code exchange, drawn by a
// mod so a capture never shows a real terminal. Preview only, never installed.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, fonts, settings } from "herdr";

const LINE = 19;
const BLANK = null;

const LINES = [
  [["snow-api ❯ ", "accent"], ["make the gift list sync retry twice", "ink"]],
  BLANK,
  [["● ", "accent"], ["I'll read the sync job and the queue it uses first.", "ink"]],
  [["  └ Read src/gift/sync.js (74 lines)", "dim"]],
  [["  └ Read src/gift/queue.js (41 lines)", "dim"]],
  BLANK,
  [["● ", "accent"], ["The queue already backs off on its own, so failed rows", "ink"]],
  [["  go through it now.", "ink"]],
  [["  └ Updated src/gift/sync.js (+14 −3)", "dim"]],
  [["  └ Updated src/gift/sync.test.js (+26)", "dim"]],
  BLANK,
  [["✓ ", "green"], ["9 gift sync tests pass — 1.8 s", "ink"]],
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
