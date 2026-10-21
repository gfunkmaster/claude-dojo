import { cp, rename, stat } from "node:fs/promises";
import path from "node:path";
import { loadExercises, type Exercise } from "../core/exercise.ts";
import { gradeSolution } from "../core/grade.ts";
import type { RunResult } from "../core/result.ts";
import { relativeDays } from "../core/schedule.ts";
import { calibrate } from "../judge/calibrate.ts";
import { canRun } from "../llm/backend.ts";
import { exerciseRoots, now, type CliContext } from "./context.ts";
import { refreshSchedule } from "./review.ts";

export interface RunOptions {
  calibrate?: boolean;
  keep?: boolean;
  /** Move the existing workspace aside and start over from the starter (for reviews). */
  fresh?: boolean;
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function findExercise(ctx: CliContext, id: string): Promise<Exercise | undefined> {
  const { exercises } = await loadExercises(exerciseRoots(ctx));
  return exercises.find((e) => e.id === id);
}

export async function runCommand(ctx: CliContext, id: string, opts: RunOptions = {}): Promise<number> {
  const exercise = await findExercise(ctx, id);
  if (!exercise) {
    ctx.out(`unknown exercise: ${id} (see \`dojo list\`)`);
    return 1;
  }
  const solutionDir = path.join(ctx.workspaceDir, exercise.id);
  if (opts.fresh && !opts.calibrate && (await exists(solutionDir))) {
    // Never delete a solution: it may be the only copy of the user's work.
    const aside = `${solutionDir}.old-${now(ctx).toISOString().replace(/[:.]/g, "-")}`;
    await rename(solutionDir, aside);
    ctx.out(`Moved your previous solution to ${aside}`);
  }
  const firstRun = !opts.calibrate && !(await exists(solutionDir));
  if (!firstRun && !canRun(ctx.backend, exercise)) {
    ctx.out(`${exercise.id} is a ${exercise.type} exercise: it sends raw Messages API requests, so it needs API credits.`);
    ctx.out("Set ANTHROPIC_API_KEY and DOJO_BACKEND=api to run it. On your subscription, `dojo next` skips these.");
    return 1;
  }
  const deps = { llm: ctx.llm(), claude: ctx.claude(), keepSandbox: opts.keep ?? false, log: ctx.out };

  if (opts.calibrate) {
    ctx.out(`Calibrating ${exercise.id}…`);
    const cal = await calibrate(exercise, deps);
    await ctx.store.saveCalibration(cal);
    for (const r of cal.references) {
      ctx.out(`  ${r.ok ? "ok  " : "FAIL"} ${r.label.padEnd(4)} ${String(r.score).padStart(3)}  expected ${r.expect[0]}–${r.expect[1]}  (${r.dir})`);
    }
    ctx.out(cal.ok ? "Calibration passed." : "Calibration failed: the exercise is marked unreliable.");
    ctx.out(`Cost: $${cal.costUsd.toFixed(4)}${ctx.backend === "claude-cli" ? " (API list price; your subscription covers it)" : ""}`);
    return cal.ok ? 0 : 1;
  }

  if (firstRun) {
    const starter = path.join(exercise.dir, "starter");
    await cp(starter, solutionDir, { recursive: true });
    ctx.out(`# ${exercise.title}\n\n${exercise.body}\n`);
    ctx.out(`Your workspace: ${solutionDir}`);
    ctx.out(`Edit ${exercise.solution} there, then run \`dojo run ${exercise.id}\` again to be graded.`);
    return 0;
  }

  ctx.out(`Grading ${exercise.id}…`);
  const result = await gradeSolution(exercise, solutionDir, deps);
  const file = await ctx.store.saveRun(result);
  printResult(ctx, result);
  ctx.out(`Saved: ${file}`);
  const entry = (await refreshSchedule(ctx)).find((e) => e.exerciseId === exercise.id);
  if (entry) ctx.out(`Next review: ${relativeDays(entry.dueAt, now(ctx))} (box ${entry.box})`);
  return result.passed ? 0 : 1;
}

export function printResult(ctx: CliContext, r: RunResult): void {
  ctx.out("");
  for (const c of r.cases) {
    ctx.out(`${c.name}`);
    for (const ch of c.checks) ctx.out(`  ${ch.passed ? "✓" : "✗"} ${ch.check}${!ch.passed && ch.detail ? ` — ${ch.detail}` : ""}`);
  }
  if (r.criteria.length > 0) {
    ctx.out("\nJudge");
    for (const c of r.criteria) {
      ctx.out(`  ${c.grade.padEnd(7)} ${c.id}: ${c.reasoning}`);
      if (c.grade !== "pass" && c.tip) ctx.out(`          tip: ${c.tip}`);
    }
  }
  if (r.judgeNote) ctx.out(`\n${r.judgeNote}`);
  if (r.summary) ctx.out(`\n${r.summary}`);
  const judgePart = r.judgeScore === null ? "-" : `${Math.round(r.judgeScore * 100)}%`;
  ctx.out(`\nScore ${r.score}/100 ${r.passed ? "(passed)" : "(not passed)"}  checks ${Math.round(r.checkScore * 100)}%  judge ${judgePart}`);
  const costNote = ctx.backend === "claude-cli" ? " (API list price; your subscription covers it)" : "";
  ctx.out(`Tokens in ${r.tokens.input} out ${r.tokens.output} cache ${r.tokens.cacheRead}/${r.tokens.cacheWrite}  cost $${r.costUsd.toFixed(4)}${costNote}  turns ${r.turns}`);
}
