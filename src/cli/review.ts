import { levelName } from "../core/curriculum.ts";
import { loadExercises, type Exercise } from "../core/exercise.ts";
import type { RunResult } from "../core/result.ts";
import {
  buildSchedule,
  dueEntries,
  relativeDays,
  reviewCommandFor,
  toSchedule,
  upcomingEntries,
  type ScheduleEntry,
} from "../core/schedule.ts";
import { canRun } from "../llm/backend.ts";
import { writeSchedule } from "../store/schedule-file.ts";
import { exerciseRoots, now, type CliContext, table } from "./context.ts";

export interface ReviewState {
  exercises: Map<string, Exercise>;
  /** Due now, on exercises that still exist and run on this backend. */
  due: ScheduleEntry[];
  upcoming: ScheduleEntry[];
  /** Due, but they need API credits on this backend. */
  skipped: ScheduleEntry[];
}

/** Rebuilds the schedule from every run and saves the snapshot for other readers (the web UI). */
export async function refreshSchedule(ctx: CliContext, runs?: RunResult[]): Promise<ScheduleEntry[]> {
  const entries = buildSchedule(runs ?? (await ctx.store.listRuns()), await ctx.store.listHints());
  await writeSchedule(ctx.scheduleFile, toSchedule(entries, now(ctx)));
  return entries;
}

export async function reviewState(ctx: CliContext, runs?: RunResult[]): Promise<ReviewState> {
  const { exercises } = await loadExercises(exerciseRoots(ctx));
  const byId = new Map(exercises.map((e) => [e.id, e]));
  // A deleted exercise (a generated draft you threw away) drops out of the schedule.
  const entries = (await refreshSchedule(ctx, runs)).filter((e) => byId.has(e.exerciseId));
  const runnable = (e: ScheduleEntry) => {
    const ex = byId.get(e.exerciseId);
    return ex !== undefined && canRun(ctx.backend, ex);
  };
  const due = dueEntries(entries, now(ctx));
  return {
    exercises: byId,
    due: due.filter(runnable),
    upcoming: upcomingEntries(entries, now(ctx)).filter(runnable),
    skipped: due.filter((e) => !runnable(e)),
  };
}

export async function reviewCommand(ctx: CliContext): Promise<number> {
  const state = await reviewState(ctx);
  const at = now(ctx);
  if (state.due.length === 0 && state.upcoming.length === 0) {
    ctx.out("Nothing to review yet: exercises join the schedule after their first graded run. Try `dojo next`.");
    return 0;
  }
  if (state.due.length === 0) {
    ctx.out("Nothing due. Well done.");
  } else {
    ctx.out(`Due now (${state.due.length}):`);
    const rows = [["ID", "SKILL", "LEVEL", "BOX", "LAST", "DUE", "MISSED LAST TIME"]];
    for (const e of state.due) {
      const ex = state.exercises.get(e.exerciseId);
      rows.push([
        e.exerciseId,
        e.skill,
        ex ? levelName(ex.difficulty) : "-",
        String(e.box),
        `${e.lastScore}${e.lastPassed ? "" : " ✗"}`,
        relativeDays(e.dueAt, at),
        e.missed.join(", ") || "-",
      ]);
    }
    ctx.out(table(rows));
    const first = state.due[0];
    if (first) ctx.out(`\nStart with: ${reviewCommandFor(first)}`);
    ctx.out("--fresh moves your old solution aside and gives you the starter again, so you solve it from memory.");
  }
  const soon = state.upcoming.slice(0, 5);
  if (soon.length > 0) {
    ctx.out(`\nComing up: ${soon.map((e) => `${e.exerciseId} ${relativeDays(e.dueAt, at)}`).join(", ")}`);
  }
  if (state.skipped.length > 0) {
    ctx.out(`\nAlso due, but they need API credits (DOJO_BACKEND=api): ${state.skipped.map((e) => e.exerciseId).join(", ")}`);
  }
  return 0;
}
