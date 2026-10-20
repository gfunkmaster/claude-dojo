import { curriculumOrder, levelName, nextExercise } from "../core/curriculum.ts";
import { loadExercises } from "../core/exercise.ts";
import type { CliContext } from "./context.ts";

export async function nextCommand(ctx: CliContext): Promise<number> {
  const { exercises } = await loadExercises(ctx.exercisesDir);
  const runs = await ctx.store.listRuns();
  const next = nextExercise(exercises, runs);
  if (!next) {
    ctx.out(`You have passed all ${exercises.length} exercises. Elite.`);
    return 0;
  }
  const position = curriculumOrder(exercises).indexOf(next) + 1;
  ctx.out(`Next (${position}/${exercises.length}, ${levelName(next.difficulty)}, ${next.skill}): ${next.title}`);
  ctx.out(`Start with: dojo run ${next.id}`);
  return 0;
}
