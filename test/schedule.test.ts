import assert from "node:assert/strict";
import { cp, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli/index.ts";
import { skillProgress, sparkline, weakestSkills } from "../src/core/progress.ts";
import type { RunResult } from "../src/core/result.ts";
import { BOX_DAYS, buildSchedule, dueEntries } from "../src/core/schedule.ts";
import { readSchedule } from "../src/store/schedule-file.ts";
import { EXERCISES_DIR, testContext } from "./helpers.ts";

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (days: number) => new Date(T0 + days * DAY).toISOString();

const run = (id: string, day: number, score: number, extra: Partial<RunResult> = {}): RunResult => ({
  schemaVersion: 1,
  exerciseId: id,
  skill: "prompting",
  type: "prompt",
  startedAt: at(day),
  durationMs: 10,
  score,
  passed: score >= 70,
  checkScore: 1,
  judgeScore: null,
  cases: [],
  criteria: [],
  failedCriteria: score >= 70 ? [] : ["no-invented-values"],
  summary: "",
  tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0.01,
  turns: 1,
  models: [],
  solutionHash: "abc",
  ...extra,
});

const only = (runs: RunResult[]) => {
  const [entry, ...rest] = buildSchedule(runs);
  assert.ok(entry);
  assert.equal(rest.length, 0);
  return entry;
};

test("a fail comes back tomorrow with what you missed", () => {
  const e = only([run("a", 0, 40)]);
  assert.equal(e.box, 1);
  assert.equal(e.dueAt, at(1));
  assert.deepEqual(e.missed, ["no-invented-values"]);
  assert.equal(e.fails, 1);
});

test("a solid pass moves up a box, a shaky pass stays, a fail drops to box 1", () => {
  assert.equal(only([run("a", 0, 90)]).box, 2);
  assert.equal(only([run("a", 0, 75)]).box, 1);
  const climbing = [run("a", 0, 90), run("a", 3, 95), run("a", 10, 100)];
  const e = only(climbing);
  assert.equal(e.box, 4);
  assert.equal(e.dueAt, at(10 + (BOX_DAYS[3] ?? 0)));
  assert.equal(only([...climbing, run("a", 25, 75)]).box, 4, "shaky on time keeps the box");
  const lapsed = only([...climbing, run("a", 25, 50)]);
  assert.equal(lapsed.box, 1);
  assert.equal(lapsed.dueAt, at(26));
});

test("passing again before it is due proves nothing new", () => {
  const e = only([run("a", 0, 40), run("a", 0.1, 95), run("a", 0.2, 95)]);
  assert.equal(e.box, 1, "fixing a fail the same day still brings it back tomorrow");
  assert.equal(e.dueAt, at(1));
  assert.equal(e.runs, 3);
  assert.equal(e.lastPassed, true);
  assert.equal(only([run("a", 0, 40), run("a", 0.1, 95), run("a", 1, 95)]).box, 2);
});

test("the top box caps at the longest interval", () => {
  const runs = [0, 3, 10, 30, 70, 120].map((d) => run("a", d, 100));
  const e = only(runs);
  assert.equal(e.box, BOX_DAYS.length);
  assert.equal(e.dueAt, at(120 + (BOX_DAYS.at(-1) ?? 0)));
});

test("the schedule is the same whatever order the runs are read in", () => {
  const runs = [run("a", 0, 40), run("b", 0, 90), run("a", 1, 90), run("b", 3, 60)];
  assert.deepEqual(buildSchedule(runs), buildSchedule([...runs].reverse()));
});

test("due reviews put failed ones first, then the most overdue", () => {
  const entries = buildSchedule([run("solid", 0, 90), run("old", -10, 90), run("failed", 2, 40)]);
  assert.deepEqual(dueEntries(entries, new Date(at(20))).map((e) => e.exerciseId), ["failed", "old", "solid"]);
  assert.deepEqual(dueEntries(entries, new Date(at(2.5))).map((e) => e.exerciseId), ["old"]);
});

test("skill progress: mastery from latest scores, trend, weakest first", () => {
  const runs = [
    run("a", 0, 40),
    run("a", 1, 80),
    run("b", 2, 60),
    run("c", 0, 30, { skill: "env", type: "env" }),
    run("c", 1, 20, { skill: "env", type: "env" }),
  ];
  const [prompting, env] = skillProgress(runs);
  assert.equal(prompting?.skill, "prompting");
  assert.equal(prompting?.mastery, 70, "mean of a's latest (80) and b's (60)");
  assert.equal(prompting?.trend, -20, "with 3 runs: the last (60) against the one before it (80)");
  assert.equal(env?.mastery, 20);
  assert.deepEqual(weakestSkills(skillProgress(runs), 1).map((p) => p.skill), ["env"]);
  assert.equal(skillProgress([run("a", 0, 50)])[0]?.trend, null);
  assert.equal(sparkline([0, 50, 100]), "▁▅█");
});

test("review, next and stats follow the schedule", async () => {
  const ctx = await testContext();
  assert.equal(await main(["review"], ctx), 0);
  assert.match(ctx.lines.join("\n"), /Nothing to review yet/);

  const id = "prompt-extract-invoice";
  await main(["run", id], ctx);
  await main(["run", id], ctx); // the starter fails
  assert.match(ctx.lines.join("\n"), /Next review: (tomorrow|today) \(box 1\)/);
  const snapshot = await readSchedule(ctx.scheduleFile);
  assert.equal(snapshot?.entries[0]?.exerciseId, id, "the snapshot is written after a graded run");

  ctx.now = () => new Date(Date.now() + 2 * DAY);
  ctx.lines.length = 0;
  await main(["review"], ctx);
  const review = ctx.lines.join("\n");
  assert.match(review, /Due now \(1\)/);
  assert.match(review, new RegExp(`Start with: dojo run ${id}$`, "m"), "a failed exercise continues in the same workspace");

  ctx.lines.length = 0;
  await main(["next"], ctx);
  assert.match(ctx.lines.join("\n"), /Review due \(1 in total\).*\n.*Last score.*\n.*dojo run prompt-extract-invoice/);

  // Solve it: it leaves the due list and next goes back to the path.
  await cp(path.join(EXERCISES_DIR, "prompt/extract-invoice/refs/good"), path.join(ctx.workspaceDir, id), { recursive: true, force: true });
  ctx.now = undefined;
  assert.equal(await main(["run", id], ctx), 0);
  ctx.lines.length = 0;
  await main(["next"], ctx);
  assert.match(ctx.lines.join("\n"), /2\/24, nybörjare, context/);

  ctx.lines.length = 0;
  await main(["stats"], ctx);
  const stats = ctx.lines.join("\n");
  assert.match(stats, /SKILL\s+RUNS\s+MASTERY\s+TREND/);
  assert.match(stats, /^prompting\s+2\s+\d+\s+\+\d+/m);

  // Weeks later a passed exercise is due again, and you redo it from the starter.
  ctx.now = () => new Date(Date.now() + 40 * DAY);
  ctx.lines.length = 0;
  await main(["review"], ctx);
  assert.match(ctx.lines.join("\n"), new RegExp(`Start with: dojo run ${id} --fresh`));
  await main(["run", id, "--fresh"], ctx);
  const names = await readdir(ctx.workspaceDir);
  assert.ok(names.some((n) => n.startsWith(`${id}.old-`)), "the old solution is kept, not deleted");
  assert.ok(names.includes(id));
  assert.ok(ctx.lines.some((l) => l.includes("Your workspace")), "fresh starts over from the starter");
});

test("runs of exercises that no longer exist drop out of the review", async () => {
  const ctx = await testContext();
  await ctx.store.saveRun(run("my-deleted-draft", 0, 30));
  ctx.now = () => new Date(at(5));
  await main(["review"], ctx);
  assert.doesNotMatch(ctx.lines.join("\n"), /my-deleted-draft/);
});
