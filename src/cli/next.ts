import { curriculumOrder, levelName, nextExercise } from "../core/curriculum.ts";
import { loadExercises } from "../core/exercise.ts";
import { relativeDays, reviewCommandFor } from "../core/schedule.ts";
import { canRun } from "../llm/backend.ts";
import { exerciseRoots, now, type CliContext } from "./context.ts";
import { reviewState } from "./review.ts";

export async function nextCommand(ctx: CliContext): Promise<number> {
  const { exercises } = await loadExercises(exerciseRoots(ctx));
  const runs = await ctx.store.listRuns();
  // Due reviews come before new material: that is what keeps a skill from fading.
  const { due } = await reviewState(ctx, runs);
  const review = due[0];
  if (review) {
    const ex = exercises.find((e) => e.id === review.exerciseId);
    const missed = review.missed.length > 0 ? `, missed ${review.missed.join(", ")}` : "";
    ctx.out(`Review due (${due.length} in total), ${levelName(ex?.difficulty ?? 1)}, ${review.skill}: ${ex?.title ?? review.exerciseId}`);
    ctx.out(`Last score ${review.lastScore}, ${relativeDays(review.lastRunAt, now(ctx))}${missed}.`);
    ctx.out(`Start with: ${reviewCommandFor(review)}`);
    if (due.length > 1) ctx.out("See them all with `dojo review`.");
    return 0;
  }
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
