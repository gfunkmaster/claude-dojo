import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { CheckResult } from "../checks/index.ts";
import { CaseSchema } from "../core/exercise.ts";
import { addUsage, ZERO_USAGE } from "../core/pricing.ts";
import { runPromptCases } from "./prompt.ts";
import type { Attempt, CaseRun, Runner } from "./types.ts";

export const EvalFileSchema = z.object({ cases: z.array(CaseSchema).min(1) }).strict();

const MIN_CASES = 3;

/**
 * Your eval is run against hidden prompt variants. It scores well when the
 * good variants pass every case and each broken variant fails at least one.
 */
export const evalRunner: Runner = async (exercise, solutionDir, deps) => {
  if (!exercise.eval) throw new Error(`${exercise.id} has no eval block`);
  const raw = parseYaml(await readFile(path.join(solutionDir, exercise.solution), "utf8"));
  const evalFile = EvalFileSchema.parse(raw);
  // Case inputs in your eval resolve against your workspace, not the exercise folder.
  const asExercise = { ...exercise, dir: solutionDir };

  let usage = ZERO_USAGE;
  let cost = 0;
  let turns = 0;
  const runs: CaseRun[] = [];

  const sizeCheck: CheckResult = {
    check: `eval has at least ${MIN_CASES} cases`,
    passed: evalFile.cases.length >= MIN_CASES,
    detail: `${evalFile.cases.length} cases`,
  };

  for (const variant of exercise.eval.variants) {
    const prompt = await readFile(path.join(exercise.dir, variant.file), "utf8");
    const attempt = await runPromptCases(asExercise, prompt, evalFile.cases, deps.llm);
    usage = addUsage(usage, attempt.usage);
    cost += attempt.costUsd;
    turns += attempt.turns;
    const allPassed = attempt.cases.every((c) => c.checks.every((r) => r.passed));
    const failing = attempt.cases.filter((c) => c.checks.some((r) => !r.passed)).map((c) => c.name);
    runs.push({
      name: `variant ${path.basename(variant.file)}`,
      output: allPassed ? "All eval cases passed." : `Failing eval cases: ${failing.join(", ")}`,
      checks: [
        {
          check: `eval ${variant.shouldPass ? "passes" : "catches"} ${path.basename(variant.file)}`,
          passed: allPassed === variant.shouldPass,
          detail: allPassed ? "every case passed" : `failed: ${failing.join(", ")}`,
        },
      ],
    });
  }
  const first = runs[0];
  if (first) first.checks.unshift(sizeCheck);
  return { cases: runs, usage, costUsd: cost, turns, models: [exercise.model] };
};
