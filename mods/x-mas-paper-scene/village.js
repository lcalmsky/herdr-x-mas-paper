// The village's own life, outside the drawn canvas: eight residents who walk the whole street and
// sometimes step into a front door, and the hill props' slow motion. Everything is event-driven:
// a resident or a hill timer is stepped only once its `until` has passed, and each step records
// `moveMs`, the transition length the render must use for the change it just made. gpui animates
// the transition; nothing here runs per frame, and the injected rand is the only randomness.

export const LOOKS = ["santa", "scarf", "kid", "gift"];
export const START_X = [380, 700, 1060, 1400, 1640, 1900, 2400, 2860];
export const X_RANGE = [120, 3000];
export const FLOOR_Y = [306, 318];
export const STEP = [150, 600];
export const GAP = 60;
export const SPEED = [24, 32];
export const STAND_MS = [2000, 8000];
export const FIRST_STAND_MS = [500, 4000];
export const DOOR_CHANCE = 0.25;
export const DOOR_NEAR = 900;
export const MAX_INSIDE = 2;
export const DOOR_HOUSES = [2, 4, 6, 7, 9, 11];
export const UP_MS = 800;
export const FADE_MS = 400;
export const INSIDE_MS = [6000, 15000];
export const DEER_DIP_EVERY_MS = [10000, 20000];
export const DEER_DIP_MS = 1200;
export const SLED_EVERY_MS = [40000, 70000];
export const SLED_MS = 2500;
export const SLED_FADE_MS = 400;
export const SLED_FIRST_MS = 3000;
export const DEMO_SEED = 1225;

export const HILL_PROPS = {
  snowman_1: { x: 640, y: 219 },
  snowman_2: { x: 1265, y: 173 },
  gift_pile: { x: 600, y: 221 },
  deer_a: { x: 1648, y: 205, side: "right" },
  deer_b: { x: 1680, y: 196, side: "left" },
  sled: { from: { x: 1392, y: 183 }, to: { x: 1482, y: 207 } },
};

const MID_X = 1560;
const STEP_FALLBACK = 300;
const WALKING = new Set(["walk", "up", "down"]);
const between = (rand, [lo, hi]) => lo + rand() * (hi - lo);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Small 32-bit PRNG so the demo preview draws the same residents and hill on every launch.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeResidents(rand, now) {
  return START_X.map((x, i) => {
    const look = LOOKS[i % LOOKS.length];
    const base = Math.round(between(rand, FLOOR_Y));
    return {
      id: `r${i}`,
      look,
      scale: look === "kid" ? 0.8 : 1,
      x,
      base,
      y: base,
      side: rand() < 0.5 ? "left" : "right",
      speed: between(rand, SPEED),
      phase: "stand",
      until: now + between(rand, FIRST_STAND_MS),
      door: null,
      op: 1,
      moveMs: 0,
    };
  });
}

// At most MAX_INSIDE may be on a door trip at once. A resident walking to a door already holds it,
// so the trip counts from the pick to the last step out; counting only fade|inside|fadein would let
// three residents arrive inside at once (rule 7 keeps it at two).
function onTrip(all) {
  return all.filter((q) => q.door != null && q.phase !== "down").length;
}

function pickTarget(r, all, doors, rand) {
  if (rand() < DOOR_CHANCE && onTrip(all) < MAX_INSIDE) {
    const ids = Object.keys(doors).map(Number);
    const free = ids.filter((id) => !all.some((q) => q !== r
      && (q.door === id || Math.abs(q.x - doors[id].x) < GAP)));
    const near = free.filter((id) => Math.abs(doors[id].x - r.x) <= DOOR_NEAR);
    if (near.length) {
      const id = near[Math.min(near.length - 1, Math.floor(rand() * near.length))];
      r.door = id;
      return doors[id].x;
    }
  }
  r.door = null;
  for (let tries = 0; tries < 12; tries += 1) {
    const target = clamp(r.x + between(rand, STEP) * (rand() < 0.5 ? -1 : 1), X_RANGE[0], X_RANGE[1]);
    if (Math.abs(target - r.x) < STEP[0]) continue;
    if (all.some((q) => q !== r && Math.abs(q.x - target) < GAP)) continue;
    return target;
  }
  return clamp(r.x + (r.x < MID_X ? STEP_FALLBACK : -STEP_FALLBACK), X_RANGE[0], X_RANGE[1]);
}

function arrive(r, doors, rand, now) {
  if (r.door != null) {
    r.y = doors[r.door].y;
    r.phase = "up";
    r.moveMs = UP_MS;
    r.until = now + UP_MS;
    return;
  }
  r.phase = "stand";
  r.moveMs = 0;
  r.until = now + between(rand, STAND_MS);
}

// Advances one resident by exactly one phase as of `now`; `moveMs` tells the render how long the
// change just made should take.
export function stepResident(r, all, doors, rand, now) {
  if (now < r.until) return r;
  switch (r.phase) {
    case "stand": {
      const target = pickTarget(r, all, doors, rand);
      const dx = target - r.x;
      r.phase = "walk";
      r.x = target;
      r.side = dx < 0 ? "left" : "right";
      r.moveMs = Math.round((Math.abs(dx) / r.speed) * 1000);
      r.until = now + r.moveMs;
      if (r.moveMs === 0) arrive(r, doors, rand, now);
      return r;
    }
    case "walk":
      arrive(r, doors, rand, now);
      return r;
    case "up":
      r.phase = "fade";
      r.op = 0;
      r.moveMs = FADE_MS;
      r.until = now + FADE_MS;
      return r;
    case "fade":
      r.phase = "inside";
      r.until = now + between(rand, INSIDE_MS);
      return r;
    case "inside":
      r.phase = "fadein";
      r.op = 1;
      r.side = rand() < 0.5 ? "left" : "right";
      r.moveMs = FADE_MS;
      r.until = now + FADE_MS;
      return r;
    case "fadein":
      r.phase = "down";
      r.y = r.base;
      r.moveMs = UP_MS;
      r.until = now + UP_MS;
      return r;
    case "down":
      r.phase = "stand";
      r.door = null;
      r.moveMs = 0;
      r.until = now + between(rand, STAND_MS);
      return r;
    default:
      return r;
  }
}

// Steps every resident whose time has come; one may take several steps when a target sits where it
// already stands. Returns whether anything changed.
export function stepVillage(residents, doors, rand, now) {
  let changed = false;
  for (let pass = 0; pass < 64; pass += 1) {
    let due = false;
    for (const r of residents) {
      if (now < r.until) continue;
      stepResident(r, residents, doors, rand, now);
      changed = true;
      due = true;
    }
    if (!due) break;
  }
  return changed;
}

export function makeHill(rand, now) {
  return {
    deer: [
      { dipping: false, dipUntil: now },
      { dipping: false, dipUntil: now },
    ],
    nextDipAt: now + between(rand, DEER_DIP_EVERY_MS),
    sled: { n: 0, phase: "wait", until: now + SLED_FIRST_MS },
  };
}

export function stepHill(hill, rand, now) {
  let changed = false;
  for (const deer of hill.deer) {
    if (!deer.dipping || now < deer.dipUntil) continue;
    deer.dipping = false;
    changed = true;
  }
  if (now >= hill.nextDipAt) {
    const deer = hill.deer[Math.min(hill.deer.length - 1, Math.floor(rand() * hill.deer.length))];
    deer.dipping = true;
    deer.dipUntil = now + DEER_DIP_MS;
    hill.nextDipAt = now + between(rand, DEER_DIP_EVERY_MS);
    changed = true;
  }
  const sled = hill.sled;
  if (sled.phase === "wait") {
    if (now >= sled.until) {
      sled.n += 1;
      sled.phase = "start";
      sled.until = now + SLED_MS + SLED_FADE_MS;
      changed = true;
    }
  } else if (now >= sled.until) {
    sled.phase = "wait";
    sled.until = now + between(rand, SLED_EVERY_MS);
    changed = true;
  }
  return changed;
}

// The next moment anyone has anything to do; the caller sleeps until then.
export function nextWake(residents, hill) {
  let at = Infinity;
  for (const r of residents ?? []) at = Math.min(at, r.until);
  if (!hill) return at;
  at = Math.min(at, hill.nextDipAt);
  for (const deer of hill.deer ?? []) if (deer.dipping) at = Math.min(at, deer.dipUntil);
  if (hill.sled) at = Math.min(at, hill.sled.until);
  return at;
}

export function walking(r) {
  return WALKING.has(r.phase);
}
