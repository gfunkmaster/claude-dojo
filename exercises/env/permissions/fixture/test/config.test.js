import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config.js";

test("defaults", () => {
  assert.equal(config.logLevel, "info");
});
