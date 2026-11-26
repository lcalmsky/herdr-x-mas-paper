// A chainable stand-in for gpui elements: every builder method returns the element itself.
// Each element remembers its id; setting globalThis.uiTooltips to an array turns on tooltip recording,
// globalThis.uiIds to an array records every id given to an element, and globalThis.uiClicks to a
// Map keeps each element's on_click handler under its id, globalThis.uiHovers as a Map keeps each
// element's on_hover handler under its id, globalThis.uiBg as an array records every
// bg() argument as [id, value], globalThis.uiSizes as a Map keeps each id's w()/h() as { w, h }.
// globalThis.uiNodes as a Map records a tree:
// each element with an id maps to { id, src, texts (the strings given to child), bg (the last bg value),
// ink (the last text_color value), calls: [[name, ...args]] for opacity/transition/loop/left/top,
// kids: child nodes given to child() or children() }; an image's node carries its path as src. globalThis.uiHandlers as a Map keeps each
// id's gesture handlers under their names (on_pinch, on_scroll_wheel, on_mouse_move, on_key_down, on_click,
// on_hover, on_mouse_down:<button>, on_mouse_up:<button>), and globalThis.uiCursors as a Map keeps each id's
// cursor_* calls. globalThis.uiMethods as a Set records every string
// property name read on an element, so a render can be checked against the methods gpui-kit really has.
let inRow = false;
const nodes = new WeakMap();
const MOTION = new Set(["opacity", "transition", "loop", "left", "top"]);
class UiNode { id = null; src = null; texts = []; bg = null; calls = []; kids = []; }
const keepHandler = (ctx, name, handler) => {
  if (!(globalThis.uiHandlers instanceof Map) || ctx.id === undefined) return;
  const slot = globalThis.uiHandlers.get(ctx.id) ?? {};
  slot[name] = handler;
  globalThis.uiHandlers.set(ctx.id, slot);
};
const element = (ctx = {}, carried = null) => {
  let node = carried instanceof UiNode ? carried : null;
  if (!node && globalThis.uiNodes instanceof Map) node = new UiNode();
  const el = new Proxy(function () {}, {
    get: (target, key) => {
      if (key === "then") return undefined;
      if (globalThis.uiMethods instanceof Set && typeof key === "string") globalThis.uiMethods.add(key);
      if (node && key === "child") return (c) => {
        if (typeof c === "string") node.texts.push(c);
        const k = nodes.get(c);
        if (k) node.kids.push(k);
        return el;
      };
      if (node && typeof key === "string" && MOTION.has(key)) return (...args) => { node.calls.push([key, ...args]); return el; };
      if (node && key === "children") return (list) => {
        for (const c of list ?? []) { const k = nodes.get(c); if (k) node.kids.push(k); }
        return el;
      };
      if (inRow && typeof key === "string" && key.startsWith("on_")) {
        return () => { throw new Error(`${key} inside a virtual list row`); };
      }
      if (key === "when") return (cond, cb) => (cond ? cb(el) : el);
      if (key === "id") return (v) => {
        if (Array.isArray(globalThis.uiIds)) globalThis.uiIds.push(v);
        if (node) { node.id = v; globalThis.uiNodes.set(v, node); }
        return element({ ...ctx, id: v }, node);
      };
      if (key === "on_click" && (globalThis.uiClicks instanceof Map || globalThis.uiHandlers instanceof Map)) return (handler) => {
        if (globalThis.uiClicks instanceof Map && ctx.id !== undefined) globalThis.uiClicks.set(ctx.id, handler);
        keepHandler(ctx, "on_click", handler);
        return element(ctx, node);
      };
      if (key === "on_hover" && (globalThis.uiHovers instanceof Map || globalThis.uiHandlers instanceof Map)) return (handler) => {
        if (globalThis.uiHovers instanceof Map && ctx.id !== undefined) globalThis.uiHovers.set(ctx.id, handler);
        keepHandler(ctx, "on_hover", handler);
        return element(ctx, node);
      };
      if ((key === "on_pinch" || key === "on_scroll_wheel" || key === "on_mouse_move" || key === "on_key_down") && globalThis.uiHandlers instanceof Map) return (handler) => {
        keepHandler(ctx, key, handler);
        return element(ctx, node);
      };
      if ((key === "on_mouse_down" || key === "on_mouse_up") && globalThis.uiHandlers instanceof Map) return (button, handler) => {
        keepHandler(ctx, `${key}:${button}`, handler);
        return element(ctx, node);
      };
      if (key === "bg" && (Array.isArray(globalThis.uiBg) || node)) return (value) => {
        if (Array.isArray(globalThis.uiBg)) globalThis.uiBg.push([ctx.id ?? null, value]);
        if (node) node.bg = value;
        return element(ctx, node);
      };
      if (key === "text_color" && node) return (value) => { node.ink = value; return element(ctx, node); };
      if ((key === "w" || key === "h") && globalThis.uiSizes instanceof Map) return (value) => {
        if (ctx.id !== undefined) globalThis.uiSizes.set(ctx.id, { ...globalThis.uiSizes.get(ctx.id), [key]: value });
        return element(ctx, node);
      };
      if (globalThis.uiCursors instanceof Map && typeof key === "string" && key.startsWith("cursor_")) return () => {
        if (ctx.id !== undefined) globalThis.uiCursors.set(ctx.id, [...(globalThis.uiCursors.get(ctx.id) ?? []), key]);
        return element(ctx, node);
      };
      if (key === "tooltip") return (text) => {
        if (Array.isArray(globalThis.uiTooltips)) globalThis.uiTooltips.push([ctx.id ?? null, text]);
        return element(ctx, node);
      };
      return () => element(ctx, node);
    },
  });
  if (node) nodes.set(el, node);
  return el;
};
export class View {}
// Herdr throws on handlers registered inside a virtual list's item renderer; render eagerly to match.
export function h_virtual_list(_id, count, _sizes, getKey, render) {
  inRow = true;
  try {
    render({ start: 0, end: count }, {});
    for (let i = 0; i < count; i++) getKey(i);
  } finally {
    inRow = false;
  }
  return element();
}
export const div = element, svg = element, v_flex = element, h_flex = element;
export const image = (path) => {
  const el = element();
  const node = nodes.get(el);
  if (node) node.src = path;
  return el;
};
export const VirtualListScrollHandle = { new: () => ({ scroll_to_item() {}, scroll_to_bottom() {}, release() { return true; } }) };
export const InputState = { new: () => ({ on() {}, focus() {}, value: () => "" }) }, Input = { new: element };
export const PathBuilder = { stroke: element, fill: element };
export const Background = { linear_gradient: element, solid: element };
globalThis.window ??= { paint_path: element };
export const Scrollbar = { horizontal: element, vertical: element, new: element };
// The editor pane's retained state and its two views.
export const EditorState = { new: (options = {}) => {
  let value = options.value ?? "";
  return {
    value: () => value,
    set_value: (next) => { value = next; },
    on: () => true,
    release: () => true,
  };
} };
export const Editor = { new: element };
export const TextView = { html: () => element(), markdown: () => element() };
