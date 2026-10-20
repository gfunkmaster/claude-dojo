import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runCheck } from "../checks/index.ts";
import { addUsage, ZERO_USAGE } from "../core/pricing.ts";
import type { CaseRun, Runner } from "./types.ts";

function git(cwd: string, ...args: string[]): string {
  const proc = spawnSync("git", ["-c", "user.name=dojo", "-c", "user.email=dojo@localhost", ...args], {
    cwd,
    encoding: "utf8",
  });
  if (proc.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${proc.stderr}`);
  return proc.stdout;
}

/** Copies the fixture repo plus your solution into a temp folder and commits it as the baseline. */
export async function prepareSandbox(fixtureDir: string, solutionDir: string): Promise<string> {
  const sandbox = await mkdtemp(path.join(tmpdir(), "dojo-"));
  await cp(fixtureDir, sandbox, { recursive: true });
  await cp(solutionDir, sandbox, { recursive: true });
  git(sandbox, "init", "-q");
  git(sandbox, "add", "-A");
  git(sandbox, "commit", "-q", "-m", "dojo baseline");
  return sandbox;
}

export const envRunner: Runner = async (exercise, solutionDir, deps) => {
  if (!exercise.env) throw new Error(`${exercise.id} has no env block`);
  const env = exercise.env;
  let usage = ZERO_USAGE;
  let cost = 0;
  let turns = 0;
  const models = new Set<string>();
  const runs: CaseRun[] = [];

  for (const c of exercise.cases) {
    if (!c.task) throw new Error(`env case ${c.name} has no task`);
    const sandbox = await prepareSandbox(path.join(exercise.dir, env.fixture), solutionDir);
    try {
      deps.log?.(`  ${c.name}: running claude -p in ${sandbox}`);
      const res = await deps.claude.run({
        cwd: sandbox,
        prompt: c.task,
        maxBudgetUsd: env.maxCostUsd,
        allowedTools: env.allowedTools,
      });
      usage = addUsage(usage, res.usage);
      cost += res.costUsd;
      turns += res.turns;
      res.models.forEach((m) => models.add(m));
      const ctx = { cwd: sandbox, turns: res.turns, costUsd: res.costUsd };
      const checks = c.checks.map((check) => runCheck(check, ctx));
      const changes = git(sandbox, "status", "--short").trim() || "(no changes)";
      runs.push({
        name: c.name,
        output: `Claude's final message:\n${res.result}\n\nFiles changed:\n${changes}\n\nTurns: ${res.turns}${res.isError ? "\n(run ended with an error)" : ""}`,
        checks,
      });
    } finally {
      if (deps.keepSandbox) deps.log?.(`  sandbox kept: ${sandbox}`);
      else await rm(sandbox, { recursive: true, force: true });
    }
  }
  return { cases: runs, usage, costUsd: cost, turns, models: [...models] };
};
