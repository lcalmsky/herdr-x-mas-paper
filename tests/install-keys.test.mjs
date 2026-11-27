// The install never creates or edits the person's keys.json. Every run is sandboxed in a temp
// folder, with a stub herdr-app and no herdr-shared.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const INSTALL = join(ROOT, "tools/install.sh");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

// Runs the install in a temp root and hands back the state of app/keys.json.
function installWith(keys) {
  const root = mkdtempSync(join(tmpdir(), "xmas-paper-keys-"));
  try {
    const app = join(root, "app");
    const bin = join(root, "bin");
    mkdirSync(app, { recursive: true });
    mkdirSync(bin, { recursive: true });
    const stubApp = join(bin, "herdr-app");
    writeFileSync(stubApp, "#!/bin/sh\nexit 0\n");
    chmodSync(stubApp, 0o755);
    const keysPath = join(app, "keys.json");
    if (keys !== null) writeFileSync(keysPath, keys);
    const before = existsSync(keysPath) ? sha(keysPath) : null;
    execFileSync("sh", [INSTALL], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HERDR_APP_HOME: app,
        HERDR_SHARED_HOME: join(root, "shared-home"),
        HERDR_SHARED: join(root, "no-shared"),
        // Never let the install read the real ~/.config/herdr-x-mas-paper/site.js.
        XMAS_SITE_JS: join(root, "absent-site.js"),
      },
      encoding: "utf8",
    });
    return { keysPath, before, after: existsSync(keysPath) ? sha(keysPath) : null };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("without keys.json the install does not create one", () => {
  const { after } = installWith(null);
  assert.equal(after, null, "the install does not create keys.json");
});

test("an existing keys.json is left byte-identical", () => {
  const keys = '{"global": {"cmd-k": "x"}}\n';
  const { before, after } = installWith(keys);
  assert.equal(after, before, "keys.json is byte-identical");
});
