import path from "node:path";
import { fileURLToPath } from "node:url";
import { RealClaudeCli, type ClaudeCli } from "../llm/claude-cli.ts";
import { AnthropicLlmClient, type LlmClient } from "../llm/client.ts";
import { JsonResultStore, type ResultStore } from "../store/json-store.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export interface CliContext {
  exercisesDir: string;
  workspaceDir: string;
  store: ResultStore;
  /** Created lazily so `list` and `stats` work without an API key. */
  llm: () => LlmClient;
  claude: () => ClaudeCli;
  out: (line: string) => void;
}

export function defaultContext(): CliContext {
  const home = process.env.DOJO_HOME ?? REPO_ROOT;
  let llm: LlmClient | undefined;
  let claude: ClaudeCli | undefined;
  return {
    exercisesDir: process.env.DOJO_EXERCISES ?? path.join(REPO_ROOT, "exercises"),
    workspaceDir: path.join(home, "workspace"),
    store: new JsonResultStore(path.join(home, "results")),
    llm: () => (llm ??= new AnthropicLlmClient()),
    claude: () => (claude ??= new RealClaudeCli()),
    out: (line) => console.log(line),
  };
}

export function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? "").length))) ?? [];
  return rows.map((r) => r.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join("  ").trimEnd()).join("\n");
}
