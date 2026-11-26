// The village's picture: the paper background, the big tree, a house and villager per session,
// and the signs the person reads. Nothing here animates with a timer; every motion is a native
// loop or transition. Positions arrive in logical px (scene height 240) and are scaled here.
import { div, image } from "gpui-kit";
import { ASSETS } from "./manifest.js";
import {
  ART_FILE, ART_W, TREE_H, TREE_Y, TREE_WALK_GAP, HOUSE_H, HOUSE_GIFT_X, HOUSE_VILLAGER_X, HOUSE_BELL_X,
  CHIMNEY_X, CHIMNEY_Y, SMOKE_H, SMOKE_RISE, VILLAGER_H, GIFT_H, STOCKING_H, SNOWMAN_H, SNOWMAN_Y, SNOWMAN_X,
  NUMBER_SIZE, NUMBER_H, NUMBER_RADIUS, NUMBER_PAD, NUMBER_AT, NAME_SIZE, LABEL_MIN_W, NAME_TOP,
  ASK_SIZE, ASK_H, ASK_PAD, ASK_RADIUS, ASK_MAX_W, ASK_GAP, ASK_MIN_W, ASK_LIFT, ASK_MARGIN, ASK_CLEAR,
  OVERFLOW_Y, OVERFLOW_W, OVERFLOW_H, ZZZ_SIZE, LAND_BAND, LAND_COLORS, FADE_MS, SMOKE_MS, WALK_MS, ZZZ_MS, BELL_MS,
  houseOf, propOf, clipText, layoutBubbles,
} from "./model.js";

const ART = "mods/x-mas-paper-scene/art/";
const r2 = (n) => Math.round(n * 100) / 100;
const sidOf = (unit) => String(unit.id).replace(/[^\w-]/g, "_");

function box(name, h) {
  const a = ASSETS[name];
  const ratio = h / a.size[1];
  return { file: ART + a.file, w: r2(a.size[0] * ratio), h: r2(h), ax: r2(a.anchor[0] * ratio), ay: r2(a.anchor[1] * ratio) };
}

// A sprite placed by its anchor, which the manifest puts at the base's centre.
function sprite(name, x, base, h) {
  const b = box(name, h);
  return { el: image(b.file).absolute().left(r2(x - b.ax)).top(r2(base - b.ay)).w(b.w).h(b.h), b, top: base - b.ay };
}

const fade = (el, on) => el.opacity(on ? 1 : 0).transition("opacity", { duration: FADE_MS });

// One session's house: base, the lit/open overlays and the advent number over its door.
function unitBase(unit, o) {
  const s = unit.scale * o.k;
  const x = unit.x * o.k, base = unit.y * o.k;
  const houseName = houseOf(unit.id, o.tone);
  const house = box(houseName, HOUSE_H * s);
  const left = r2(x - house.ax), top = r2(base - house.ay);
  const overlays = ASSETS[houseName].overlays ?? {};
  const lit = unit.display === "working" || unit.display === "unread" || unit.display === "other";
  const open = unit.display === "turn";
  const numberTop = r2(base - HOUSE_H * s * NUMBER_AT - (NUMBER_H * s) / 2 - top);
  const group = div().id(`paper-house-${sidOf(unit)}`).absolute().left(left).top(top).w(house.w).h(house.h)
    .cursor_pointer().on_click(() => o.visit?.(unit))
    .child(image(house.file).absolute().left(0).top(0).w(house.w).h(house.h));
  if (overlays.lit) group.child(fade(image(ART + overlays.lit).absolute().left(0).top(0).w(house.w).h(house.h), lit));
  if (overlays.open) group.child(fade(image(ART + overlays.open).absolute().left(0).top(0).w(house.w).h(house.h), open));
  group.child(div().absolute().left(0).top(numberTop).w(house.w).h(r2(NUMBER_H * s))
    .flex().items_center().justify_center()
    .child(div().rounded(r2(NUMBER_RADIUS * s)).bg(o.numberPlate).px(r2(NUMBER_PAD * s)).py(r2(1 * s))
      .text_size(r2(NUMBER_SIZE * s)).font_family("Nunito").font_bold()
      .text_color(o.accent).child(String(unit.number))));
  return { node: group, house, top, base };
}

// The props one state hangs on a house: smoke, a gift, a stocking, the villagers and the z's.
function unitSymbols(unit, o, house) {
  const s = unit.scale * o.k;
  const x = unit.x * o.k, base = unit.y * o.k;
  const working = unit.display === "working", turn = unit.display === "turn";
  const unread = unit.display === "unread", sleeping = unit.display === "sleeping", other = unit.display === "other";
  const chimneyX = r2(x + house.house.w * CHIMNEY_X);
  const chimneyY = r2(house.top + CHIMNEY_Y * s);
  const out = [];

  const smokeName = propOf("smoke", o.tone);
  const smokeBox = box(smokeName, SMOKE_H * s);
  const smokeTop = chimneyY - smokeBox.ay;
  const puff = (dx, dy, from, period) => image(smokeBox.file).absolute()
    .left(r2(chimneyX - smokeBox.ax + dx)).top(r2(smokeTop + dy)).w(smokeBox.w).h(smokeBox.h)
    .loop("opacity", { from, to: 0, period, easing: "linear" })
    .loop("top", { from: r2(smokeTop + dy), to: r2(smokeTop + dy - SMOKE_RISE * s), period, easing: "linear" });
  out.push(div().id(`paper-smoke-${sidOf(unit)}`).absolute().left(0).top(0)
    .opacity(working ? 1 : 0).transition("opacity", { duration: FADE_MS })
    .child(puff(0, 0, 1, SMOKE_MS)).child(puff(3 * s, -6 * s, 0.8, SMOKE_MS + 600)));

  out.push(fade(sprite(propOf("gift", o.tone), x - HOUSE_GIFT_X * s, base, GIFT_H * s).el, unread));
  out.push(fade(sprite(propOf("stocking", o.tone), chimneyX, house.top + 16 * s, STOCKING_H * s).el, sleeping));

  // The villager stands by the house and, with nothing asked of it, walks to the tree and back.
  const walker = box(propOf("villager", o.tone), VILLAGER_H * s);
  const homeLeft = r2(x + HOUSE_VILLAGER_X * s - walker.ax);
  const treeSide = o.treeX + (unit.x > o.logicalW / 2 ? TREE_WALK_GAP : -TREE_WALK_GAP) * s;
  const plain = fade(image(walker.file).absolute().left(homeLeft).top(r2(base - walker.ay)).w(walker.w).h(walker.h), !turn);
  if (other) {
    plain.loop("left", { from: homeLeft, to: r2(treeSide - walker.ax), period: WALK_MS, easing: "ease-in-out" })
      .loop("height", { from: r2(walker.h * 0.98), to: walker.h, period: 600, easing: "ease-in-out" });
  }
  out.push(plain);

  const bell = box(propOf("bell", o.tone), VILLAGER_H * s);
  const bellTop = r2(base - bell.ay);
  const bellEl = fade(image(bell.file).absolute().left(r2(x + HOUSE_BELL_X * s - bell.ax)).top(bellTop).w(bell.w).h(bell.h), turn);
  if (turn) bellEl.loop("top", { from: r2(bellTop - 2 * s), to: r2(bellTop + 2 * s), period: BELL_MS, easing: "ease-in-out" });
  out.push(bellEl);

  out.push(div().id(`paper-zzz-${sidOf(unit)}`).absolute().left(r2(x - 40 * s)).top(r2(house.top - 16 * s)).w(r2(80 * s))
    .opacity(sleeping ? 1 : 0).transition("opacity", { duration: FADE_MS })
    .child(div().w_full().text_size(r2(ZZZ_SIZE * s)).font_family("Nunito").font_bold().text_color(o.text).child("z z z")
      .loop("opacity", { from: 1, to: 0.15, period: ZZZ_MS, easing: "ease-in-out" })));
  return out;
}

// The name under a front-row house (the back row's would run into it) and, for a session waiting
// on the person, its question above.
function signNodes(unit, o, house, bubble) {
  const s = unit.scale * o.k;
  const x = unit.x * o.k, base = unit.y * o.k;
  const out = [];
  if (unit.row !== "back") {
    const labelW = Math.max(house.w, LABEL_MIN_W * s);
    out.push(div().id(`paper-name-${sidOf(unit)}`).absolute().left(r2(x - labelW / 2)).top(r2(base + NAME_TOP * s))
      .w(r2(labelW)).text_size(r2(NAME_SIZE * s)).font_family("Nunito").font_weight(600).text_color(o.text)
      .whitespace_nowrap().flex().items_center().justify_center()
      .child(clipText(unit.name, labelW - 4 * s, NAME_SIZE * s)));
  }
  if (bubble) {
    out.push(div().id(`paper-ask-${sidOf(unit)}`).absolute().left(r2(bubble.left)).top(r2(bubble.top))
      .w(r2(bubble.w)).h(r2(bubble.h))
      .opacity(unit.display === "turn" ? 1 : 0).transition("opacity", { duration: FADE_MS })
      .flex().items_center().justify_center().rounded(r2(ASK_RADIUS * o.k)).bg(o.surface)
      .border(Math.max(1, r2(o.k))).border_color(o.accent).text_size(r2(ASK_SIZE * o.k)).font_family("Nunito")
      .font_weight(600).text_color(o.text).whitespace_nowrap().overflow_hidden().child(bubble.text));
  }
  return out;
}

/**
 * Every node of the scene, back to front: background, back-row houses, shadows, the tree and the
 * front-row houses, the props each state adds, then the names and bubbles.
 * o: { width, height, tone, units, overflow, colors: { text, muted, accent, surface, ground }, visit }
 */
export function sceneLayers(o) {
  const k = Math.max(0.01, o.height / 240);
  const W = o.width;
  const shared = { k, width: W, height: o.height, logicalW: W / k, tone: o.tone, visit: o.visit,
    text: o.colors.text, muted: o.colors.muted, accent: o.colors.accent, surface: o.colors.surface,
    numberPlate: o.colors.ground, treeX: W / 2 };
  const nodes = [];
  const tileW = ART_W * k;
  const bg = ART + (o.tone === "dark" ? ART_FILE.bg_dark : ART_FILE.bg_light);
  for (let i = 0; i * tileW < W; i++) nodes.push(image(bg).absolute().left(r2(i * tileW)).top(0).w(r2(tileW + 1)).h(r2(o.height)));
  nodes.push(div().absolute().left(0).top(r2(o.height - LAND_BAND * k)).w(W).h(r2(LAND_BAND * k))
    .bg(o.tone === "dark" ? LAND_COLORS.dark : LAND_COLORS.light));

  const back = o.units.filter((u) => u.row === "back");
  const front = o.units.filter((u) => u.row === "front");
  const bases = new Map();
  for (const unit of back) {
    const built = unitBase(unit, shared);
    bases.set(unit, built);
    nodes.push(built.node);
  }

  // Shadows lie between the rows: under the front houses only, behind their bases.
  const shadowFile = ART + ASSETS[propOf("shadow", o.tone)].file;
  for (const unit of front) {
    const house = box(houseOf(unit.id, o.tone), HOUSE_H * k);
    const w = house.w * 1.3, h = 14 * k;
    nodes.push(image(shadowFile).absolute().left(r2(unit.x * k - w / 2)).top(r2(unit.y * k - h / 2)).w(r2(w)).h(r2(h)));
  }

  // The big tree, then the front-row houses.
  const tree = box(propOf("tree", o.tone), TREE_H * k);
  const treeBase = TREE_Y * k;
  nodes.push(image(shadowFile).absolute().left(r2(W / 2 - (tree.w * 1.4) / 2)).top(r2(treeBase - 10 * k))
    .w(r2(tree.w * 1.4)).h(r2(16 * k)));
  nodes.push(image(tree.file).absolute().left(r2(W / 2 - tree.ax)).top(r2(treeBase - tree.ay)).w(tree.w).h(tree.h));
  for (const unit of front) {
    const built = unitBase(unit, shared);
    bases.set(unit, built);
    nodes.push(built.node);
  }

  // Every house's own props, back row first so the front row stays in front of it.
  for (const unit of [...back, ...front]) {
    const built = bases.get(unit);
    if (built) nodes.push(...unitSymbols(unit, shared, built));
  }
  const snowman = box(propOf("snowman", o.tone), SNOWMAN_H * k);
  nodes.push(image(snowman.file).absolute().left(r2(W - SNOWMAN_X * k - snowman.ax)).top(r2(SNOWMAN_Y * k - snowman.ay)).w(snowman.w).h(snowman.h));

  const bubbleOpts = {
    width: W, size: ASK_SIZE * k, pad: ASK_PAD * k, maxW: Math.min(ASK_MAX_W * k, W - 12 * k),
    minW: ASK_MIN_W * k, bh: ASK_H * k, gap: ASK_LIFT * k, margin: ASK_MARGIN * k, clear: ASK_CLEAR * k,
  };
  const asks = o.units.filter((unit) => unit.question && bases.has(unit)).map((unit) => ({
    id: unit.id, text: unit.question, x: unit.x * k, top: bases.get(unit).top - ASK_GAP * k - ASK_H * k,
    claim: unit.display === "turn",
  }));
  const bubbles = new Map(layoutBubbles(asks, bubbleOpts).map((bubble) => [bubble.id, bubble]));

  for (const mark of o.overflow ?? []) {
    nodes.push(div().id(`paper-overflow-${mark.side}`).absolute()
      .left(r2(mark.x * k - (OVERFLOW_W * k) / 2)).top(r2(OVERFLOW_Y * k - OVERFLOW_H * k))
      .w(r2(OVERFLOW_W * k)).flex().items_center().justify_center().text_size(r2(11 * k))
      .font_family("Nunito").font_bold().text_color(o.colors.accent).child(mark.text));
  }

  for (const unit of o.units) {
    const built = bases.get(unit);
    if (built) nodes.push(...signNodes(unit, shared, built, bubbles.get(unit.id)));
  }
  return nodes;
}
