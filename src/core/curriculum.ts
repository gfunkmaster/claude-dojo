import { LEVELS, SKILLS, type Exercise } from "./exercise.ts";
import type { RunResult } from "./result.ts";
import { PASS_SCORE } from "./scoring.ts";

export function levelName(difficulty: number): string {
  return LEVELS[difficulty - 1] ?? String(difficulty);
}

/** The path from beginner to elite: by level, then by skill in the order of SKILLS. */
export function curriculumOrder(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort(
    (a, b) => a.difficulty - b.difficulty || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill) || a.id.localeCompare(b.id),
  );
}

export function bestScores(runs: RunResult[]): Map<string, number> {
  const best = new Map<string, number>();
  for (const r of runs) best.set(r.exerciseId, Math.max(best.get(r.exerciseId) ?? 0, r.score));
  return best;
}

/** The first exercise on the path you have not passed yet, or undefined when you are done. */
export function nextExercise(exercises: Exercise[], runs: RunResult[]): Exercise | undefined {
  const best = bestScores(runs);
  return curriculumOrder(exercises).find((e) => (best.get(e.id) ?? 0) < PASS_SCORE);
}
