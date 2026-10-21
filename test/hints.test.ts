import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { main } from "../src/cli/index.ts";
import { loadExercises } from "../src/core/exercise.ts";
import { ASSIST_WINDOW_MS, helpLevels, isAssisted, nextHintLevel, solutionUnlocked, type HintEvent } from "../src/core/help.ts";
import { buildHint, formatHint } from "../src/core/hints.ts";
import { skillProgress } from "../src/core/progress.ts";
import type { RunResult } from "../src/core/result.ts";
import { buildSchedule } from "../src/core/schedule.ts";
import { loadExerciseDetail } from "../src/dashboard/index.ts";
import { fetchHint, hintArgs, HintError } from "../src/dashboard/runner.ts";
import { JsonResultStore } from "../src/store/json-store.ts";
import { EXERCISES_DIR, PLAYBOOKS_DIR, tempDir, testContext } from "./helpers.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ID = "prompt-extract-invoice";
const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-10-01T10:00:00.000Z");
const at = (hours: number) => new Date(T0 + hours * HOUR).toISOString();

const run = (hours: number, score: number, extra: Partial<RunResult> = {}): RunResult => ({
  schemaVersion: 1,
  exerciseId: ID,
  skill: "prompting",
  type: "prompt",
  startedAt: at(hours),
  durationMs: 10,
  score,
  passed: score >= 70,
  checkScore: 1,
  judgeScore: null,
  cases: [],
  criteria: [],
  failedCriteria: [],
  summary: "",
  tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0,
  turns: 1,
  models: [],
  solutionHash: "abc",
  ...extra,
});
const hint = (hours: number, level: 1 | 2 | 3, exerciseId = ID): HintEvent => ({ schemaVersion: 1, exerciseId, level, at: at(hours) });

const { exercises } = await loadExercises(EXERCISES_DIR);
const invoice = exercises.find((e) => e.id === ID);
assert.ok(invoice);

test("a run within a day after the solution is assisted; hints alone, later runs and other exercises are not", () => {
  const solution = [hint(0, 3)];
  assert.equal(isAssisted(run(1, 95), solution), true);
  assert.equal(isAssisted(run(-1, 95), solution), false, "before you saw it");
  assert.equal(isAssisted(run(ASSIST_WINDOW_MS / HOUR, 95), solution), false, "a day later you recall it");
  assert.equal(isAssisted(run(1, 95), [hint(0, 2)]), false);
  assert.equal(isAssisted(run(1, 95), [hint(0, 3, "other")]), false);
});

test("help per run is what you saw since the run before it", () => {
  const runs = [run(0, 40), run(2, 60), run(4, 90), run(40, 95)];
  const hints = [hint(1, 1), hint(1.5, 2), hint(3, 3)];
  assert.deepEqual(helpLevels(runs, hints), [0, 2, 3, 0]);
});

test("each hint goes one level up, the solution only on request, and a pass starts over", () => {
  assert.equal(nextHintLevel(ID, [], []), 1);
  assert.equal(nextHintLevel(ID, [], [hint(0, 1)]), 2);
  assert.equal(nextHintLevel(ID, [], [hint(0, 1), hint(1, 2)]), 3);
  assert.equal(nextHintLevel(ID, [run(2, 90)], [hint(0, 1), hint(1, 2)]), 1, "hints before a pass are spent");
  assert.equal(solutionUnlocked(ID, []), false);
  assert.equal(solutionUnlocked(ID, [run(0, 10)]), true);
});

test("a pass right after the solution doesn't move the exercise up or count toward mastery", () => {
  // A fail, then the solution, then a pass once the review is due.
  const runs = [run(0, 40), run(25, 95)];
  const solution = [hint(24.5, 3)];
  assert.equal(buildSchedule(runs)[0]?.box, 2);
  const assisted = buildSchedule(runs, solution)[0];
  assert.equal(assisted?.box, 1);
  assert.equal(assisted?.dueAt, at(25 + 24), "it comes back tomorrow");
  // Solved from memory the next day: it moves up again.
  assert.equal(buildSchedule([...runs, run(50, 95)], solution)[0]?.box, 2);

  assert.equal(skillProgress(runs)[0]?.mastery, 95);
  assert.equal(skillProgress(runs, solution)[0]?.mastery, 40, "the last unassisted score counts");
  assert.equal(skillProgress([run(25, 95)], solution)[0]?.mastery, 0);
});

test("every exercise has a skeleton at level 2 and its good reference as the solution", async () => {
  for (const ex of exercises) {
    const one = await buildHint(ex, 1);
    assert.equal(one.outline.length, 0, ex.id);
    assert.equal(one.solution, null, ex.id);
    assert.ok(one.focus.length > 0 || ex.criteria.length === 0, ex.id);
    const two = await buildHint(ex, 2);
    assert.ok(two.outline.length > 0, ex.id);
    assert.equal(two.solution, null, ex.id);
    const three = await buildHint(ex, 3);
    const good = ex.references.find((r) => r.label === "good");
    assert.ok(good && three.solution, ex.id);
    for (const f of three.solution.files) {
      assert.equal(f.content, await readFile(path.join(ex.dir, good.dir, f.path), "utf8"), `${ex.id}: ${f.path}`);
    }
    assert.ok(three.solution.contrast.length > 0, ex.id);
    assert.ok(three.solution.explanation.length > 0, ex.id);
  }
});

test("a hint reads your last run: missed criteria first, the judge's tips only at level 2", async () => {
  const last = run(0, 50, {
    criteria: [
      { id: "concise", weight: 1, grade: "fail", reasoning: "long", tip: "cut it" },
      { id: "exact-schema", weight: 2, grade: "partial", reasoning: "no types", tip: "add types" },
      { id: "no-invented-values", weight: 2, grade: "pass", reasoning: "ok", tip: "" },
    ],
    cases: [{ name: "case", checks: [{ check: "json-valid", passed: false, detail: "not JSON" }] }],
  });
  const one = await buildHint(invoice, 1, last);
  assert.deepEqual(one.focus.map((f) => f.id), ["concise", "exact-schema"]);
  assert.equal(one.focus[0]?.tip, undefined);
  assert.deepEqual(one.failedChecks, [{ case: "case", check: "json-valid", detail: "not JSON" }]);
  const two = await buildHint(invoice, 2, last);
  assert.equal(two.focus[1]?.tip, "add types");
  assert.ok(formatHint(two).some((l) => l.includes("tip: add types")));
  assert.ok(two.outline[0]?.skeleton.every((l) => l.split(" ").length <= 6 || l.startsWith("{")), "lines are cut short");

  const skipped = await buildHint(invoice, 1, run(0, 20, { failedCriteria: ["concise"] }));
  assert.equal(skipped.judgeSkipped, true);
  assert.equal(skipped.focus.length, invoice.criteria.length);
});

test("dojo hint steps up, records what you saw, and keeps the solution until you have tried", async () => {
  const ctx = await testContext();
  let clock = T0;
  ctx.now = () => new Date((clock += 60_000));

  assert.equal(await main(["hint", ID], ctx), 0);
  assert.ok(ctx.lines.some((l) => l.startsWith("Hint 1")));
  ctx.lines.length = 0;
  assert.equal(await main(["hint", ID], ctx), 0);
  assert.ok(ctx.lines.some((l) => l.startsWith("Hint 2")));
  assert.ok(ctx.lines.some((l) => l.includes("first words")));
  ctx.lines.length = 0;
  assert.equal(await main(["hint", ID], ctx), 0);
  assert.ok(ctx.lines.some((l) => l.includes("--solution")));
  assert.equal(await main(["hint", ID, "--solution"], ctx), 1, "no attempt yet");
  assert.equal(await main(["hint", ID, "--level", "4"], ctx), 1);
  assert.deepEqual((await ctx.store.listHints(ID)).map((h) => h.level), [1, 2]);

  await ctx.store.saveRun(run(0, 30));
  ctx.lines.length = 0;
  assert.equal(await main(["hint", ID, "--solution"], ctx), 0);
  const out = ctx.lines.join("\n");
  assert.ok(out.includes(await readFile(path.join(invoice.dir, "refs/good/system.md"), "utf8").then((t) => t.trimEnd())));
  assert.ok(out.includes("Why it works"));

  ctx.lines.length = 0;
  assert.equal(await main(["hint", ID, "--level", "1", "--json"], ctx), 0);
  assert.equal(ctx.lines.length, 1);
  assert.equal((JSON.parse(ctx.lines[0] ?? "") as { level: number }).level, 1);
});

test("stats show the help you had for each run", async () => {
  const ctx = await testContext();
  await ctx.store.saveRun(run(0, 30));
  await ctx.store.saveHint(hint(1, 3));
  await ctx.store.saveRun(run(2, 95));
  assert.equal(await main(["stats", ID], ctx), 0);
  const rows = ctx.lines.join("\n").split("\n").filter((l) => l.startsWith("2026-"));
  assert.equal(rows.length, 2);
  assert.match(rows[1] ?? "", /solution/);
  assert.doesNotMatch(rows[0] ?? "", /solution/);
});

test("the web UI gets hints from `dojo hint`, which refuses the solution before an attempt", async () => {
  assert.throws(() => hintArgs(REPO_ROOT, "../x", 1));
  assert.throws(() => hintArgs(REPO_ROOT, ID, 4 as 1));
  assert.deepEqual(hintArgs(REPO_ROOT, ID, 2).slice(1), ["hint", ID, "--level", "2", "--json"]);

  const home = await tempDir();
  const opts = { repoRoot: REPO_ROOT, env: { ...process.env, DOJO_HOME: home } };
  const h = await fetchHint(opts, ID, 2);
  assert.equal(h.level, 2);
  assert.ok(h.outline.length > 0);
  await assert.rejects(fetchHint(opts, ID, 3), (err: unknown) => err instanceof HintError && /first graded run/.test(err.message));

  const store = new JsonResultStore(path.join(home, "results"));
  assert.deepEqual((await store.listHints()).map((e) => e.level), [2]);
  const detail = await loadExerciseDetail(
    {
      repoRoot: REPO_ROOT,
      exercisesDir: EXERCISES_DIR,
      generatedDir: path.join(home, "generated"),
      store,
      workspaceDir: path.join(home, "workspace"),
      playbooksDir: PLAYBOOKS_DIR,
      backend: "claude-cli",
    },
    ID,
  );
  assert.deepEqual(detail?.hints, { next: 3, solutionUnlocked: false });
});

test("hand-written hints and an explanation in the frontmatter win over the derived ones", async () => {
  assert.ok(invoice.hints && invoice.hints.length > 0 && invoice.explanation);
  const two = await buildHint(invoice, 2);
  assert.deepEqual(two.nudges, invoice.hints);
  const three = await buildHint(invoice, 3);
  assert.equal(three.solution?.explanation.length, 3);
  assert.match(three.solution?.explanation[0] ?? "", /JSON/);
});
