import type { Exercise } from "../core/exercise.ts";
import { envRunner } from "./env.ts";
import { evalRunner } from "./eval.ts";
import { promptRunner } from "./prompt.ts";
import { requestRunner } from "./request.ts";
import { toolsRunner } from "./tools.ts";
import type { Runner } from "./types.ts";

const RUNNERS: Record<Exercise["type"], Runner> = {
  prompt: promptRunner,
  env: envRunner,
  eval: evalRunner,
  tools: toolsRunner,
  request: requestRunner,
};

export function runnerFor(exercise: Exercise): Runner {
  return RUNNERS[exercise.type];
}
