import { test } from "node:test";
import assert from "node:assert/strict";
import { slugify } from "../src/slug.js";

test("slugify lowercases and joins words", () => {
  assert.equal(slugify("  Hello World  "), "hello-world");
  assert.equal(slugify("Claude Dojo 2026"), "claude-dojo-2026");
});
