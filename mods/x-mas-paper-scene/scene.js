// The village picture: one painted scene, a cropped state overlay and a strip of text per seated
// house, and the two walkers' sprites. Every position is the studio canvas's logical px
// (3112×320) mapped onto the block; motion is native transitions and loops only.
import { div, image } from "gpui-kit";
import { SLOTS, OVERLAYS } from "./slots.js";
import {
  clipText, overlayState, plateSize, sceneFrame, textWidth,
  LABEL_SIZE, LABEL_WEIGHT, LABEL_PAD_Y, LABEL_PAD_X, LABEL_RADIUS, LABEL_MAX_W, LABEL_BOX, LABEL_COLORS,
  LABEL_FONT, TEXT_FONT,
  PLATE_WEIGHT, PLATE_BOX, PLATE_INK,
  BUBBLE_TEXT, BUBBLE_SIZE, BUBBLE_WEIGHT, BUBBLE_PAD_Y, BUBBLE_PAD_X, BUBBLE_RADIUS, BUBBLE_TAIL_RADIUS,
  BUBBLE_BOX, BUBBLE_BG, BUBBLE_INK,
  ZZZ_TEXT, ZZZ_SIZE, ZZZ_WEIGHT, ZZZ_BOX, ZZZ_COLORS,
  PLUS_SIZE, PLUS_WEIGHT, PLUS_PAD_Y, PLUS_PAD_X, PLUS_RADIUS, PLUS_TOP, PLUS_RIGHT, PLUS_COLORS,
  EDGE, FADE_MS, SMOKE_MS, WALK_MS, STEP_MS,
} from "./model.js";

const ART = "mods/x-mas-paper-scene/art/";
const STATES = ["working", "turn", "sleep"];
const SIDES = ["right", "left"];
const WALKERS = [
  { id: "a", firstFrame: 1 },
  { id: "b", firstFrame: 2 },
];
const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sidOf = (id) => String(id).replace(/[^\w-]/g, "_");

// A sprite's box in screen px at this frame's scale.
function spriteOf(name, mode, k) {
  const sprite = SLOTS.sprites[name][mode];
  const [w, h] = sprite.size_logical;
  const [ax, ay] = sprite.anchor_logical;
  return { file: sprite.file, w: w * k, h: h * k, ax: ax * k, ay: ay * k };
}

// The box that holds sprites anchored on one point, in offsets from that point.
function unionOf(boxes) {
  const left = Math.min(...boxes.map((b) => -b.ax));
  const top = Math.min(...boxes.map((b) => -b.ay));
  const right = Math.max(...boxes.map((b) => b.w - b.ax));
  const bottom = Math.max(...boxes.map((b) => b.h - b.ay));
  return { left, top, w: right - left, h: bottom - top };
}

// A sprite inside its group: the anchor relative to the group's top-left.
const imageIn = (box, group) => image(ART + box.file).absolute()
  .left(r2(-box.ax - group.left)).top(r2(-box.ay - group.top)).w(r2(box.w)).h(r2(box.h));

export function sceneLayers(o) {
  const width = o.width, height = o.height;
  const mode = o.mode === "dark" ? "dark" : "light";
  const frame = sceneFrame(width, height);
  const k = frame.k;
  const seats = o.seats ?? [];
  const sx = (x) => frame.left + x * k;
  const sy = (y) => frame.top + y * k;
  const s = (v) => v * k;
  const label = LABEL_COLORS[mode];
  const plusColors = PLUS_COLORS[mode];
  const byHouse = new Map(seats.map((seat) => [seat.house.id, seat]));
  const nodes = [];

  nodes.push(image(`${ART}scene_${mode}.png`).id("paper-scene-bg").absolute()
    .left(r2(frame.left)).top(r2(frame.top))
    .w(r2(SLOTS.canvas_logical[0] * k)).h(r2(SLOTS.canvas_logical[1] * k)));

  // Every house carries all three state slices from the first frame, and only the slice its seated
  // session calls for is opaque; a session leaving or arriving changes opacities, not elements.
  for (const house of SLOTS.houses) {
    const shown = overlayState(byHouse.get(house.id)?.display);
    for (const state of STATES) {
      const record = OVERLAYS[state]?.[mode]?.[house.id];
      if (!record) continue;
      nodes.push(image(ART + record.file).id(`paper-state-${house.id}-${state}`).absolute()
        .left(r2(sx(record.x))).top(r2(sy(record.y))).w(r2(s(record.w))).h(r2(s(record.h)))
        .opacity(shown === state ? 1 : 0).transition("opacity", { duration: FADE_MS }));
    }
  }

  for (const seat of seats) {
    const house = seat.house;
    nodes.push(div().id(`paper-visit-${sidOf(seat.id)}`).absolute()
      .left(r2(sx(house.body_x[0]))).top(r2(sy(house.top_y)))
      .w(r2(s(house.body_x[1] - house.body_x[0]))).h(r2(s(house.floor_y - house.top_y)))
      .cursor_pointer().on_click(() => o.visit?.(seat)));
  }

  // The two walkers share the tree's lane. Step 0 is the picture's first pose; steps 1 and 2 turn
  // them at the lane's ends, and the left transition carries each one there in WALK_MS.
  // They sit inside a lane box placed straight on the scene, so a crop moves that one box and the
  // walkers' own lefts stay relative to it. Their own left still scales with k, so the id carries
  // k too: a new scale draws a new element at its pose instead of sliding there over WALK_MS, while
  // one scale keeps the id and its step transition.
  const lane = SLOTS.walker_lane;
  const step = [0, 1, 2].includes(o.walkStep) ? o.walkStep : 0;
  const poses = [
    [{ x: lane.x[0] + 40, side: "right" }, { x: lane.x[1] - 50, side: "left" }],
    [{ x: lane.x[1], side: "right" }, { x: lane.x[0], side: "left" }],
    [{ x: lane.x[0], side: "left" }, { x: lane.x[1], side: "right" }],
  ][step];
  const all = unionOf(SIDES.flatMap((s2) => [spriteOf(`walker_${s2}_1`, mode, k), spriteOf(`walker_${s2}_2`, mode, k)]));
  const lanePad = -all.left;
  const laneBox = div().id("paper-walkers").absolute()
    .left(r2(sx(lane.x[0]) - lanePad)).top(r2(sy(lane.floor_y) + all.top))
    .w(r2(s(lane.x[1] - lane.x[0]) + 2 * lanePad)).h(r2(all.h));
  for (let i = 0; i < WALKERS.length; i += 1) {
    const spec = WALKERS[i];
    const pose = poses[i];
    const x = pose.x;
    const side = pose.side;
    const wrap = div().id(`paper-walker-${spec.id}-${Math.round(k * 1000)}`).absolute()
      .left(r2((x - lane.x[0]) * k + lanePad + all.left)).top(0).w(r2(all.w)).h(r2(all.h))
      .transition("left", { duration: WALK_MS, easing: "linear" });
    for (const groupSide of SIDES) {
      const first = spriteOf(`walker_${groupSide}_1`, mode, k);
      const second = spriteOf(`walker_${groupSide}_2`, mode, k);
      const group = unionOf([first, second]);
      const frames = spec.firstFrame === 1 ? [first, second] : [second, first];
      wrap.child(div().id(`paper-walker-${spec.id}-${groupSide}`).absolute()
        .left(r2(group.left - all.left)).top(r2(group.top - all.top)).w(r2(group.w)).h(r2(group.h))
        .opacity(side === groupSide ? 1 : 0)
        .child(imageIn(frames[0], group).loop("opacity", { from: 50, to: -49, period: STEP_MS, easing: "linear" }))
        .child(imageIn(frames[1], group).loop("opacity", { from: -49, to: 50, period: STEP_MS, easing: "linear" })));
    }
    laneBox.child(wrap);
  }
  nodes.push(laneBox);

  for (const house of SLOTS.houses) {
    const display = byHouse.get(house.id)?.display;
    const smoke1 = spriteOf("smoke_1", mode, k);
    const smoke2 = spriteOf("smoke_2", mode, k);
    const smoke = unionOf([smoke1, smoke2]);
    nodes.push(div().id(`paper-smoke-h${house.id}`).absolute()
      .left(r2(sx(house.smoke.x) + smoke.left)).top(r2(sy(house.smoke.y) + smoke.top))
      .w(r2(smoke.w)).h(r2(smoke.h))
      .opacity(display === "working" ? 1 : 0).transition("opacity", { duration: FADE_MS })
      .child(imageIn(smoke1, smoke).loop("opacity", { from: 50, to: -49, period: SMOKE_MS, easing: "linear" }))
      .child(imageIn(smoke2, smoke).loop("opacity", { from: -49, to: 50, period: SMOKE_MS, easing: "linear" })));

    const gift = spriteOf("gift", mode, k);
    nodes.push(image(ART + gift.file).id(`paper-gift-h${house.id}`).absolute()
      .left(r2(sx(house.gift.x) - gift.ax)).top(r2(sy(house.gift.y) - gift.ay))
      .w(r2(gift.w)).h(r2(gift.h))
      .opacity(display === "unread" ? 1 : 0).transition("opacity", { duration: FADE_MS }));
  }

  for (const seat of seats) {
    if (seat.visible === false) continue;
    const house = seat.house;
    const size = s(plateSize(house));
    const w = Math.min(s(PLATE_BOX), Math.max(1, width - 2 * EDGE));
    const left = sx(house.door_plate.x) - w / 2;
    const top = sy(house.door_plate.y) - size / 2 - 0.14 * size;
    nodes.push(div().id(`paper-plate-${sidOf(seat.id)}`).absolute().left(r2(left)).top(r2(top))
      .w(r2(w)).h(r2(size)).flex().items_center().justify_center()
      .child(div().id(`paper-plate-text-${sidOf(seat.id)}`).text_size(r2(size)).line_height(`${r2(size)}px`)
        .font_family(LABEL_FONT).font_weight(PLATE_WEIGHT).text_color(PLATE_INK).child(String(seat.number))));
  }

  for (const seat of seats) {
    if (seat.visible === false) continue;
    const house = seat.house;
    const line = s(LABEL_SIZE);
    const chipH = line + s(2 * LABEL_PAD_Y);
    const text = clipText(seat.name, s(LABEL_MAX_W), line);
    const chipW = textWidth(text, line) + s(2 * LABEL_PAD_X);
    const w = Math.min(s(LABEL_BOX), Math.max(1, width - 2 * EDGE));
    const chipLeft = clamp(sx(house.name_label.x) - chipW / 2, EDGE, width - chipW - EDGE);
    const left = chipLeft - (w - chipW) / 2;
    const top = clamp(sy(house.name_label.y), EDGE, height - chipH);
    nodes.push(div().id(`paper-name-${sidOf(seat.id)}`).absolute().left(r2(left)).top(r2(top)).w(r2(w))
      .flex().justify_center()
      .child(div().id(`paper-name-chip-${sidOf(seat.id)}`).bg(label.bg)
        .px(r2(s(LABEL_PAD_X))).py(r2(s(LABEL_PAD_Y))).rounded(r2(s(LABEL_RADIUS)))
        .line_height(`${r2(line)}px`).text_size(r2(line)).font_family(LABEL_FONT)
        .font_weight(LABEL_WEIGHT).text_color(label.ink)
        .whitespace_nowrap().child(text)));
  }

  for (const house of SLOTS.houses) {
    const seat = byHouse.get(house.id);
    const display = seat?.display;
    const shown = !!seat && seat.visible !== false;
    const line = s(BUBBLE_SIZE);
    const chipH = line + s(2 * BUBBLE_PAD_Y);
    const chipW = textWidth(BUBBLE_TEXT, line) + s(2 * BUBBLE_PAD_X);
    const w = Math.min(s(BUBBLE_BOX), Math.max(1, width - 2 * EDGE));
    const left = Math.min(sx(house.bubble.x), width - chipW - EDGE);
    const top = clamp(sy(house.bubble.y) - chipH, EDGE, height - chipH - EDGE);
    nodes.push(div().id(`paper-bubble-h${house.id}`).absolute().left(r2(left)).top(r2(top))
      .w(r2(w)).h(r2(chipH)).flex().items_center()
      .opacity(shown && display === "turn" ? 1 : 0).transition("opacity", { duration: FADE_MS })
      .child(div().id(`paper-bubble-text-h${house.id}`).bg(BUBBLE_BG)
        .px(r2(s(BUBBLE_PAD_X))).py(r2(s(BUBBLE_PAD_Y)))
        .rounded_tl(r2(s(BUBBLE_RADIUS))).rounded_tr(r2(s(BUBBLE_RADIUS)))
        .rounded_br(r2(s(BUBBLE_RADIUS))).rounded_bl(r2(s(BUBBLE_TAIL_RADIUS)))
        .line_height(`${r2(line)}px`).text_size(r2(line)).font_family(TEXT_FONT)
        .font_weight(BUBBLE_WEIGHT).text_color(BUBBLE_INK)
        .whitespace_nowrap().when(mode === "light", (el) => el.shadow_sm()).child(BUBBLE_TEXT)));

    const zzzLine = s(ZZZ_SIZE);
    const zzzLeft = sx(house.bubble.x);
    const zzzTop = sy(house.bubble.y) - zzzLine + s(1);
    nodes.push(div().id(`paper-zzz-h${house.id}`).absolute().left(r2(zzzLeft)).top(r2(zzzTop))
      .w(r2(s(ZZZ_BOX))).h(r2(zzzLine))
      .opacity(shown && display === "sleeping" ? 1 : 0).transition("opacity", { duration: FADE_MS })
      .child(div().id(`paper-zzz-text-h${house.id}`).text_size(r2(zzzLine)).line_height(`${r2(zzzLine)}px`)
        .font_family(TEXT_FONT).font_weight(ZZZ_WEIGHT).italic().text_color(ZZZ_COLORS[mode]).child(ZZZ_TEXT)));
  }

  if ((o.plus ?? 0) > 0) {
    nodes.push(div().id("paper-plus").absolute().top(PLUS_TOP).right(PLUS_RIGHT)
      .child(div().id("paper-plus-chip").bg(plusColors.bg)
        .px(r2(s(PLUS_PAD_X))).py(r2(s(PLUS_PAD_Y))).rounded(r2(s(PLUS_RADIUS)))
        .line_height(`${r2(s(PLUS_SIZE))}px`).text_size(r2(s(PLUS_SIZE))).font_family(TEXT_FONT)
        .font_weight(PLUS_WEIGHT).text_color(plusColors.ink).child(`+${o.plus}`)));
  }

  return nodes;
}
