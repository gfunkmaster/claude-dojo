import assert from "node:assert/strict";
import { cp, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli/index.ts";
import { loadExercises, SKILLS } from "../src/core/exercise.ts";
import { EXERCISES_DIR, testContext } from "./helpers.ts";

// Every bundled exercise must run end to end and calibrate offline.
const { exercises: ALL } = await loadExercises(EXERCISES_DIR);
const EXERCISES = ALL.map((e) => ({ id: e.id, dir: path.relative(EXERCISES_DIR, e.dir) }));

test("the curriculum covers every skill at every level", () => {
  for (const skill of SKILLS) {
    for (const level of [1, 2, 3]) {
      assert.ok(ALL.some((e) => e.skill === skill && e.difficulty === level), `missing ${skill} at level ${level}`);
    }
  }
});

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
  const row = ctx.lines.join("\n").split("\n").find((l) => l.includes("prompt-extract-invoice"));
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

test("next walks the path from beginner to elite", async () => {
  const ctx = await testContext();
  assert.equal(await main(["next"], ctx), 0);
  assert.match(ctx.lines.join("\n"), /1\/24, nybörjare, prompting.*\n.*dojo run prompt-extract-invoice/);

  await main(["run", "prompt-extract-invoice"], ctx);
  await cp(path.join(EXERCISES_DIR, "prompt/extract-invoice/refs/good"), path.join(ctx.workspaceDir, "prompt-extract-invoice"), { recursive: true, force: true });
  await main(["run", "prompt-extract-invoice"], ctx);

  ctx.lines.length = 0;
  await main(["next"], ctx);
  assert.match(ctx.lines.join("\n"), /2\/24, nybörjare, context.*\n.*dojo run context-project-commands/);
});

test("playbook lists the ticket routines and prints one", async () => {
  const ctx = await testContext();
  assert.equal(await main(["playbook"], ctx), 0);
  const listing = ctx.lines.join("\n");
  for (const name of ["feature", "bugfix", "research"]) assert.match(listing, new RegExp(`^${name}\\s+\\S`, "m"));

  ctx.lines.length = 0;
  assert.equal(await main(["playbook", "bugfix"], ctx), 0);
  assert.match(ctx.lines.join("\n"), /^# Bugg-ärende[\s\S]*## Promptmall[\s\S]*```text/);

  assert.equal(await main(["playbook", "deploy"], ctx), 1);
});

test("every ticket exercise points to a playbook, and the first run names it", async () => {
  const tickets = ALL.filter((e) => e.playbook);
  assert.deepEqual(tickets.map((e) => e.playbook).sort(), ["bugfix", "feature", "research"]);
  const ctx = await testContext();
  assert.equal(await main(["run", "ticket-feature"], ctx), 0);
  assert.ok(ctx.lines.some((l) => l.includes("dojo playbook feature")));
});
