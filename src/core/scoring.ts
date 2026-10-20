import type { Exercise } from "./exercise.ts";
import type { JudgeResult } from "../judge/judge.ts";
import type { Attempt } from "../runners/types.ts";

/** The judge only runs when at least this share of checks pass. */
export const JUDGE_GATE = 0.5;
export const PASS_SCORE = 70;

export function checkScore(attempt: Attempt): number {
  const all = attempt.cases.flatMap((c) => c.checks);
  return all.length === 0 ? 0 : all.filter((r) => r.passed).length / all.length;
}

export function shouldJudge(exercise: Exercise, checks: number): boolean {
  return exercise.criteria.length > 0 && checks >= JUDGE_GATE;
}

/** 0..100. Without criteria the checks carry the whole score. */
export function finalScore(exercise: Exercise, checks: number, judgeResult: JudgeResult | null): number {
  if (exercise.criteria.length === 0) return Math.round(checks * 100);
  const judged = judgeResult?.score ?? 0;
  return Math.round(100 * (exercise.weights.checks * checks + exercise.weights.judge * judged));
}
