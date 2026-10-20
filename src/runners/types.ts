import type { CheckResult } from "../checks/index.ts";
import type { Exercise } from "../core/exercise.ts";
import type { TokenUsage } from "../core/pricing.ts";
import type { ClaudeCli } from "../llm/claude-cli.ts";
import type { LlmClient } from "../llm/client.ts";

export interface CaseRun {
  name: string;
  /** What the judge sees for this case: model output or a summary of the sandbox run. */
  output: string;
  checks: CheckResult[];
}

export interface Attempt {
  cases: CaseRun[];
  usage: TokenUsage;
  costUsd: number;
  turns: number;
  models: string[];
}

export interface RunnerDeps {
  llm: LlmClient;
  claude: ClaudeCli;
  /** Keep env sandboxes on disk for debugging. */
  keepSandbox?: boolean;
  log?: (line: string) => void;
}

export type Runner = (exercise: Exercise, solutionDir: string, deps: RunnerDeps) => Promise<Attempt>;
