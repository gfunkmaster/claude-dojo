import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveBackend, type Backend } from "../llm/backend.ts";
import { ClaudeCliLlmClient } from "../llm/claude-cli-client.ts";
import { RealClaudeCli, type ClaudeCli } from "../llm/claude-cli.ts";
import { AnthropicLlmClient, type LlmClient } from "../llm/client.ts";
import { JsonResultStore, type ResultStore } from "../store/json-store.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface CliContext {
  exercisesDir: string;
  /** Your personal exercises from `dojo analyze --generate`. Never committed. */
  generatedDir: string;
  workspaceDir: string;
  /** Ticket routines printed by `dojo playbook`. */
  playbooksDir: string;
  /** Snapshot of the review schedule, rebuilt from the results after every graded run. */
  scheduleFile: string;
  store: ResultStore;
  backend: Backend;
  /** Created lazily so `list` and `stats` work without an API key. */
  llm: () => LlmClient;
  claude: () => ClaudeCli;
  out: (line: string) => void;
  /** The clock the schedule is read against. Tests pin it. */
  now?: () => Date;
}

export function defaultContext(): CliContext {
  const home = process.env.DOJO_HOME ?? REPO_ROOT;
  const backend = resolveBackend();
  let llm: LlmClient | undefined;
  let claude: ClaudeCli | undefined;
  const getClaude = () => (claude ??= new RealClaudeCli({ subscription: backend === "claude-cli" }));
  return {
    exercisesDir: process.env.DOJO_EXERCISES ?? path.join(REPO_ROOT, "exercises"),
    generatedDir: path.join(home, "generated"),
    workspaceDir: path.join(home, "workspace"),
    playbooksDir: path.join(REPO_ROOT, "playbooks"),
    scheduleFile: path.join(home, "schedule.json"),
    store: new JsonResultStore(path.join(home, "results")),
    backend,
    llm: () => (llm ??= backend === "api" ? new AnthropicLlmClient() : new ClaudeCliLlmClient(getClaude())),
    claude: getClaude,
    out: (line) => console.log(line),
  };
}

/** The bundled path plus your generated exercises. */
export function exerciseRoots(ctx: CliContext): string[] {
  return [ctx.exercisesDir, ctx.generatedDir];
}

export function now(ctx: CliContext): Date {
  return ctx.now?.() ?? new Date();
}

export function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
  return rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd()).join("\n");
}
