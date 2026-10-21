import type { Exercise } from "../core/exercise.ts";

/**
 * Where prompt exercises and the judge get their model calls:
 * - `api`: the Anthropic API with ANTHROPIC_API_KEY, billed per token.
 * - `claude-cli`: `claude -p`, signed in with your Claude subscription.
 */
export const BACKENDS = ["api", "claude-cli"] as const;
export type Backend = (typeof BACKENDS)[number];

/** These send raw Messages API requests (custom tools, cache_control, max_tokens), which `claude -p` can't. */
export const API_ONLY_TYPES: readonly Exercise["type"][] = ["tools", "request"];

/** DOJO_BACKEND wins; otherwise the API when a key is set, else your subscription. */
export function resolveBackend(env: NodeJS.ProcessEnv = process.env): Backend {
  const wanted = env.DOJO_BACKEND;
  if (wanted) {
    if (!(BACKENDS as readonly string[]).includes(wanted)) {
      throw new Error(`DOJO_BACKEND must be one of: ${BACKENDS.join(", ")} (got "${wanted}")`);
    }
    return wanted as Backend;
  }
  return env.ANTHROPIC_API_KEY ? "api" : "claude-cli";
}

export function canRun(backend: Backend, exercise: Exercise): boolean {
  return backend === "api" || !API_ONLY_TYPES.includes(exercise.type);
}
