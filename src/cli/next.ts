import { curriculumOrder, levelName, nextExercise } from "../core/curriculum.ts";
import { loadExercises } from "../core/exercise.ts";
import { canRun } from "../llm/backend.ts";
import { exerciseRoots, type CliContext } from "./context.ts";

export async function nextCommand(ctx: CliContext): Promise<number> {
  const { exercises } = await loadExercises(exerciseRoots(ctx));
  const runs = await ctx.store.listRuns();
  // On a subscription, skip the exercises that need API credits instead of stopping at them.
  const runnable = exercises.filter((e) => canRun(ctx.backend, e));
  const skipped = exercises.length - runnable.length;
  const skipNote = `Skipping ${skipped} tools/request exercises: they need API credits (DOJO_BACKEND=api).`;
  const next = nextExercise(runnable, runs);
  if (!next) {
    ctx.out(skipped > 0 ? `You have passed all ${runnable.length} exercises you can run on your subscription.` : `You have passed all ${exercises.length} exercises. Elite.`);
    if (skipped > 0) ctx.out(skipNote);
    return 0;
  }
  const position = curriculumOrder(exercises).indexOf(next) + 1;
  ctx.out(`Next (${position}/${exercises.length}, ${levelName(next.difficulty)}, ${next.skill}): ${next.title}`);
  ctx.out(`Start with: dojo run ${next.id}`);
  if (skipped > 0) ctx.out(skipNote);
  return 0;
}
