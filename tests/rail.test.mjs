// Tests for the rail's neutral site values: a space name's ticket key, read from site.js's
// SPACE_KEY. Run: node --import ./tests/stubs/register.mjs --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spaceName } from "../mods/x-mas-paper-rail/main.js";

test("a space name carries an uppercase ticket key; lowercase words carry none", () => {
  assert.equal(spaceName("SNOW-24 snow").key, "SNOW-24");
  assert.equal(spaceName("web-app-2").key, null);
});
