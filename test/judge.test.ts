import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExercises, type Exercise } from "../src/core/exercise.ts";
import { checkScore, finalScore, shouldJudge } from "../src/core/scoring.ts";
import { buildJudgeSystem, judge, scoreVerdict } from "../src/judge/judge.ts";
import type { Attempt } from "../src/runners/types.ts";
import { FakeLlm } from "./fakes.ts";
import { EXERCISES_DIR } from "./helpers.ts";

async function invoiceExercise(): Promise<Exercise> {
  const { exercises } = await loadExercises(EXERCISES_DIR);
  const ex = exercises.find((e) => e.id === "prompt-extract-invoice");
  assert.ok(ex);
  return ex;
}

const attempt = (passed: boolean[]): Attempt => ({
  cases: [{ name: "c", output: "out", checks: passed.map((p, i) => ({ check: `k${i}`, passed: p, detail: "" })) }],
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  costUsd: 0,
  turns: 1,
  models: [],
});

test("the judge prompt carries the task and every criterion", async () => {
  const ex = await invoiceExercise();
  const system = buildJudgeSystem(ex);
  for (const c of ex.criteria) assert.ok(system.includes(c.id));
  assert.ok(system.includes("not_an_invoice"));
});

test("verdicts are weighted and missing criteria are rejected", async () => {
  const ex = await invoiceExercise();
  const grades = ["pass", "partial", "fail", "pass"] as const;
  const verdict = {
    criteria: ex.criteria.map((c, i) => ({ id: c.id, reasoning: "r", grade: grades[i] ?? "pass", tip: "" })),
    summary: "s",
  };
  // weights 2,2,1,1 → (2*1 + 2*0.5 + 0 + 1) / 6
  assert.equal(scoreVerdict(ex.criteria, verdict).score, 4 / 6);
  assert.throws(() => scoreVerdict(ex.criteria, { ...verdict, criteria: verdict.criteria.slice(1) }), /skipped/);
});

test("the judge retries once, then fails instead of inventing a grade", async () => {
  const ex = await invoiceExercise();
  const llm = new FakeLlm();
  llm.verdict = () => ({ criteria: [], summary: "" });
  await assert.rejects(judge(ex, "solution", attempt([true]), llm), /judge failed/);
  assert.equal(llm.structuredCalls.length, 2);
});

test("the judge result includes cost for the judge model", async () => {
  const ex = await invoiceExercise();
  const res = await judge(ex, "solution", attempt([true]), new FakeLlm());
  assert.equal(res.score, 1);
  assert.equal(res.model, "claude-opus-5-5");
  assert.ok(res.costUsd > 0);
});

test("checks gate the judge and weights combine the score", async () => {
  const ex = await invoiceExercise();
  assert.equal(checkScore(attempt([true, false, false])), 1 / 3);
  assert.equal(shouldJudge(ex, 1 / 3), false);
  assert.equal(shouldJudge(ex, 0.5), true);
  assert.equal(finalScore(ex, 1, null), 50);
  assert.equal(finalScore({ ...ex, criteria: [] }, 0.75, null), 75);
});
