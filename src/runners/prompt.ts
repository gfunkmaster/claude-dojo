import { readFile } from "node:fs/promises";
import path from "node:path";
import { runCheck } from "../checks/index.ts";
import { caseInput, type Case, type Exercise } from "../core/exercise.ts";
import { addUsage, costUsd, ZERO_USAGE } from "../core/pricing.ts";
import type { LlmClient } from "../llm/client.ts";
import type { Attempt, CaseRun, Runner } from "./types.ts";

/** Runs one system prompt against a list of cases. Shared with the eval runner. */
export async function runPromptCases(
  exercise: Exercise,
  systemPrompt: string,
  cases: Case[],
  llm: LlmClient,
): Promise<Attempt> {
  let usage = ZERO_USAGE;
  const runs: CaseRun[] = [];
  for (const c of cases) {
    const res = await llm.complete({ model: exercise.model, system: systemPrompt, user: await caseInput(exercise, c) });
    usage = addUsage(usage, res.usage);
    runs.push({ name: c.name, output: res.text, checks: c.checks.map((check) => runCheck(check, { output: res.text })) });
  }
  return { cases: runs, usage, costUsd: costUsd(exercise.model, usage), turns: cases.length, models: [exercise.model] };
}

export const promptRunner: Runner = async (exercise, solutionDir, deps) => {
  const systemPrompt = await readFile(path.join(solutionDir, exercise.solution), "utf8");
  return runPromptCases(exercise, systemPrompt, exercise.cases, deps.llm);
};
