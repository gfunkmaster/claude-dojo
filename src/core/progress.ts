import { SKILLS, type Skill } from "./exercise.ts";
import { isAssisted, type HintEvent } from "./help.ts";
import type { RunResult } from "./result.ts";

export interface SkillProgress {
  skill: Skill;
  runs: number;
  /** Exercises of this skill you have run at least once. */
  exercises: number;
  /**
   * Mean of each of those exercises' latest score, 0..100. Where you stand now, not your best day.
   * A run graded right after viewing the solution doesn't count: an exercise with only those counts as 0.
   */
  mastery: number;
  /** Up to the last 8 scores, oldest first. */
  recent: number[];
  /** Mean of the last k runs minus the mean of the k before them (k = up to 3); null with fewer than 2 runs. */
  trend: number | null;
  costUsd: number;
  /** Criterion ids that were not a pass, most often first. */
  mostMissed: { id: string; count: number }[];
}

const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

export function mostMissed(runs: RunResult[], n = 3): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of runs) for (const id of r.failedCriteria) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id, count]) => ({ id, count }));
}

/** One entry per skill you have run, in the order of SKILLS. */
export function skillProgress(runs: RunResult[], hints: HintEvent[] = []): SkillProgress[] {
  const sorted = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const progress: SkillProgress[] = [];
  for (const skill of SKILLS) {
    const forSkill = sorted.filter((r) => r.skill === skill);
    if (forSkill.length === 0) continue;
    const latest = new Map<string, number>();
    for (const r of forSkill) {
      if (!isAssisted(r, hints)) latest.set(r.exerciseId, r.score);
      else if (!latest.has(r.exerciseId)) latest.set(r.exerciseId, 0);
    }
    const scores = forSkill.map((r) => r.score);
    const k = Math.min(3, Math.floor(scores.length / 2));
    progress.push({
      skill,
      runs: forSkill.length,
      exercises: latest.size,
      mastery: Math.round(mean([...latest.values()])),
      recent: scores.slice(-8),
      trend: k === 0 ? null : Math.round(mean(scores.slice(-k)) - mean(scores.slice(-2 * k, -k))),
      costUsd: forSkill.reduce((s, r) => s + r.costUsd, 0),
      mostMissed: mostMissed(forSkill),
    });
  }
  return progress;
}

/** The skills with the lowest mastery, weakest first. */
export function weakestSkills(progress: SkillProgress[], n = 2): SkillProgress[] {
  return [...progress].sort((a, b) => a.mastery - b.mastery || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill)).slice(0, n);
}

const BARS = "▁▂▃▄▅▆▇█";

/** Scores 0..100 as a tiny bar chart, e.g. "▂▄▇". */
export function sparkline(scores: number[]): string {
  return scores.map((s) => BARS[Math.min(BARS.length - 1, Math.floor((s / 100) * BARS.length))] ?? "").join("");
}
