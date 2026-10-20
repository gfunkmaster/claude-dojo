import { z } from "zod";
import type { Criterion, Exercise } from "../core/exercise.ts";
import { costUsd, type TokenUsage } from "../core/pricing.ts";
import type { LlmClient } from "../llm/client.ts";
import type { Attempt } from "../runners/types.ts";

export const DEFAULT_JUDGE_MODEL = process.env.DOJO_JUDGE_MODEL ?? "claude-opus-5-5";

export const JudgeVerdictSchema = z.object({
  criteria: z.array(
    z.object({
      id: z.string(),
      // Reasoning comes before the grade so the grade follows from it.
      reasoning: z.string(),
      grade: z.enum(["pass", "partial", "fail"]),
      tip: z.string(),
    }),
  ),
  summary: z.string(),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export interface CriterionResult {
  id: string;
  weight: number;
  grade: "pass" | "partial" | "fail";
  reasoning: string;
  tip: string;
}

export interface JudgeResult {
  /** Weighted grade, 0..1. */
  score: number;
  criteria: CriterionResult[];
  summary: string;
  model: string;
  usage: TokenUsage;
  costUsd: number;
}

const GRADE_VALUE = { pass: 1, partial: 0.5, fail: 0 } as const;

export function buildJudgeSystem(exercise: Exercise): string {
  const rubric = exercise.criteria.map((c) => `- ${c.id} (weight ${c.weight}): ${c.text}`).join("\n");
  return `You grade solutions to a training exercise about using Claude well.

Grade each rubric criterion independently. For each one, write your reasoning first, citing concrete evidence from the solution or its outputs, then give a grade:
- pass: the criterion is fully met
- partial: met in part, or met with a clear flaw
- fail: not met, or no evidence it is met

Deterministic checks have already run; their results are included. Do not re-grade them, but use them as evidence. Judge only what the criteria ask. Do not reward length.

For every criterion that is not a pass, write one concrete tip the student can act on next attempt. For a pass, the tip may be empty.

Return every criterion id exactly once.

<exercise id="${exercise.id}">
${exercise.body}
</exercise>

<rubric>
${rubric}
</rubric>`;
}

export function buildJudgeUser(solution: string, attempt: Attempt): string {
  const cases = attempt.cases
    .map((c) => {
      const checks = c.checks.map((r) => `  - [${r.passed ? "x" : " "}] ${r.check}${r.detail ? ` (${r.detail})` : ""}`).join("\n");
      return `<case name="${c.name}">\n<output>\n${c.output}\n</output>\nChecks:\n${checks}\n</case>`;
    })
    .join("\n\n");
  return `<solution>\n${solution}\n</solution>\n\n<results>\n${cases}\n</results>`;
}

export function scoreVerdict(criteria: Criterion[], verdict: JudgeVerdict): { score: number; results: CriterionResult[] } {
  const byId = new Map(verdict.criteria.map((v) => [v.id, v]));
  const missing = criteria.filter((c) => !byId.has(c.id)).map((c) => c.id);
  if (missing.length > 0) throw new Error(`judge skipped criteria: ${missing.join(", ")}`);
  const results = criteria.map((c) => {
    const v = byId.get(c.id);
    if (!v) throw new Error(`unreachable: ${c.id}`);
    return { id: c.id, weight: c.weight, grade: v.grade, reasoning: v.reasoning, tip: v.tip };
  });
  const total = criteria.reduce((sum, c) => sum + c.weight, 0);
  const earned = results.reduce((sum, r) => sum + r.weight * GRADE_VALUE[r.grade], 0);
  return { score: total === 0 ? 0 : earned / total, results };
}

export async function judge(
  exercise: Exercise,
  solution: string,
  attempt: Attempt,
  llm: LlmClient,
  model = DEFAULT_JUDGE_MODEL,
): Promise<JudgeResult> {
  const system = buildJudgeSystem(exercise);
  const user = buildJudgeUser(solution, attempt);
  let lastError: unknown;
  // One retry on an invalid verdict; after that we report an error instead of inventing a grade.
  for (let attemptNo = 0; attemptNo < 2; attemptNo++) {
    try {
      const res = await llm.structured({ model, system, user, schema: JudgeVerdictSchema });
      const verdict = JudgeVerdictSchema.parse(res.value);
      const { score, results } = scoreVerdict(exercise.criteria, verdict);
      return { score, criteria: results, summary: verdict.summary, model, usage: res.usage, costUsd: costUsd(model, res.usage) };
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`judge failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`, { cause: lastError });
}
