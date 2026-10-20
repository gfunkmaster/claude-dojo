import path from "node:path";
import type { Exercise } from "../core/exercise.ts";
import { gradeSolution, type GradeOptions } from "../core/grade.ts";
import type { Calibration } from "../core/result.ts";
import type { RunnerDeps } from "../runners/types.ts";

/**
 * Grades every reference answer as if it were your solution. The exercise is
 * trustworthy only if good answers land in their range and bad ones in theirs.
 */
export async function calibrate(exercise: Exercise, deps: RunnerDeps, opts: GradeOptions = {}): Promise<Calibration> {
  const at = (opts.now ?? (() => new Date()))().toISOString();
  const references: Calibration["references"] = [];
  let cost = 0;
  for (const ref of exercise.references) {
    deps.log?.(`  reference ${ref.label}: ${ref.dir}`);
    const result = await gradeSolution(exercise, path.join(exercise.dir, ref.dir), deps, opts);
    cost += result.costUsd;
    const [lo, hi] = ref.expect;
    references.push({ label: ref.label, dir: ref.dir, score: result.score, expect: ref.expect, ok: result.score >= lo && result.score <= hi });
  }
  return { schemaVersion: 1, exerciseId: exercise.id, at, ok: references.every((r) => r.ok), references, costUsd: cost };
}
