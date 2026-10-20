import { loadExercises } from "../core/exercise.ts";
import { type CliContext, table } from "./context.ts";

export async function listCommand(ctx: CliContext): Promise<number> {
  const { exercises, errors } = await loadExercises(ctx.exercisesDir);
  const runs = await ctx.store.listRuns();
  const rows = [["ID", "SKILL", "TYPE", "LEVEL", "BEST", "CALIBRATED"]];
  for (const ex of exercises) {
    const scores = runs.filter((r) => r.exerciseId === ex.id).map((r) => r.score);
    const cal = await ctx.store.getCalibration(ex.id);
    rows.push([
      ex.id,
      ex.skill,
      ex.type,
      "*".repeat(ex.difficulty),
      scores.length ? String(Math.max(...scores)) : "-",
      cal === null ? "not yet" : cal.ok ? "yes" : "UNRELIABLE",
    ]);
  }
  ctx.out(table(rows));
  for (const err of errors) ctx.out(`invalid exercise: ${err}`);
  return errors.length > 0 ? 1 : 0;
}
