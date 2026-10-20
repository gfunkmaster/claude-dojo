import assert from "node:assert/strict";
import { test } from "node:test";
import { addUsage, costUsd, ZERO_USAGE } from "../src/core/pricing.ts";

test("cost uses per-model prices for every token type", () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 };
  assert.equal(costUsd("claude-opus-5-5", usage), 4 + 20 + 0.2 + 5);
  assert.ok(Math.abs(costUsd("claude-haiku-5-5", usage) - 0.735) < 1e-9);
  assert.equal(costUsd("unknown-model", usage), 0);
});

test("usage adds up", () => {
  const one = { inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4 };
  assert.deepEqual(addUsage(addUsage(ZERO_USAGE, one), one), { inputTokens: 2, outputTokens: 4, cacheReadTokens: 6, cacheWriteTokens: 8 });
});
