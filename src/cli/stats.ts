import { SKILLS } from "../core/exercise.ts";
import type { RunResult } from "../core/result.ts";
import { type CliContext, table } from "./context.ts";

function topMissed(runs: RunResult[], n = 3): string {
  const counts = new Map<string, number>();
  for (const r of runs) for (const id of r.failedCriteria) counts.set(id, (counts.get(id) ?? 0) + 1);
  return (
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, n)
      .map(([id, count]) => `${id} (${count})`)
      .join(", ") || "-"
  );
}

export async function statsCommand(ctx: CliContext, id?: string): Promise<number> {
  const runs = await ctx.store.listRuns(id);
  if (runs.length === 0) {
    ctx.out(id ? `no runs for ${id} yet` : "no runs yet: try `dojo list` and `dojo run <id>`");
    return 0;
  }
  if (id) {
    const rows = [["DATE", "SCORE", "CHECKS", "JUDGE", "TOKENS", "COST"]];
    for (const r of runs) {
      rows.push([
        r.startedAt.slice(0, 16).replace("T", " "),
        String(r.score),
        `${Math.round(r.checkScore * 100)}%`,
        r.judgeScore === null ? "-" : `${Math.round(r.judgeScore * 100)}%`,
        String(r.tokens.input + r.tokens.output + r.tokens.cacheRead + r.tokens.cacheWrite),
        `$${r.costUsd.toFixed(4)}`,
      ]);
    }
    ctx.out(table(rows));
    ctx.out(`\nMost missed: ${topMissed(runs)}`);
    return 0;
  }
  const rows = [["SKILL", "RUNS", "LAST", "BEST", "COST", "MOST MISSED"]];
  for (const skill of SKILLS) {
    const forSkill = runs.filter((r) => r.skill === skill);
    if (forSkill.length === 0) continue;
    const last = forSkill[forSkill.length - 1];
    rows.push([
      skill,
      String(forSkill.length),
      String(last?.score ?? "-"),
      String(Math.max(...forSkill.map((r) => r.score))),
      `$${forSkill.reduce((s, r) => s + r.costUsd, 0).toFixed(4)}`,
      topMissed(forSkill),
    ]);
  }
  ctx.out(table(rows));
  ctx.out(`\nTotal: ${runs.length} runs, $${runs.reduce((s, r) => s + r.costUsd, 0).toFixed(4)}`);
  return 0;
}
