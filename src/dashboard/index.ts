import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { bestScores, curriculumOrder, levelName, nextExercise } from "../core/curriculum.ts";
import { loadExercises, SKILLS, type Exercise, type Skill } from "../core/exercise.ts";
import type { RunResult } from "../core/result.ts";
import { PASS_SCORE } from "../core/scoring.ts";
import { canRun, resolveBackend, type Backend } from "../llm/backend.ts";
import { JsonResultStore, type ResultStore } from "../store/json-store.ts";

/**
 * The read model behind the web UI: everything it shows, built from the same
 * files the CLI writes. Read-only, and tolerant of files that don't exist yet
 * (no runs, no generated exercises, no schedule).
 */

export interface DashboardSource {
  /** Bundled exercises first, then your generated ones. */
  exercisesDir: string;
  generatedDir: string;
  store: ResultStore;
  /** `<DOJO_HOME>/schedule.json`, written by `dojo review` (phase 3). */
  scheduleFile: string;
  backend: Backend;
}

/** Same layout as the CLI: DOJO_HOME (default: the repo) holds results/, generated/ and schedule.json. */
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
    exercisesDir: env.DOJO_EXERCISES ?? path.join(repoRoot, "exercises"),
    generatedDir: path.join(home, "generated"),
    store: new JsonResultStore(path.join(home, "results")),
    scheduleFile: path.join(home, "schedule.json"),
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
}

export interface ScheduleEntry {
  exerciseId: string;
  dueAt: string;
  box: number | null;
  lastScore: number | null;
}

export interface Schedule {
  generatedAt: string | null;
  entries: ScheduleEntry[];
}

export interface Dashboard {
  backend: Backend;
  skills: SkillRow[];
  /** In path order. */
  exercises: ExerciseRow[];
  /** The first exercise on the path you can run and haven't passed, as `dojo next` picks it. */
  next: ExerciseRow | null;
  recentRuns: RunRow[];
  /** Exercises due for review now, most overdue first. Empty without a schedule. */
  due: ScheduleEntry[];
  schedule: Schedule | null;
  totals: { runs: number; costUsd: number; passed: number; exercises: number };
  /** Invalid exercises, unreadable schedule: shown, never thrown. */
  warnings: string[];
}

/** A run's id is its file name without `.json`, so links stay stable and readable. */
export function runId(run: Pick<RunResult, "startedAt" | "exerciseId">): string {
  return `${run.startedAt.replace(/[:.]/g, "-")}_${run.exerciseId}`;
}

export function mostMissed(runs: RunResult[], n = 3): { id: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of runs) for (const id of r.failedCriteria) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([id, count]) => ({ id, count }));
}

function isInside(dir: string, root: string): boolean {
  const rel = path.relative(root, dir);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export async function loadDashboard(src: DashboardSource, now: Date = new Date()): Promise<Dashboard> {
  const { exercises, errors } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const runs = await src.store.listRuns();
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
  const warnings = [...errors];
  const schedule = await readSchedule(src.scheduleFile, warnings);
  const known = new Set(rows.map((r) => r.id));
  const due = (schedule?.entries ?? [])
    .filter((e) => known.has(e.exerciseId) && Date.parse(e.dueAt) <= now.getTime())
    .sort((a, b) => (a.box ?? 0) - (b.box ?? 0) || Date.parse(a.dueAt) - Date.parse(b.dueAt));

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
      })),
    due,
    schedule,
    totals: {
      runs: runs.length,
      costUsd: runs.reduce((s, r) => s + r.costUsd, 0),
      passed: rows.filter((r) => r.state === "passed").length,
      exercises: rows.length,
    },
    warnings,
  };
}

export interface ExerciseDetail {
  exercise: Exercise;
  row: ExerciseRow;
  runs: RunRow[];
}

export async function loadExerciseDetail(src: DashboardSource, id: string): Promise<ExerciseDetail | null> {
  const dashboard = await loadDashboard(src);
  const row = dashboard.exercises.find((r) => r.id === id);
  if (!row) return null;
  const { exercises } = await loadExercises([src.exercisesDir, src.generatedDir]);
  const exercise = exercises.find((e) => e.id === id);
  if (!exercise) return null;
  const runs = (await src.store.listRuns(id)).reverse().map((r) => ({
    id: runId(r),
    exerciseId: r.exerciseId,
    title: exercise.title,
    skill: r.skill,
    startedAt: r.startedAt,
    score: r.score,
    passed: r.passed,
  }));
  return { exercise, row, runs };
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

// Phase 3 owns the schedule's full schema. This reads only the fields the UI
// shows and drops entries it can't read, so a newer schedule can't break it.
const ScheduleFileSchema = z.object({
  generatedAt: z.string().optional(),
  entries: z.array(z.unknown()),
});
const ScheduleEntrySchema = z.object({
  exerciseId: z.string(),
  dueAt: z.iso.datetime({ offset: true }),
  box: z.number().optional(),
  lastScore: z.number().nullable().optional(),
});

async function readSchedule(file: string, warnings: string[]): Promise<Schedule | null> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = ScheduleFileSchema.safeParse(JSON.parse(raw));
  } catch {
    parsed = null;
  }
  if (!parsed?.success) {
    warnings.push(`${file}: not a schedule this version can read`);
    return null;
  }
  const entries: ScheduleEntry[] = [];
  for (const e of parsed.data.entries) {
    const entry = ScheduleEntrySchema.safeParse(e);
    if (entry.success) {
      entries.push({
        exerciseId: entry.data.exerciseId,
        dueAt: entry.data.dueAt,
        box: entry.data.box ?? null,
        lastScore: entry.data.lastScore ?? null,
      });
    }
  }
  return { generatedAt: parsed.data.generatedAt ?? null, entries };
}
