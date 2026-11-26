// An editor pane: opens the file `hv` names, saves only onto the text it read, and previews markdown.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView } from "gpui-base";
import { home, props, readTextFile, writeTextFile, settings, theme, nextCommand, focused, panes, run } from "herdr";

const TOKENS = {
  light: { text: "#3A3530", t2: "#3A3530B3", muted: "#3A353099", faint: "#D9C3A0", line: "#F1E6D2", surface: "#FFFDF8", raised: "#FBF8F2", hover: "#E9DEC8", selected: "#F1E6D2", accent: "#C8423B", accentText: "#FFFDF8", danger: "#C8423B", ok: "#3F6B4F", warn: "#D9C3A0" },
  dark: { text: "#DCE3EE", t2: "#DCE3EEB3", muted: "#DCE3EE99", faint: "#25324F", line: "#25324F", surface: "#18203A", raised: "#1E2A44", hover: "#26334F", selected: "#25324F", accent: "#F2C46D", accentText: "#1E2A44", danger: "#FFB24A", ok: "#F2C46D", warn: "#FFB24A" },
};
const CLEAR = "#00000000";

function appearance() {
  const bg = String(theme()?.background ?? "#ffffff").replace("#", "");
  if (bg.length < 6) return "light";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45 ? "dark" : "light";
}

const LANG = {
  ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js",
  toml: "yaml", jsonc: "json", svelte: "html", vue: "html",
  py: "python", sh: "bash", bash: "bash", zsh: "bash",
  yml: "yaml", md: "markdown", markdown: "markdown", sql: "sql", rs: "rust",
};

export function languageOf(path) {
  const name = String(path ?? "").split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return LANG[ext] ?? ext;
}

export function isBinary(text) {
  return String(text ?? "").includes("\0");
}

export function fileLabel(path) {
  const parts = String(path ?? "").split(/[\\/]/);
  const name = parts.pop() ?? "";
  let dir = parts.join("/");
  const root = home();
  if (root && (dir === root || dir.startsWith(root + "/"))) dir = "~" + dir.slice(root.length);
  return { name, dir };
}

// A mod pane gets no pane id in its props; the button that asks is clicked, so the pane holds the focus.
export function ownPane(paneList, focus) {
  const pane = focus?.pane ? paneList.find((p) => p.pane === focus.pane) : null;
  if (!pane || pane.mod !== "x-mas-paper-editor") return null;
  return paneList.filter((p) => p.tab === pane.tab).length > 1 ? pane.pane : null;
}

export default class EditorView extends View {
  init(given, cx) {
    const spec = given ?? props() ?? {};
    this.file = typeof spec.file === "string" ? spec.file : null;
    this.inTab = spec.tab === true;
    this.original = null;
    this.editor = null;
    this.dirty = false;
    this.mode = "code";
    this.message = this.file ? null : "No file";
    this.stale = null;
    this.handle = cx.focus_handle();
    if (this.file) this.load(cx);
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "save") this.save(cx);
        else if (command === "focus") { this.handle.focus(); cx.notify(); }
      }
    });
  }

  load(cx) {
    const file = this.file;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(file);
        if (this.file !== file) return;
        if (text === null) this.mount("", null);
        else if (isBinary(text)) this.fail("Binary file · no editor");
        else this.mount(text, text);
      } catch {
        if (this.file !== file) return;
        this.fail("Cannot open this file");
      }
      cx.notify();
    });
  }

  fail(message) {
    this.editor?.release();
    this.editor = null;
    this.original = null;
    this.dirty = false;
    this.message = message;
  }

  mount(value, original) {
    this.editor?.release();
    const t = theme();
    this.editor = EditorState.new({
      language: languageOf(this.file), value, readonly: false,
      font_family: settings().font_family, font_size: 13,
      syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 },
    });
    this.original = original;
    this.dirty = false;
    this.message = null;
    this.stale = null;
    this.editor.on("change", (_event, cx) => {
      this.dirty = (this.editor?.value() ?? "") !== (this.original ?? "");
      cx.notify();
    });
  }

  toTab(cx) {
    const pane = ownPane(panes(), focused()), file = this.file;
    if (!pane || !file) return;
    const move = () => {
      try {
        run("tab.new", { name: fileLabel(file).name, mod: "x-mas-paper-editor", props: { file, tab: true } });
        run("pane.close", { pane });
      } catch (error) {
        this.stale = `Not moved: ${String(error?.message ?? error)}`;
      }
    };
    if (this.dirty) this.save(cx, move);
    else move();
  }

  save(cx, then) {
    const editor = this.editor;
    if (!editor || !this.file) return;
    const file = this.file, value = editor.value();
    cx.spawn(async (cx) => {
      let saved = false;
      try {
        await writeTextFile(file, value, this.original);
        this.original = value;
        this.dirty = (this.editor?.value() ?? "") !== value;
        this.stale = null;
        saved = true;
      } catch (error) {
        const reason = String(error?.message ?? error);
        this.stale = /changed outside/i.test(reason) ? "File changed on disk" : `Not saved: ${reason}`;
      }
      if (saved && !this.dirty) then?.();
      cx.notify();
    });
  }

  reload(cx) {
    const file = this.file;
    if (!file) return;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(file);
        if (this.file !== file) return;
        if (text !== null && isBinary(text)) this.fail("Binary file · no editor");
        else {
          this.editor?.set_value(text ?? "");
          this.original = text;
          this.dirty = false;
          this.stale = null;
          this.message = null;
        }
      } catch {
        this.stale = "Cannot read this file";
      }
      cx.notify();
    });
  }

  render() {
    const k = TOKENS[appearance()];
    const label = this.file ? fileLabel(this.file) : { name: "", dir: "" };
    const markdown = languageOf(this.file) === "markdown";
    const toggle = (id, text, mode) => div().id(id).h(22).px(8).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
      .text_size(12).bg(this.mode === mode ? k.hover : CLEAR).text_color(this.mode === mode ? k.text : k.muted)
      .on_click((_event, cx) => { this.mode = mode; cx.notify(); }).child(text);
    return v_flex().id("x-mas-paper-editor").size_full().min_h(0).rounded(10).overflow_hidden()
      .bg(k.surface).border(1).border_color(k.line).text_color(k.text).text_size(13).font_family("Nunito")
      .track_focus(this.handle).tab_index(0)
      .on_key_down((event, cx) => {
        if (event.keystroke !== "cmd-s") return;
        cx.stop_propagation();
        this.save(cx);
      })
      .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(k.line)
        .child(div().flex_none().font_semibold().child(label.name))
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(k.muted).child(label.dir))
        .when(this.dirty, (el) => el.child(div().size(7).flex_none().rounded(4).bg(k.accent)))
        .when(markdown, (el) => el.child(h_flex().flex_none().gap(2)
          .child(toggle("editor-code", "Code", "code"))
          .child(toggle("editor-preview-mode", "Preview", "preview"))))
        .when(Boolean(this.file) && !this.inTab, (el) => el.child(div().id("editor-to-tab").h(22).px(8).flex_none().flex().items_center().justify_center()
          .rounded(6).cursor_pointer().text_size(12).text_color(k.muted).hover((s) => s.bg(k.hover).text_color(k.text))
          .on_click((_event, cx) => this.toTab(cx)).child("Open as tab")))
        .when(Boolean(this.file), (el) => el.child(div().id("editor-save").h(22).px(10).flex_none().flex().items_center().justify_center()
          .rounded(6).cursor_pointer().text_size(12).font_semibold().bg(k.accent).text_color(k.accentText)
          .hover((s) => s.opacity(0.9))
          .on_click((_event, cx) => this.save(cx)).child("Save"))))
      .when(Boolean(this.stale), (el) => el.child(h_flex().h(30).flex_none().px(12).gap(8).items_center().border_b(1).border_color(k.line)
        .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(k.text).child(this.stale))
        .child(div().id("editor-reload").h(22).px(8).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer()
          .text_size(12).text_color(k.muted).hover((s) => s.bg(k.hover).text_color(k.text))
          .on_click((_event, cx) => this.reload(cx)).child("Reload"))))
      .child(this.editor
        ? (markdown && this.mode === "preview"
          ? div().flex_1().min_h(0).overflow_y_scrollbar().p(16)
            .child(TextView.markdown("editor-preview", this.editor.value()).scrollable(true))
          : div().flex_1().min_h(0).child(Editor.new(this.editor).flex_1().min_h(0)))
        : div().p(12).text_size(12).text_color(k.muted).child(this.message ?? "Loading file…"));
  }
}
