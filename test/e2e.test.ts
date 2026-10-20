import assert from "node:assert/strict";
import { cp, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli/index.ts";
import { EXERCISES_DIR, testContext } from "./helpers.ts";

const EXERCISES = [
  { id: "prompt-extract-invoice", dir: "prompt/extract-invoice" },
  { id: "context-agents-md", dir: "context/agents-md" },
  { id: "env-hook-block-rm", dir: "env/hook-block-rm" },
  { id: "evals-eval-discriminates", dir: "evals/eval-discriminates" },
];

for (const ex of EXERCISES) {
  test(`${ex.id}: setup, grade, save and stats from start to finish`, async () => {
    const ctx = await testContext();

    assert.equal(await main(["run", ex.id], ctx), 0);
    const workspace = path.join(ctx.workspaceDir, ex.id);
    assert.ok((await stat(workspace)).isDirectory(), "first run creates the workspace");
    assert.ok(ctx.lines.some((l) => l.includes("Your workspace")));

    // The starter is graded too, and should not pass.
    assert.equal(await main(["run", ex.id], ctx), 1);

    // Solve it with the good reference answer.
    await cp(path.join(EXERCISES_DIR, ex.dir, "refs/good"), workspace, { recursive: true, force: true });
    assert.equal(await main(["run", ex.id], ctx), 0, ctx.lines.join("\n"));

    const runs = await ctx.store.listRuns(ex.id);
    assert.equal(runs.length, 2);
    const best = runs[1];
    assert.ok(best);
    assert.equal(best.passed, true);
    assert.ok(best.costUsd > 0, "cost is recorded");
    assert.ok(best.tokens.input > 0, "tokens are recorded");
    assert.ok(best.models.includes("claude-opus-5-5"), "judge model is recorded");

    ctx.lines.length = 0;
    assert.equal(await main(["stats", ex.id], ctx), 0);
    assert.ok(ctx.lines.some((l) => l.includes(String(best.score))));
  });

  test(`${ex.id}: calibration separates good from bad references`, async () => {
    const ctx = await testContext();
    assert.equal(await main(["run", ex.id, "--calibrate"], ctx), 0, ctx.lines.join("\n"));
    const cal = await ctx.store.getCalibration(ex.id);
    assert.equal(cal?.ok, true);
    assert.deepEqual(cal?.references.map((r) => r.label).sort(), ["bad", "good"]);
  });
}

test("env runs clean up their sandboxes unless asked to keep them", async () => {
  const ctx = await testContext();
  await main(["run", "env-hook-block-rm", "--calibrate"], ctx);
  for (const run of ctx.fakeClaude.runs) {
    await assert.rejects(stat(run.cwd), /ENOENT/);
  }
});

test("the hook exercise runs the real hook against the lure", async () => {
  const ctx = await testContext();
  await main(["run", "env-hook-block-rm"], ctx);
  const workspace = path.join(ctx.workspaceDir, "env-hook-block-rm");
  await cp(path.join(EXERCISES_DIR, "env/hook-block-rm/refs/good"), workspace, { recursive: true, force: true });
  await main(["run", "env-hook-block-rm", "--keep"], ctx);
  const [lure, harmless] = ctx.fakeClaude.runs;
  assert.ok(lure && harmless);
  assert.ok((await readdir(path.join(lure.cwd, "build/dist"))).includes("bundle.js"));
  await assert.rejects(stat(path.join(harmless.cwd, "build/old.log")), /ENOENT/);
});

test("list shows calibration status and best score", async () => {
  const ctx = await testContext();
  await main(["run", "prompt-extract-invoice", "--calibrate"], ctx);
  ctx.lines.length = 0;
  assert.equal(await main(["list"], ctx), 0);
  const row = ctx.lines.join("\n").split("\n").find((l) => l.startsWith("prompt-extract-invoice"));
  assert.match(row ?? "", /yes$/);
});

test("unknown commands and exercises fail with a message", async () => {
  const ctx = await testContext();
  assert.equal(await main(["nope"], ctx), 1);
  assert.equal(await main(["run", "does-not-exist"], ctx), 1);
  assert.equal(await main(["run"], ctx), 1);
  assert.equal(await main(["stats"], ctx), 0);
  assert.ok(ctx.lines.some((l) => l.includes("no runs yet")));
});
