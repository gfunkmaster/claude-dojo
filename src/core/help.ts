import { z } from "zod";
import type { RunResult } from "./result.ts";

/**
 * Hints you asked for, and what they do to your scores. Pure functions over the
 * results and the hint log, like the schedule: no state of their own.
 *
 * Level 1 says what to focus on, level 2 nudges harder, level 3 is the solution.
 */
export const HINT_LEVELS = [1, 2, 3] as const;
export type HintLevel = (typeof HINT_LEVELS)[number];
export const SOLUTION_LEVEL: HintLevel = 3;

/** A pass this soon after seeing the solution is copying, not knowing: it doesn't move the exercise up. */
export const ASSIST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** `results/hints/<timestamp>_<id>_<level>.json`: one hint you looked at. Append-only. */
export const HintEventSchema = z.object({
  schemaVersion: z.literal(1),
  exerciseId: z.string(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  at: z.iso.datetime(),
});
export type HintEvent = z.infer<typeof HintEventSchema>;

export function isHintLevel(n: unknown): n is HintLevel {
  return n === 1 || n === 2 || n === 3;
}

/** The run was graded within ASSIST_WINDOW_MS after you viewed this exercise's solution. */
export function isAssisted(run: Pick<RunResult, "exerciseId" | "startedAt">, hints: HintEvent[]): boolean {
  const at = Date.parse(run.startedAt);
  return hints.some((h) => {
    if (h.exerciseId !== run.exerciseId || h.level !== SOLUTION_LEVEL) return false;
    const seen = Date.parse(h.at);
    return seen <= at && at - seen < ASSIST_WINDOW_MS;
  });
}

/**
 * The most help you had for this run: the highest level viewed since the run before it
 * (or ever, for the first), and the solution if it was viewed within the window. 0 = none.
 */
export function helpLevel(run: RunResult, previous: RunResult | undefined, hints: HintEvent[]): 0 | HintLevel {
  if (isAssisted(run, hints)) return SOLUTION_LEVEL;
  const from = previous ? Date.parse(previous.startedAt) : -Infinity;
  const to = Date.parse(run.startedAt);
  let level: 0 | HintLevel = 0;
  for (const h of hints) {
    const at = Date.parse(h.at);
    if (h.exerciseId === run.exerciseId && at > from && at <= to && h.level > level) level = h.level;
  }
  return level;
}

/** helpLevel for each run of one exercise, in the order given (oldest first). */
export function helpLevels(runs: RunResult[], hints: HintEvent[]): (0 | HintLevel)[] {
  return runs.map((r, i) => helpLevel(r, runs.slice(0, i).findLast((p) => p.exerciseId === r.exerciseId), hints));
}

/**
 * The level `dojo hint` gives next: one above the highest you have seen since you
 * last passed. The solution is never given without asking for it, so 3 means "only the solution is left".
 */
export function nextHintLevel(exerciseId: string, runs: RunResult[], hints: HintEvent[]): HintLevel {
  const lastPass = runs.filter((r) => r.exerciseId === exerciseId && r.passed).at(-1);
  const since = lastPass ? Date.parse(lastPass.startedAt) : -Infinity;
  const seen = hints.filter((h) => h.exerciseId === exerciseId && Date.parse(h.at) > since).map((h) => h.level);
  const highest = Math.max(0, ...seen);
  return highest >= 2 ? 3 : highest === 1 ? 2 : 1;
}

/** The solution unlocks once you have made an attempt: you learn more from trying first. */
export function solutionUnlocked(exerciseId: string, runs: RunResult[]): boolean {
  return runs.some((r) => r.exerciseId === exerciseId);
}

export const HELP_LABELS: Record<0 | HintLevel, string> = { 0: "-", 1: "hint 1", 2: "hint 2", 3: "solution" };
