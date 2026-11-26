// Placeholder for the x-mas-paper scene: the band is painted with the palette's ground colour and
// tells how many agent sessions scan.sh found. The room drawing goes here later.
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { appHome, exec, theme } from "herdr";

const TOKENS = {
  light: { ground: "#FBF8F2", text: "#3A3530", muted: "#D9C3A0" },
  dark: { ground: "#1E2A44", text: "#DCE3EE", muted: "#FFB24A" },
};
const POLL_MS = 3000;

function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}

// scan.sh prints one JSON object per line: {t:"s", ...} for each session, then one {t:"meta", ...}.
export function sessionCount(output) {
  let count = 0;
  for (const line of String(output ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      if (JSON.parse(line)?.t === "s") count += 1;
    } catch {}
  }
  return count;
}

export default class Scene extends View {
  init(_props, cx) {
    this.sessions = null;
    this.error = null;
    this.scanning = false;
    cx.timer.every(POLL_MS, (cx) => this.poll(cx));
    this.poll(cx);
  }

  poll(cx) {
    if (this.scanning) return;
    this.scanning = true;
    cx.spawn(async (cx) => {
      try {
        const result = await exec("sh", [`${appHome()}/mods/x-mas-paper-scene/scan.sh`]);
        if (result.code !== 0) {
          throw new Error((result.stderr || result.stdout || "").trim() || `scan.sh exited ${result.code}`);
        }
        this.sessions = sessionCount(result.stdout);
        this.error = null;
      } catch (error) {
        this.error = String(error?.message ?? error);
      }
      this.scanning = false;
      cx.notify();
    });
  }

  render() {
    const k = TOKENS[appearance()];
    const sessions = this.sessions;
    const label = this.error
      ? this.error
      : sessions === null ? "Reading sessions…" : `${sessions} session${sessions === 1 ? "" : "s"}`;
    return v_flex().id("scene").size_full().items_center().justify_center().bg(k.ground)
      .child(div().text_size(12).text_color(this.error ? k.muted : k.text).child(label));
  }
}
