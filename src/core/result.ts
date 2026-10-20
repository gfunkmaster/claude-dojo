import { z } from "zod";
import { SKILLS } from "./exercise.ts";

const Grade = z.enum(["pass", "partial", "fail"]);

export const RunResultSchema = z.object({
  schemaVersion: z.literal(1),
  exerciseId: z.string(),
  skill: z.enum(SKILLS),
  type: z.enum(["prompt", "env", "eval"]),
  startedAt: z.iso.datetime(),
  durationMs: z.number().int().nonnegative(),
  /** 0..100 */
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  checkScore: z.number().min(0).max(1),
  judgeScore: z.number().min(0).max(1).nullable(),
  judgeNote: z.string().optional(),
  cases: z.array(
    z.object({
      name: z.string(),
      checks: z.array(z.object({ check: z.string(), passed: z.boolean(), detail: z.string() })),
    }),
  ),
  criteria: z.array(
    z.object({ id: z.string(), weight: z.number(), grade: Grade, reasoning: z.string(), tip: z.string() }),
  ),
  /** Criterion ids that were not a pass. Phase 3's repetition reads this. */
  failedCriteria: z.array(z.string()),
  summary: z.string(),
  tokens: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
    cacheRead: z.number().int().nonnegative(),
    cacheWrite: z.number().int().nonnegative(),
  }),
  costUsd: z.number().nonnegative(),
  turns: z.number().int().nonnegative(),
  models: z.array(z.string()),
  solutionHash: z.string(),
});
export type RunResult = z.infer<typeof RunResultSchema>;

export const CalibrationSchema = z.object({
  schemaVersion: z.literal(1),
  exerciseId: z.string(),
  at: z.iso.datetime(),
  ok: z.boolean(),
  references: z.array(
    z.object({
      label: z.enum(["good", "bad"]),
      dir: z.string(),
      score: z.number(),
      expect: z.tuple([z.number(), z.number()]),
      ok: z.boolean(),
    }),
  ),
  costUsd: z.number().nonnegative(),
});
export type Calibration = z.infer<typeof CalibrationSchema>;
