import { z } from "zod";
import { SKILLS } from "./exercise.ts";
import type { RunResult } from "./result.ts";

/**
 * Leitner boxes: how many days until an exercise comes back. A fail drops it to box 1,
 * a solid pass moves it up one box, a shaky pass keeps it where it is.
 */
export const BOX_DAYS = [1, 3, 7, 14, 30] as const;
/** A pass below this is shaky: it counts as passed but doesn't move the exercise up. */
export const SOLID_SCORE = 85;

const DAY_MS = 24 * 60 * 60 * 1000;

export const ScheduleEntrySchema = z.object({
  exerciseId: z.string(),
  skill: z.enum(SKILLS),
  /** 1..BOX_DAYS.length */
  box: z.number().int().min(1).max(BOX_DAYS.length),
  dueAt: z.iso.datetime(),
  lastRunAt: z.iso.datetime(),
  lastScore: z.number().min(0).max(100),
  lastPassed: z.boolean(),
  /** failedCriteria of the last run: what to focus on next time. */
  missed: z.array(z.string()),
  runs: z.number().int().positive(),
  fails: z.number().int().nonnegative(),
});
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

/** `<DOJO_HOME>/schedule.json`: a snapshot of `buildSchedule`, rewritten after every graded run. */
export const ScheduleSchema = z.object({
  schemaVersion: z.literal(1),
  generatedAt: z.iso.datetime(),
  entries: z.array(ScheduleEntrySchema),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** Replays every run in order. Same runs in, same schedule out: there is no hidden state. */
export function buildSchedule(runs: RunResult[]): ScheduleEntry[] {
  const byExercise = new Map<string, RunResult[]>();
  for (const r of [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    byExercise.set(r.exerciseId, [...(byExercise.get(r.exerciseId) ?? []), r]);
  }
  const entries: ScheduleEntry[] = [];
  for (const [exerciseId, history] of byExercise) {
    let box = 0;
    let due = 0;
    let fails = 0;
    for (const r of history) {
      const at = Date.parse(r.startedAt);
      if (!r.passed) {
        fails++;
        box = 1;
      } else if (box === 0 || at >= due) {
        box = r.score >= SOLID_SCORE ? Math.min(Math.max(box, 1) + 1, BOX_DAYS.length) : Math.max(box, 1);
      } else {
        // Passing again before it is due proves nothing new: keep box and due date.
        continue;
      }
      due = at + (BOX_DAYS[box - 1] ?? 1) * DAY_MS;
    }
    const last = history[history.length - 1];
    if (!last) continue;
    entries.push({
      exerciseId,
      skill: last.skill,
      box,
      dueAt: new Date(due).toISOString(),
      lastRunAt: last.startedAt,
      lastScore: last.score,
      lastPassed: last.passed,
      missed: last.failedCriteria,
      runs: history.length,
      fails,
    });
  }
  return entries.sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.exerciseId.localeCompare(b.exerciseId));
}

export function isDue(entry: ScheduleEntry, now: Date): boolean {
  return Date.parse(entry.dueAt) <= now.getTime();
}

/** What to review now: the lowest box first (failed ones), then the most overdue. */
export function dueEntries(entries: ScheduleEntry[], now: Date): ScheduleEntry[] {
  return entries
    .filter((e) => isDue(e, now))
    .sort((a, b) => a.box - b.box || a.dueAt.localeCompare(b.dueAt) || a.exerciseId.localeCompare(b.exerciseId));
}

/** Not due yet, soonest first. */
export function upcomingEntries(entries: ScheduleEntry[], now: Date): ScheduleEntry[] {
  return entries.filter((e) => !isDue(e, now));
}

export function toSchedule(entries: ScheduleEntry[], now: Date): Schedule {
  return { schemaVersion: 1, generatedAt: now.toISOString(), entries };
}

/** How to start a review: a failed exercise continues where you left off, a passed one starts over. */
export function reviewCommandFor(entry: ScheduleEntry): string {
  return entry.lastPassed ? `dojo run ${entry.exerciseId} --fresh` : `dojo run ${entry.exerciseId}`;
}

/** "in 3 days", "today", "2 days ago". */
export function relativeDays(iso: string, now: Date): string {
  const days = Math.round((Date.parse(iso) - now.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days > 0) return days === 1 ? "tomorrow" : `in ${days} days`;
  return days === -1 ? "yesterday" : `${-days} days ago`;
}
