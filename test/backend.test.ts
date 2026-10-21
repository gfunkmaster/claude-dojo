import assert from "node:assert/strict";
import { cp } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli/index.ts";
import { loadExercises } from "../src/core/exercise.ts";
import { API_ONLY_TYPES, resolveBackend } from "../src/llm/backend.ts";
import { ClaudeCliLlmClient } from "../src/llm/claude-cli-client.ts";
import { EXERCISES_DIR, testContext } from "./helpers.ts";

test("the backend follows DOJO_BACKEND, else the API key", () => {
  assert.equal(resolveBackend({}), "claude-cli");
  assert.equal(resolveBackend({ ANTHROPIC_API_KEY: "sk-ant-FAKE" }), "api");
  assert.equal(resolveBackend({ ANTHROPIC_API_KEY: "sk-ant-FAKE", DOJO_BACKEND: "claude-cli" }), "claude-cli");
  assert.equal(resolveBackend({ DOJO_BACKEND: "api" }), "api");
  assert.throws(() => resolveBackend({ DOJO_BACKEND: "openai" }), /DOJO_BACKEND must be one of/);
});

/** A test context where prompt exercises and the judge go through the fake `claude -p`. */
async function subscriptionContext() {
  const ctx = await testContext();
  const llm = new ClaudeCliLlmClient(ctx.fakeClaude);
  return { ...ctx, backend: "claude-cli" as const, llm: () => llm };
}

const { exercises } = await loadExercises(EXERCISES_DIR);

for (const ex of exercises.filter((e) => !API_ONLY_TYPES.includes(e.type))) {
  test(`${ex.id}: calibrates on the claude-cli backend`, async () => {
    const ctx = await subscriptionContext();
    assert.equal(await main(["run", ex.id, "--calibrate"], ctx), 0, ctx.lines.join("\n"));
    assert.equal((await ctx.store.getCalibration(ex.id))?.ok, true);
    assert.equal(ctx.fakeLlm.calls.length + ctx.fakeLlm.structuredCalls.length, 0, "nothing goes to the API");
    assert.ok(ctx.fakeClaude.asks.some((a) => a.jsonSchema), "the judge asks for structured output");
    assert.ok(ctx.lines.some((l) => l.includes("subscription covers it")));
  });
}

test("on the claude-cli backend, tools and request exercises say they need the API", async () => {
  const ctx = await subscriptionContext();
  const ex = exercises.find((e) => e.type === "tools");
  assert.ok(ex);
  assert.equal(await main(["run", ex.id], ctx), 0, "setting up the workspace still works");
  assert.equal(await main(["run", ex.id], ctx), 1);
  assert.ok(ctx.lines.some((l) => l.includes("DOJO_BACKEND=api")));
  assert.equal(await main(["run", ex.id, "--calibrate"], ctx), 1);
  assert.equal(ctx.fakeLlm.sent.length, 0);
});

test("on the claude-cli backend, next skips exercises that need the API", async () => {
  const ctx = await subscriptionContext();
  // Pass every beginner exercise that runs on a subscription.
  for (const ex of exercises.filter((e) => e.difficulty === 1 && !API_ONLY_TYPES.includes(e.type))) {
    await main(["run", ex.id], ctx);
    await cp(path.join(ex.dir, "refs/good"), path.join(ctx.workspaceDir, ex.id), { recursive: true, force: true });
    assert.equal(await main(["run", ex.id], ctx), 0, ctx.lines.join("\n"));
  }
  ctx.lines.length = 0;
  await main(["next"], ctx);
  const out = ctx.lines.join("\n");
  assert.doesNotMatch(out, /dojo run tools-describe-tools/);
  assert.match(out, /Skipping 5 tools\/request exercises/);
});
