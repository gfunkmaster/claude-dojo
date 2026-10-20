import type { Exercise } from "../core/exercise.ts";
import { envRunner } from "./env.ts";
import { evalRunner } from "./eval.ts";
import { promptRunner } from "./prompt.ts";
import type { Runner } from "./types.ts";

const RUNNERS: Record<Exercise["type"], Runner> = {
  prompt: promptRunner,
  env: envRunner,
  eval: evalRunner,
};

export function runnerFor(exercise: Exercise): Runner {
  return RUNNERS[exercise.type];
}
