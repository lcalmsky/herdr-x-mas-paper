// The copies come from the vendor/herdr-shared submodule, and its check-vendor.sh is the one
// authority on whether they drifted. A clone without the submodule skips this.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SHARED = process.env.HERDR_SHARED || join(REPO, "vendor", "herdr-shared");
const CHECK = join(SHARED, "tools", "check-vendor.sh");
const SKIP = existsSync(CHECK)
  ? false
  : `herdr-shared is not checked out at ${SHARED}; run git submodule update --init`;

test("the vendored runtime files match the vendor/herdr-shared submodule", { skip: SKIP }, () => {
  const out = execFileSync("sh", [CHECK, REPO], { encoding: "utf8" });
  assert.match(out, /files match herdr-shared/);
});
