import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { judge, type JudgeResult } from "../judge/judge.ts";
import { runnerFor } from "../runners/index.ts";
import type { RunnerDeps } from "../runners/types.ts";
import type { Exercise } from "./exercise.ts";
import { addUsage } from "./pricing.ts";
import type { RunResult } from "./result.ts";
import { checkScore, finalScore, JUDGE_GATE, PASS_SCORE, shouldJudge } from "./scoring.ts";

const MAX_FILE_BYTES = 20_000;

/** All files in a solution folder, concatenated with headers. This is what the judge reads. */
export async function readSolution(dir: string): Promise<string> {
  const files = await listFiles(dir);
  const parts: string[] = [];
  for (const rel of files) {
    const text = await readFile(path.join(dir, rel), "utf8");
    const body = text.length > MAX_FILE_BYTES ? `${text.slice(0, MAX_FILE_BYTES)}\n…(truncated)` : text;
    parts.push(`=== ${rel} ===\n${body}`);
  }
  return parts.join("\n\n");
}

async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(dir, prefix), { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = path.join(prefix, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(dir, rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

export interface GradeOptions {
  judgeModel?: string;
  now?: () => Date;
}

/** Runs a solution end to end: runner, checks, judge, score. Does not persist anything. */
export async function gradeSolution(
  exercise: Exercise,
  solutionDir: string,
  deps: RunnerDeps,
  opts: GradeOptions = {},
): Promise<RunResult> {
  const now = opts.now ?? (() => new Date());
  const started = now();
  const solution = await readSolution(solutionDir);
  const attempt = await runnerFor(exercise)(exercise, solutionDir, deps);
  const checks = checkScore(attempt);

  let judgeResult: JudgeResult | null = null;
  let judgeNote: string | undefined;
  if (shouldJudge(exercise, checks)) {
    try {
      judgeResult = await judge(exercise, solution, attempt, deps.llm, opts.judgeModel);
    } catch (err) {
      judgeNote = err instanceof Error ? err.message : String(err);
    }
  } else if (exercise.criteria.length > 0) {
    judgeNote = `judge skipped: under ${JUDGE_GATE * 100}% of checks passed`;
  }

  const score = finalScore(exercise, checks, judgeResult);
  const usage = judgeResult ? addUsage(attempt.usage, judgeResult.usage) : attempt.usage;
  const criteria = judgeResult?.criteria ?? [];
  const models = judgeResult ? [...new Set([...attempt.models, judgeResult.model])] : attempt.models;

  return {
    schemaVersion: 1,
    exerciseId: exercise.id,
    skill: exercise.skill,
    type: exercise.type,
    startedAt: started.toISOString(),
    durationMs: Math.max(0, now().getTime() - started.getTime()),
    score,
    passed: score >= PASS_SCORE,
    checkScore: checks,
    judgeScore: judgeResult?.score ?? null,
    ...(judgeNote ? { judgeNote } : {}),
    cases: attempt.cases.map((c) => ({ name: c.name, checks: c.checks })),
    criteria,
    failedCriteria: judgeResult
      ? criteria.filter((c) => c.grade !== "pass").map((c) => c.id)
      : exercise.criteria.map((c) => c.id),
    summary: judgeResult?.summary ?? "",
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cacheRead: usage.cacheReadTokens,
      cacheWrite: usage.cacheWriteTokens,
    },
    costUsd: attempt.costUsd + (judgeResult?.costUsd ?? 0),
    turns: attempt.turns,
    models,
    solutionHash: createHash("sha256").update(solution).digest("hex").slice(0, 16),
  };
}
