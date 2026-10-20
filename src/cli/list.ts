import { bestScores, curriculumOrder, levelName } from "../core/curriculum.ts";
import { loadExercises } from "../core/exercise.ts";
import { type CliContext, table } from "./context.ts";

export async function listCommand(ctx: CliContext): Promise<number> {
  const { exercises, errors } = await loadExercises(ctx.exercisesDir);
  const best = bestScores(await ctx.store.listRuns());
  const rows = [["#", "ID", "LEVEL", "SKILL", "TYPE", "BEST", "CALIBRATED"]];
  let n = 0;
  for (const ex of curriculumOrder(exercises)) {
    const cal = await ctx.store.getCalibration(ex.id);
    const score = best.get(ex.id);
    rows.push([
      String(++n),
      ex.id,
      levelName(ex.difficulty),
      ex.skill,
      ex.type,
      score === undefined ? "-" : String(score),
      cal === null ? "not yet" : cal.ok ? "yes" : "UNRELIABLE",
    ]);
  }
  ctx.out(table(rows));
  for (const err of errors) ctx.out(`invalid exercise: ${err}`);
  return errors.length > 0 ? 1 : 0;
}
