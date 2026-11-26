// Modified from Herdr's shipped `pane` mod (Apache License 2.0, see LICENSE in this folder):
// the header's top corners are rounded to the 12 px pane frame, so its fill does not square them off
// on the chrome ground.
// A pane's header, for layouts that frame their panes:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "pane" } } } }
// Shows the program's icon (the app's program table), the agent's name or
// the terminal's title, the folder, and the agent's status; buttons split, zoom and close
// this pane. Props from the app: { pane, terminal }. Click: focus the pane.

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, home } from "herdr";

const TOKENS = {
  light: { text: "#3A3530", t2: "#3A3530B3", muted: "#3A353099", faint: "#D9C3A0", line: "#F1E6D2", surface: "#FFFDF8", raised: "#FBF8F2", hover: "#E9DEC8", selected: "#F1E6D2", accent: "#C8423B", accentText: "#FFFDF8", danger: "#C8423B", ok: "#3F6B4F", warn: "#D9C3A0" },
  dark: { text: "#DCE3EE", t2: "#DCE3EEB3", muted: "#DCE3EE99", faint: "#25324F", line: "#25324F", surface: "#18203A", raised: "#1E2A44", hover: "#26334F", selected: "#25324F", accent: "#F2C46D", accentText: "#1E2A44", danger: "#FFB24A", ok: "#F2C46D", warn: "#FFB24A" },
};

function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function folder(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") ? "~" + cwd.slice(h.length) : cwd;
}

// The invented pane of preview pictures (props().demo).
const DEMO_PANE = { pane: "demo", terminal: null, title: "claude — orbit", cwd: null, branch: "auth-cleanup",
  program: null, status: null, focused: true, zoomed: false };

export default class Pane extends View {
  init() { this.hovered = false; }

  me() {
    if (props()?.demo === true) return DEMO_PANE;
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(k, id, icon, command, args) {
    return div()
      .id(id)
      .p(2)
      .rounded(6)
      .text_color(k.muted)
      .hover((s) => s.bg(k.hover).text_color(k.text))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/x-mas-paper-pane/${icon}.svg`).size(14));
  }

  render(cx) {
    const k = TOKENS[appearance()];
    const demo = props()?.demo === true;
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const pic = icon(p.program, 14, k.muted);
    const st = p.status;
    const pane = p.pane;
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      .px(10)
      .gap(8)
      .items_center()
      .rounded_tl(12)
      .rounded_tr(12)
      .bg(k.surface)
      .border_b(1)
      .border_color(k.line)
      .text_size(12)
      .font_family("Nunito")
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => { if (!demo) run("pane.focus", { pane }); })
      .when(Boolean(pic), (el) => el.child(pic))
      .child(div().flex_none().truncate().max_w(260).font_semibold().text_color(p.focused ? k.text : k.muted).child(name))
      .when(Boolean(p.branch), (el) => el.child(h_flex().flex_none().h(18).px(6).rounded(5).items_center()
        .bg(k.raised).border(1).border_color(k.line)
        .child(div().text_size(11).font_family("Geist Mono").text_color(k.muted).child(`⎇ ${p.branch}`))))
      .child(div().flex_1().truncate().text_color(k.muted).child(folder(p.cwd)))
      .when(st === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(k.warn).spin(900)))
      .when(st === "blocked", el => el.child(div().flex_none().px(6).h(18).flex().items_center().rounded(5).bg(k.danger + "26").text_size(10).font_semibold().text_color(k.danger).child("Needs you")))
      .when(st === "done", el => el.child(div().size(7).flex_none().rounded(4).bg(k.ok)))
      .when(this.hovered && !demo, el => el
        .child(this.button(k, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(k, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(k, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(k, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
