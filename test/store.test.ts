import assert from "node:assert/strict";
import { test } from "node:test";
import type { RunResult } from "../src/core/result.ts";
import { JsonResultStore } from "../src/store/json-store.ts";
import { tempDir } from "./helpers.ts";

const run = (id: string, startedAt: string): RunResult => ({
  schemaVersion: 1,
  exerciseId: id,
  skill: "prompting",
  type: "prompt",
  startedAt,
  durationMs: 10,
  score: 80,
  passed: true,
  checkScore: 1,
  judgeScore: 0.6,
  cases: [],
  criteria: [],
  failedCriteria: [],
  summary: "",
  tokens: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0.01,
  turns: 1,
  models: ["claude-haiku-5-5"],
  solutionHash: "abc",
});

test("runs are saved, listed in order and never overwritten", async () => {
  const store = new JsonResultStore(await tempDir());
  await store.saveRun(run("b", "2026-10-20T10:00:00.000Z"));
  await store.saveRun(run("a", "2026-10-20T09:00:00.000Z"));
  assert.deepEqual((await store.listRuns()).map((r) => r.exerciseId), ["a", "b"]);
  assert.deepEqual((await store.listRuns("b")).map((r) => r.exerciseId), ["b"]);
  await assert.rejects(store.saveRun(run("a", "2026-10-20T09:00:00.000Z")), /EEXIST/);
});

test("invalid results are refused before they reach disk", async () => {
  const store = new JsonResultStore(await tempDir());
  await assert.rejects(store.saveRun({ ...run("a", "2026-10-20T09:00:00.000Z"), score: 140 }));
  assert.deepEqual(await store.listRuns(), []);
});

test("an empty store lists nothing", async () => {
  const store = new JsonResultStore(`${await tempDir()}/missing`);
  assert.deepEqual(await store.listRuns(), []);
  assert.equal(await store.getCalibration("x"), null);
});
