// The rail's and the accounts' faces: the studio's 24 png portraits, and the two mains' paths to
// them. Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const facesOf = (mod) => new Set(readdirSync(fileURLToPath(new URL(`../mods/${mod}/faces/`, import.meta.url))));
const sourceOf = (mod) => readFileSync(fileURLToPath(new URL(`../mods/${mod}/main.js`, import.meta.url)), "utf8");

test("the rail and the accounts ship the studio's 24 png faces and no svg", () => {
  for (const mod of ["x-mas-paper-rail", "x-mas-paper-accounts"]) {
    const files = facesOf(mod);
    for (let i = 0; i < 24; i += 1) assert.ok(files.has(`${i}.png`), `${mod}/faces/${i}.png is there`);
    assert.equal([...files].filter((name) => name.endsWith(".svg")).length, 0, `${mod} keeps no svg face`);
    assert.equal(files.size, 24, `${mod} carries exactly the 24 faces`);
  }
});

test("both mains point their face images at the png files", () => {
  const rail = sourceOf("x-mas-paper-rail");
  assert.ok(rail.includes("mods/x-mas-paper-rail/faces/${faceIndex(a.address)}.png"));
  assert.ok(!rail.includes("mods/x-mas-paper-rail/faces/${faceIndex(a.address)}.svg"));
  const accounts = sourceOf("x-mas-paper-accounts");
  assert.ok(accounts.includes("mods/x-mas-paper-accounts/faces/${face}.png"));
  assert.ok(!accounts.includes("mods/x-mas-paper-accounts/faces/${face}.svg"));
});
