// Every chained method an x-mas paper mod calls must be one Herdr knows. The ui stub answers any name, so a
// typo or a method gpui-kit lacks (line_clamp) passes every other test and only fails in Herdr,
// where the block shows an error and stops drawing. `herdr-app check` writes gpui-kit.d.ts next to a
// mod; this test checks a copy of each mod against it. Skipped where herdr-app is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MODS = ["x-mas-paper-scene", "x-mas-paper-rail", "x-mas-paper-accounts", "x-mas-paper-tabs", "x-mas-paper-pane", "x-mas-paper-editor"];

let herdr = true;
try { execFileSync("herdr-app", ["--version"], { stdio: "ignore" }); } catch { herdr = false; }

// Names JavaScript itself answers on strings, arrays, maps, sets, numbers, promises and dates.
const BUILTIN = new Set([String.prototype, Array.prototype, Map.prototype, Set.prototype, Number.prototype,
  Promise.prototype, Date.prototype, Object.prototype, RegExp.prototype, Function.prototype, Math, JSON, Object, Array, Number]
  .flatMap((o) => Object.getOwnPropertyNames(o)));

// `.name(` after a call, after a name (`el.px(`) or at the start of a continued line.
export function chainedCalls(source) {
  const names = new Set();
  for (const m of source.matchAll(/(?:\)\s*|[A-Za-z0-9_$\]]|^\s*)\.([a-z_][a-z0-9_]*)\(/gm)) names.add(m[1]);
  return names;
}

// Methods and functions a mod defines itself.
export function ownNames(source) {
  const names = new Set();
  for (const m of source.matchAll(/^\s*(?:async\s+)?(?:static\s+)?([a-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/gm)) names.add(m[1]);
  for (const m of source.matchAll(/function\s+([A-Za-z_][A-Za-z0-9_]*)/g)) names.add(m[1]);
  for (const m of source.matchAll(/(?:const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) names.add(m[1]);
  // Callbacks a mod passes in an object of its own (`{ click: ... }` then `opts.click(cx)`).
  for (const m of source.matchAll(/[{,]\s*([a-z_][A-Za-z0-9_]*)\s*:/g)) names.add(m[1]);
  return names;
}

test("chainedCalls finds builder methods and ownNames finds a mod's own", () => {
  const src = "div().px(4)\n  .line_clamp(2)\n  .child(x.trim())\n  .when(on, (el) => el.text_clamp(1));\nfunction band() {}\n  poll(cx) {\n  }";
  assert.deepEqual([...chainedCalls(src)].sort(), ["child", "line_clamp", "px", "text_clamp", "trim", "when"]);
  assert.ok(ownNames(src).has("band") && ownNames(src).has("poll"));
});

test("every chained method in the x-mas paper mods exists in Herdr's gpui-kit", { skip: herdr ? false : "herdr-app not installed" }, () => {
  const work = mkdtempSync(join(tmpdir(), "xmas-paper-gpui-"));
  try {
    for (const mod of MODS) {
      const dir = join(work, mod);
      cpSync(join(ROOT, "mods", mod), dir, { recursive: true });
      execFileSync("herdr-app", ["check", dir], { stdio: "ignore" });
      const kit = readFileSync(join(dir, "gpui-kit.d.ts"), "utf8");
      const known = new Set([...kit.matchAll(/\b([a-z_][a-z0-9_]*)\s*[<(]/g)].map((m) => m[1]));
      const files = readdirSync(join(ROOT, "mods", mod)).filter((f) => f.endsWith(".js"));
      const sources = files.map((f) => readFileSync(join(ROOT, "mods", mod, f), "utf8"));
      const own = new Set(sources.flatMap((s) => [...ownNames(s)]));
      files.forEach((file, n) => {
        const unknown = [...chainedCalls(sources[n])].filter((name) => !known.has(name) && !own.has(name) && !BUILTIN.has(name));
        assert.deepEqual(unknown, [], `mods/${mod}/${file} calls methods gpui-kit does not have`);
      });
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// gpui-kit reads a bare number given to line_height as a multiplier of the font size, not pixels.
test("no x-mas paper mod gives line_height a pixel count as a bare number", () => {
  for (const mod of MODS) {
    for (const file of readdirSync(join(ROOT, "mods", mod)).filter((f) => f.endsWith(".js"))) {
      const source = readFileSync(join(ROOT, "mods", mod, file), "utf8");
      const big = [...source.matchAll(/\.line_height\(\s*(\d+(?:\.\d+)?)\s*\)/g)].map((m) => Number(m[1])).filter((n) => n > 3);
      assert.deepEqual(big, [], `mods/${mod}/${file} passes pixels to line_height as a multiplier`);
    }
  }
});
