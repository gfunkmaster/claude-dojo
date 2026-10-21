import path from "node:path";
import { bestScores, curriculumOrder, levelName, nextExercise } from "../core/curriculum.ts";
import { loadExercises, SKILLS, type Exercise, type Skill } from "../core/exercise.ts";
import { helpLevels, nextHintLevel, solutionUnlocked, type HintEvent, type HintLevel } from "../core/help.ts";
import { mostMissed } from "../core/progress.ts";
import type { RunResult } from "../core/result.ts";
import { buildSchedule, dueEntries, reviewCommandFor, upcomingEntries, type ScheduleEntry } from "../core/schedule.ts";
import { PASS_SCORE } from "../core/scoring.ts";
import { canRun, resolveBackend, type Backend } from "../llm/backend.ts";
import { JsonResultStore, type ResultStore } from "../store/json-store.ts";

/**
 * The read model behind the web UI: everything it shows, built from the same
 * files the CLI writes. Read-only, and tolerant of files that don't exist yet
 * (no runs, no generated exercises). Editing and grading are in `workspace.ts`
 * and `runner.ts`.
 */

export interface DashboardSource {
  /** Where `src/cli/bin.ts` and `playbooks/` live. */
  repoRoot: string;
  /** Bundled exercises first, then your generated ones. */
  exercisesDir: string;
  generatedDir: string;
  store: ResultStore;
  /** `<DOJO_HOME>/workspace`: one folder per started exercise, edited in the UI and graded by `dojo run`. */
  workspaceDir: string;
  playbooksDir: string;
  backend: Backend;
}

/** Same layout as the CLI: DOJO_HOME (default: the repo) holds results/, generated/ and workspace/. */
export function defaultSource(repoRoot: string, env: NodeJS.ProcessEnv = process.env): DashboardSource {
  const home = env.DOJO_HOME ?? repoRoot;
  let backend: Backend;
  try {
    backend = resolveBackend(env);
  } catch {
    // An invalid DOJO_BACKEND stops `dojo run`, but shouldn't stop you from looking at your results.
    backend = "claude-cli";
  }
  return {
    repoRoot,
    exercisesDir: env.DOJO_EXERCISES ?? path.join(repoRoot, "exercises"),
    generatedDir: path.join(home, "generated"),
    store: new JsonResultStore(path.join(home, "results")),
    workspaceDir: path.join(home, "workspace"),
    playbooksDir: path.join(repoRoot, "playbooks"),
    backend,
  };
}

export type ExerciseState = "passed" | "attempted" | "new";
export type CalibrationState = "yes" | "unreliable" | "not-yet";

export interface ExerciseRow {
  id: string;
  title: string;
  skill: Skill;
  type: Exercise["type"];
  difficulty: number;
  level: string;
  /** 1-based place on the path. */
  position: number;
  generated: boolean;
  /** Needs API credits on the current backend (tools and request exercises on a subscription). */
  needsApi: boolean;
  state: ExerciseState;
  best: number | null;
  runs: number;
  lastRunAt: string | null;
  calibration: CalibrationState;
}

export interface TrendPoint {
  at: string;
  score: number;
  exerciseId: string;
  runId: string;
}

export interface SkillRow {
  skill: Skill;
  runs: number;
  last: number | null;
  best: number | null;
  passed: number;
  total: number;
  /** Every run of the skill, oldest first. */
  trend: TrendPoint[];
  mostMissed: { id: string; count: number }[];
}

export interface RunRow {
  id: string;
  exerciseId: string;
  title: string;
  skill: Skill;
  startedAt: string;
  score: number;
  passed: boolean;
  /** The most help you had before this run: 0 none, 1-2 hints, 3 the solution (then the pass doesn't count). */
  help: 0 | HintLevel;
}

export interface DueReview {
  entry: ScheduleEntry;
  title: string;
  /** What `dojo next` would tell you to run. */
  command: string;
}

export interface Dashboard {
  backend: Backend;
  skills: SkillRow[];
  /** In path order. */
  exercises: ExerciseRow[];
  /** The first exercise on the path you can run and haven't passed, as `dojo next` picks it. */
  next: ExerciseRow | null;
  recentRuns: RunRow[];
  /** Reviews due now that run on this backend, in the order `dojo review` lists them. `dojo next` starts here. */
  due: DueReview[];
  totals: { runs: number; costUsd: number; passed: number; exercises: number };
  /** Invalid exercises: shown, never thrown. */
  warnings: string[];
}

/** A run's id is its file name without `.json`, so links stay stable and readable. */
export function runId(run: Pick<RunResult, "startedAt" | "exerciseId">): string {
  return `${run.startedAt.replace(/[:.]/g, "-")}_${run.exerciseId}`;
}

/** helpLevel of every run, by run id. */
function helpByRun(runs: RunResult[], hints: HintEvent[]): Map<string, 0 | HintLevel> {
  const byExercise = new Map<string, RunResult[]>();
  for (const r of runs) byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  const out = new Map<string, 0 | HintLevel>();
  for (const own of byExercise.values()) {
    const sorted = [...own].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    helpLevels(sorted, hints).forEach((level, i) => {
      const r = sorted[i];
      if (r) out.set(runId(r), level);
    });
  }
  return out;
}

function isInside(dir: string, root: string): boolean {
  const rel = path.relative(root, dir);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function loadDashboard(src: DashboardSource, now: Date = new Date()): Promise<Dashboard> {
  const { exercises, errors } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const runs = await src.store.listRuns();
  const hints = await src.store.listHints();
  const help = helpByRun(runs, hints);
  const best = bestScores(runs);
  const titles = new Map(exercises.map((e) => [e.id, e.title]));

  const rows: ExerciseRow[] = [];
  for (const [i, ex] of curriculumOrder(exercises).entries()) {
    const own = runs.filter((r) => r.exerciseId === ex.id);
    const cal = await src.store.getCalibration(ex.id);
    const score = best.get(ex.id);
    rows.push({
      id: ex.id,
      title: ex.title,
      skill: ex.skill,
      type: ex.type,
      difficulty: ex.difficulty,
      level: levelName(ex.difficulty),
      position: i + 1,
      generated: isInside(ex.dir, src.generatedDir),
      needsApi: !canRun(src.backend, ex),
      state: score === undefined ? "new" : score >= PASS_SCORE ? "passed" : "attempted",
      best: score ?? null,
      runs: own.length,
      lastRunAt: own.at(-1)?.startedAt ?? null,
      calibration: cal === null ? "not-yet" : cal.ok ? "yes" : "unreliable",
    });
  }

  const skills: SkillRow[] = SKILLS.map((skill) => {
    const forSkill = runs.filter((r) => r.skill === skill);
    const ofSkill = rows.filter((r) => r.skill === skill);
    return {
      skill,
      runs: forSkill.length,
      last: forSkill.at(-1)?.score ?? null,
      best: forSkill.length > 0 ? Math.max(...forSkill.map((r) => r.score)) : null,
      passed: ofSkill.filter((r) => r.state === "passed").length,
      total: ofSkill.length,
      trend: forSkill.map((r) => ({ at: r.startedAt, score: r.score, exerciseId: r.exerciseId, runId: runId(r) })),
      mostMissed: mostMissed(forSkill),
    };
  });

  const next = nextExercise(exercises.filter((e) => canRun(src.backend, e)), runs);
  // Built from the runs like `dojo review` does, so it is never stale. Deleted and API-only exercises drop out.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const due = dueEntries(buildSchedule(runs, hints), now).flatMap((entry) => {
    const row = byId.get(entry.exerciseId);
    return row && !row.needsApi ? [{ entry, title: row.title, command: reviewCommandFor(entry) }] : [];
  });

  return {
    backend: src.backend,
    skills,
    exercises: rows,
    next: rows.find((r) => r.id === next?.id) ?? null,
    recentRuns: runs
      .slice(-10)
      .reverse()
      .map((r) => ({
        id: runId(r),
        exerciseId: r.exerciseId,
        title: titles.get(r.exerciseId) ?? r.exerciseId,
        skill: r.skill,
        startedAt: r.startedAt,
        score: r.score,
        passed: r.passed,
        help: help.get(runId(r)) ?? 0,
      })),
    due,
    totals: {
      runs: runs.length,
      costUsd: runs.reduce((s, r) => s + r.costUsd, 0),
      passed: rows.filter((r) => r.state === "passed").length,
      exercises: rows.length,
    },
    warnings: errors,
  };
}

export interface ExerciseDetail {
  exercise: Exercise;
  row: ExerciseRow;
  /** Newest first. */
  runs: RunRow[];
  /** What the hint buttons offer. The hints themselves are fetched when you ask, never put in the page. */
  hints: {
    /** The level `dojo hint` gives next; 3 means only the solution is left. */
    next: HintLevel;
    solutionUnlocked: boolean;
  };
}

export async function loadExerciseDetail(src: DashboardSource, id: string): Promise<ExerciseDetail | null> {
  const dashboard = await loadDashboard(src);
  const row = dashboard.exercises.find((r) => r.id === id);
  if (!row) return null;
  const { exercises } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const exercise = exercises.find((e) => e.id === id);
  if (!exercise) return null;
  const all = await src.store.listRuns(id);
  const hints = await src.store.listHints(id);
  const help = helpByRun(all, hints);
  const runs = [...all].reverse().map((r) => ({
    id: runId(r),
    exerciseId: r.exerciseId,
    title: exercise.title,
    skill: r.skill,
    startedAt: r.startedAt,
    score: r.score,
    passed: r.passed,
    help: help.get(runId(r)) ?? 0,
  }));
  return { exercise, row, runs, hints: { next: nextHintLevel(id, all, hints), solutionUnlocked: solutionUnlocked(id, all) } };
}

export interface RunDetail {
  id: string;
  run: RunResult;
  title: string;
  /** Total tokens over input, output and cache. */
  totalTokens: number;
}

export async function loadRun(src: DashboardSource, id: string): Promise<RunDetail | null> {
  // The id ends with the exercise id, which can contain `-` but never `_`.
  const exerciseId = id.slice(id.lastIndexOf("_") + 1);
  if (!exerciseId) return null;
  const run = (await src.store.listRuns(exerciseId)).find((r) => runId(r) === id);
  if (!run) return null;
  const { exercises } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const t = run.tokens;
  return {
    id,
    run,
    title: exercises.find((e) => e.id === run.exerciseId)?.title ?? run.exerciseId,
    totalTokens: t.input + t.output + t.cacheRead + t.cacheWrite,
  };
}

export interface ReviewOverview {
  due: DueReview[];
  /** Not due yet, soonest first. */
  upcoming: DueReview[];
  /** Due, but they need API credits on this backend. */
  skipped: DueReview[];
}

/** What `dojo review` shows, built from the runs the same way. */
export async function loadReview(src: DashboardSource, now: Date = new Date()): Promise<ReviewOverview> {
  const { exercises } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const entries = buildSchedule(await src.store.listRuns(), await src.store.listHints()).filter((e) => byId.has(e.exerciseId));
  const review = (entry: ScheduleEntry): DueReview => ({
    entry,
    title: byId.get(entry.exerciseId)?.title ?? entry.exerciseId,
    command: reviewCommandFor(entry),
  });
  const runnable = (e: ScheduleEntry) => {
    const ex = byId.get(e.exerciseId);
    return ex !== undefined && canRun(src.backend, ex);
  };
  const due = dueEntries(entries, now);
  return {
    due: due.filter(runnable).map(review),
    upcoming: upcomingEntries(entries, now).filter(runnable).map(review),
    skipped: due.filter((e) => !runnable(e)).map(review),
  };
}

export interface Recommendation {
  id: string;
  title: string;
  /** A due review, or the next new exercise on the path. */
  kind: "review" | "new";
  /** A passed review starts over from the starter (`--fresh`). */
  fresh: boolean;
}

/** What `dojo next` would pick: a due review first, else the next new exercise. */
export function recommendation(d: Dashboard): Recommendation | null {
  const review = d.due[0];
  if (review) return { id: review.entry.exerciseId, title: review.title, kind: "review", fresh: review.entry.lastPassed };
  return d.next ? { id: d.next.id, title: d.next.title, kind: "new", fresh: false } : null;
}
