import { HINT_LEVELS, isHintLevel, nextHintLevel, SOLUTION_LEVEL, solutionUnlocked, type HintLevel } from "../core/help.ts";
import { buildHint, formatHint } from "../core/hints.ts";
import { now, type CliContext } from "./context.ts";
import { findExercise } from "./run.ts";

export interface HintOptions {
  /** 1..3; without it, the next level you haven't seen. */
  level?: number;
  solution?: boolean;
  /** Print the hint as JSON (the web UI reads this). */
  json?: boolean;
}

/** `dojo hint <id>`: help in steps, so you learn instead of copy. Every hint you see is recorded. */
export async function hintCommand(ctx: CliContext, id: string, opts: HintOptions = {}): Promise<number> {
  const exercise = await findExercise(ctx, id);
  if (!exercise) {
    ctx.out(`unknown exercise: ${id} (see \`dojo list\`)`);
    return 1;
  }
  if (opts.level !== undefined && !isHintLevel(opts.level)) {
    ctx.out(`--level must be one of ${HINT_LEVELS.join(", ")}`);
    return 1;
  }
  const runs = await ctx.store.listRuns(exercise.id);
  const hints = await ctx.store.listHints(exercise.id);
  let level: HintLevel;
  if (opts.solution) level = SOLUTION_LEVEL;
  else if (opts.level !== undefined) level = opts.level as HintLevel;
  else {
    level = nextHintLevel(exercise.id, runs, hints);
    if (level === SOLUTION_LEVEL) {
      ctx.out(`You have seen both hints for ${exercise.id}. What's left is the solution: \`dojo hint ${exercise.id} --solution\``);
      ctx.out(`See a hint again with --level 1 or --level 2.`);
      return 0;
    }
  }
  if (level === SOLUTION_LEVEL && !solutionUnlocked(exercise.id, runs)) {
    ctx.out(`Grade an attempt first (\`dojo run ${exercise.id}\`): the solution unlocks after your first graded run.`);
    return 1;
  }
  const hint = await buildHint(exercise, level, runs.at(-1));
  await ctx.store.saveHint({ schemaVersion: 1, exerciseId: exercise.id, level, at: now(ctx).toISOString() });
  if (opts.json) {
    ctx.out(JSON.stringify(hint));
    return 0;
  }
  for (const line of formatHint(hint)) ctx.out(line);
  ctx.out("");
  if (level === SOLUTION_LEVEL) {
    ctx.out("A pass graded within a day of this doesn't move the exercise up in the review schedule or count toward mastery.");
    ctx.out(`To make it stick: \`dojo run ${exercise.id} --fresh\` tomorrow and write it from memory.`);
  } else if (level === 1) {
    ctx.out(`Still stuck? \`dojo hint ${exercise.id}\` again for a stronger nudge.`);
  } else {
    ctx.out(`Last resort: \`dojo hint ${exercise.id} --solution\``);
  }
  return 0;
}
