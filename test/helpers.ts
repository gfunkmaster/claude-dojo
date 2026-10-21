import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CliContext } from "../src/cli/context.ts";
import { JsonResultStore } from "../src/store/json-store.ts";
import { FakeClaude, FakeLlm } from "./fakes.ts";

export const EXERCISES_DIR = path.resolve(import.meta.dirname, "../exercises");

export async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "dojo-test-"));
}

export async function testContext(): Promise<CliContext & { lines: string[]; fakeLlm: FakeLlm; fakeClaude: FakeClaude }> {
  const home = await tempDir();
  const lines: string[] = [];
  const fakeLlm = new FakeLlm();
  const fakeClaude = new FakeClaude();
  return {
    exercisesDir: EXERCISES_DIR,
    generatedDir: path.join(home, "generated"),
    workspaceDir: path.join(home, "workspace"),
    scheduleFile: path.join(home, "schedule.json"),
    store: new JsonResultStore(path.join(home, "results")),
    backend: "api",
    llm: () => fakeLlm,
    claude: () => fakeClaude,
    out: (line) => lines.push(line),
    lines,
    fakeLlm,
    fakeClaude,
  };
}
