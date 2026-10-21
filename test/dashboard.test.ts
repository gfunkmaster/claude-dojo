import assert from "node:assert/strict";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { RunResult } from "../src/core/result.ts";
import { defaultSource, loadDashboard, loadExerciseDetail, loadRun, runId, type DashboardSource } from "../src/dashboard/index.ts";
import { JsonResultStore } from "../src/store/json-store.ts";
import { EXERCISES_DIR, tempDir } from "./helpers.ts";

const run = (id: string, startedAt: string, score: number, failedCriteria: string[] = []): RunResult => ({
  schemaVersion: 1,
  exerciseId: id,
  skill: "prompting",
  type: "prompt",
  startedAt,
  durationMs: 1200,
  score,
  passed: score >= 70,
  checkScore: 1,
  judgeScore: 0.5,
  judgeNote: "note",
  cases: [{ name: "case 1", checks: [{ check: "json-valid", passed: true, detail: "ok" }] }],
  criteria: [{ id: "no-invented-values", weight: 2, grade: "partial", reasoning: "half", tip: "use null" }],
  failedCriteria,
  summary: "summary",
  tokens: { input: 100, output: 20, cacheRead: 5, cacheWrite: 1 },
  costUsd: 0.01,
  turns: 1,
  models: ["claude-haiku-5-5", "claude-opus-5-5"],
  solutionHash: "abc",
});

async function source(): Promise<DashboardSource & { home: string; store: JsonResultStore }> {
  const home = await tempDir();
  return {
    home,
    exercisesDir: EXERCISES_DIR,
    generatedDir: path.join(home, "generated"),
    store: new JsonResultStore(path.join(home, "results")),
    backend: "claude-cli",
  };
}

test("a fresh home shows the whole path, nothing passed, and the first exercise as next", async () => {
  const src = await source();
  const d = await loadDashboard(src);
  assert.equal(d.exercises.length, 21);
  assert.deepEqual(
    d.exercises.map((e) => e.position),
    d.exercises.map((_, i) => i + 1),
  );
  assert.ok(d.exercises.every((e) => e.state === "new" && e.best === null && e.calibration === "not-yet"));
  assert.equal(d.next?.id, "prompt-extract-invoice");
  assert.equal(d.skills.length, 7);
  assert.ok(d.skills.every((s) => s.runs === 0 && s.trend.length === 0 && s.total === 3));
  assert.deepEqual(d.recentRuns, []);
  assert.deepEqual(d.due, []);
  assert.deepEqual(d.warnings, []);
});

test("runs give status, best score, per-skill trend and the next exercise", async () => {
  const src = await source();
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-20T09:00:00.000Z", 40, ["no-invented-values"]));
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-20T10:00:00.000Z", 85));
  await src.store.saveRun(run("prompting-few-shot-tone", "2026-10-20T11:00:00.000Z", 55, ["tone", "no-invented-values"]));
  await src.store.saveCalibration({ schemaVersion: 1, exerciseId: "prompting-few-shot-tone", at: "2026-10-20T08:00:00.000Z", ok: false, references: [], costUsd: 0 });

  const d = await loadDashboard(src);
  const invoice = d.exercises.find((e) => e.id === "prompt-extract-invoice");
  assert.equal(invoice?.state, "passed");
  assert.equal(invoice?.best, 85);
  assert.equal(invoice?.runs, 2);
  assert.equal(invoice?.lastRunAt, "2026-10-20T10:00:00.000Z");
  const tone = d.exercises.find((e) => e.id === "prompting-few-shot-tone");
  assert.equal(tone?.state, "attempted");
  assert.equal(tone?.calibration, "unreliable");

  const prompting = d.skills.find((s) => s.skill === "prompting");
  assert.deepEqual(prompting?.trend.map((p) => p.score), [40, 85, 55]);
  assert.equal(prompting?.last, 55);
  assert.equal(prompting?.best, 85);
  assert.equal(prompting?.passed, 1);
  assert.deepEqual(prompting?.mostMissed[0], { id: "no-invented-values", count: 2 });

  // Level 1 prompting is passed, so the path moves on to level 1 context.
  assert.equal(d.next?.id, "context-project-commands");
  assert.deepEqual(d.recentRuns.map((r) => r.score), [55, 85, 40]);
  assert.equal(d.totals.runs, 3);
  assert.equal(d.totals.passed, 1);
});

test("on a subscription the API-only exercises are marked and never picked as next", async () => {
  const src = await source();
  const d = await loadDashboard(src);
  const apiOnly = d.exercises.filter((e) => e.type === "tools" || e.type === "request");
  assert.ok(apiOnly.length > 0);
  assert.ok(apiOnly.every((e) => e.needsApi));
  assert.ok(d.exercises.filter((e) => e.type === "prompt").every((e) => !e.needsApi));

  const api = await loadDashboard({ ...src, backend: "api" });
  assert.ok(api.exercises.every((e) => !e.needsApi));
});

test("generated exercises are listed as your own", async () => {
  const src = await source();
  await cp(path.join(EXERCISES_DIR, "prompt/extract-invoice"), path.join(src.generatedDir, "my-invoice"), { recursive: true });
  // Same exercise under a new id, as `dojo analyze --generate` would write it.
  const md = path.join(src.generatedDir, "my-invoice/exercise.md");
  await writeFile(md, (await readFile(md, "utf8")).replace("id: prompt-extract-invoice", "id: my-invoice"));
  const d = await loadDashboard(src);
  assert.equal(d.exercises.length, 22);
  assert.equal(d.exercises.find((e) => e.id === "my-invoice")?.generated, true);
  assert.equal(d.exercises.find((e) => e.id === "prompt-extract-invoice")?.generated, false);
});

test("a run is found by its id and carries checks, judge feedback, tokens and turns", async () => {
  const src = await source();
  const r = run("prompt-extract-invoice", "2026-10-20T09:00:00.000Z", 62);
  await src.store.saveRun(r);
  const id = runId(r);
  assert.equal(id, "2026-10-20T09-00-00-000Z_prompt-extract-invoice");

  const detail = await loadRun(src, id);
  assert.equal(detail?.title, "Extrahera fakturadata");
  assert.equal(detail?.run.score, 62);
  assert.equal(detail?.totalTokens, 126);
  assert.equal(detail?.run.turns, 1);
  assert.equal(detail?.run.criteria[0]?.tip, "use null");

  assert.equal(await loadRun(src, "2026-10-20T09-00-00-000Z_missing"), null);
  assert.equal(await loadRun(src, "nonsense"), null);
});

test("an exercise's detail lists its runs newest first", async () => {
  const src = await source();
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-20T09:00:00.000Z", 40));
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-20T10:00:00.000Z", 90));
  const detail = await loadExerciseDetail(src, "prompt-extract-invoice");
  assert.deepEqual(detail?.runs.map((r) => r.score), [90, 40]);
  assert.ok(detail?.exercise.body.length);
  assert.equal(await loadExerciseDetail(src, "missing"), null);
});

test("reviews come from the runs: failed ones first, deleted and API-only exercises left out", async () => {
  const src = await source();
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-10T09:00:00.000Z", 40, ["no-invented-values"]));
  await src.store.saveRun(run("prompting-few-shot-tone", "2026-10-10T09:00:00.000Z", 90));
  await src.store.saveRun(run("deleted-exercise", "2026-10-10T09:00:00.000Z", 30));
  await src.store.saveRun({ ...run("tools-describe-tools", "2026-10-10T09:00:00.000Z", 30), skill: "tools", type: "tools" });
  // Passed today: not due yet.
  await src.store.saveRun({ ...run("context-project-commands", "2026-10-21T09:00:00.000Z", 90), skill: "context" });

  const d = await loadDashboard(src, new Date("2026-10-21T12:00:00.000Z"));
  assert.deepEqual(d.due.map((r) => r.entry.exerciseId), ["prompt-extract-invoice", "prompting-few-shot-tone"]);
  assert.equal(d.due[0]?.title, "Extrahera fakturadata");
  assert.deepEqual(d.due[0]?.entry.missed, ["no-invented-values"]);
  assert.equal(d.due[0]?.command, "dojo run prompt-extract-invoice");
  assert.equal(d.due[1]?.command, "dojo run prompting-few-shot-tone --fresh");

  const api = await loadDashboard({ ...src, backend: "api" }, new Date("2026-10-21T12:00:00.000Z"));
  assert.ok(api.due.some((r) => r.entry.exerciseId === "tools-describe-tools"));
});

test("a truncated result file is skipped instead of breaking every page", async () => {
  const src = await source();
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-20T09:00:00.000Z", 80));
  await writeFile(path.join(src.home, "results", "2026-10-20T10-00-00-000Z_prompt-extract-invoice.json"), '{"schemaVer');
  const d = await loadDashboard(src);
  assert.equal(d.totals.runs, 1);
});

test("defaultSource follows DOJO_HOME, DOJO_EXERCISES and DOJO_BACKEND like the CLI", async () => {
  const home = await tempDir();
  await mkdir(path.join(home, "results"));
  const src = defaultSource("/repo", { DOJO_HOME: home, DOJO_EXERCISES: "/ex", DOJO_BACKEND: "api" });
  assert.equal(src.exercisesDir, "/ex");
  assert.equal(src.generatedDir, path.join(home, "generated"));
  assert.equal(src.backend, "api");

  const plain = defaultSource("/repo", {});
  assert.equal(plain.exercisesDir, path.join("/repo", "exercises"));
  assert.equal(plain.backend, "claude-cli");
  // A typo in DOJO_BACKEND shouldn't hide your results.
  assert.equal(defaultSource("/repo", { DOJO_BACKEND: "nope" }).backend, "claude-cli");
});
