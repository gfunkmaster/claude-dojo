import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClaudeJson } from "../src/llm/claude-cli.ts";

test("parses claude -p --output-format json", () => {
  const out = parseClaudeJson(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 6,
      result: "Added the endpoint.",
      total_cost_usd: 0.1234,
      usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 800 },
      modelUsage: { "claude-sonnet-5-5": {} },
    }),
  );
  assert.equal(out.turns, 6);
  assert.equal(out.costUsd, 0.1234);
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 800 });
  assert.deepEqual(out.models, ["claude-sonnet-5-5"]);
});

test("tolerates missing optional fields", () => {
  const out = parseClaudeJson(JSON.stringify({ result: "x" }));
  assert.equal(out.turns, 0);
  assert.equal(out.isError, false);
});
