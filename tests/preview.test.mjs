// Tests for the picture tooling: the layout build-layout.py hands the preview window shows only
// invented demo data, both layouts carry their preview picture, and install.sh copies that picture
// with the layouts. Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BUILD = join(ROOT, "tools/preview/build-layout.py");
const TERM_MOD = "x-mas-paper-demo-term";

function blocks(node, out = []) {
  if (node?.content) out.push(node);
  for (const child of node.children ?? []) blocks(child, out);
  for (const child of node.floating ?? []) blocks(child, out);
  return out;
}

test("the picture layout reads demo data everywhere and swaps the terminal for a fake one", () => {
  const layout = JSON.parse(execFileSync("python3", [BUILD], { encoding: "utf8" }));
  const all = blocks(layout);
  const withMod = (mod) => all.filter((node) => node.content?.mod === mod);

  const scene = withMod("x-mas-paper-scene");
  assert.equal(scene.length, 1, "one scene block");
  assert.equal(scene[0].content.props?.demo, true, "the scene draws the demo village");

  const rail = withMod("x-mas-paper-rail");
  assert.equal(rail.length, 2, "the spaces rail and its buttons");
  for (const node of rail) assert.equal(node.content.props?.demo, true, "the rail draws demo spaces");
  assert.equal(rail.find((node) => node.content.props?.role === "buttons")?.content.props.demo, true,
    "the buttons copy keeps its role and gets the demo");

  const accounts = withMod("x-mas-paper-accounts");
  assert.equal(accounts.length, 1, "one accounts block");
  assert.equal(accounts[0].content.props?.demo, true, "the accounts draw demo badges");
  assert.equal(accounts[0].content.props?.role, "rail", "the accounts keep their role");

  const tabs = withMod("x-mas-paper-tabs");
  assert.equal(tabs.length, 1, "one tabs block");
  assert.equal(tabs[0].content.props?.demo, true, "the tabs draw demo tabs");

  const terms = withMod(TERM_MOD);
  assert.equal(terms.length, 1, "the terminal block becomes one demo terminal");
  assert.equal(terms[0].id, "main", "the demo terminal takes the main block's place");
  assert.equal(all.some((node) => node.content?.tab || node.content?.pane), false,
    "no block still shows a real tab or its terminal");
});

test("both layouts name the picture the layout picker shows", () => {
  for (const name of ["x-mas-paper.json", "x-mas-paper-demo.json"]) {
    const layout = JSON.parse(readFileSync(join(ROOT, "layouts", name), "utf8"));
    assert.equal(layout.preview, "layouts/x-mas-paper.png", name);
  }
});

test("install.sh copies the layout picture with the layouts", () => {
  const root = mkdtempSync(join(tmpdir(), "xmas-paper-picture-"));
  try {
    const repo = join(root, "repo");
    const bin = join(root, "bin");
    const app = join(root, "app");
    mkdirSync(join(repo, "tools"), { recursive: true });
    mkdirSync(bin, { recursive: true });
    copyFileSync(join(ROOT, "tools/install.sh"), join(repo, "tools/install.sh"));
    symlinkSync(join(ROOT, "mods"), join(repo, "mods"), "dir");
    cpSync(join(ROOT, "layouts"), join(repo, "layouts"), { recursive: true });
    cpSync(join(ROOT, "themes"), join(repo, "themes"), { recursive: true });
    const stubApp = join(bin, "herdr-app");
    writeFileSync(stubApp, "#!/bin/sh\nexit 0\n");
    chmodSync(stubApp, 0o755);

    // A one-pixel PNG stands in for the rendered picture; the install only has to move it.
    const picture = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64");
    writeFileSync(join(repo, "layouts/x-mas-paper.png"), picture);

    execFileSync("sh", [join(repo, "tools/install.sh")], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, HERDR_APP_HOME: app },
      stdio: "pipe",
    });
    assert.deepEqual(readFileSync(join(app, "layouts/x-mas-paper.png")), picture,
      "the layout picture lands beside the layouts");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
