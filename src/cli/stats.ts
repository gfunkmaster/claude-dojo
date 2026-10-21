import { mostMissed, skillProgress, sparkline, weakestSkills } from "../core/progress.ts";
import type { RunResult } from "../core/result.ts";
import { buildSchedule, isDue, relativeDays } from "../core/schedule.ts";
import { now, type CliContext, table } from "./context.ts";

function topMissed(runs: RunResult[]): string {
  return mostMissed(runs).map(({ id, count }) => `${id} (${count})`).join(", ") || "-";
}

const signed = (n: number | null): string => (n === null ? "-" : n > 0 ? `+${n}` : String(n));

export async function statsCommand(ctx: CliContext, id?: string): Promise<number> {
  const runs = await ctx.store.listRuns(id);
  if (runs.length === 0) {
    ctx.out(id ? `no runs for ${id} yet` : "no runs yet: try `dojo list` and `dojo run <id>`");
    return 0;
  }
  const at = now(ctx);
  const schedule = buildSchedule(runs);
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
    const entry = schedule[0];
    if (entry) ctx.out(`Review: box ${entry.box}, due ${relativeDays(entry.dueAt, at)}`);
    return 0;
  }
  const progress = skillProgress(runs);
  const rows = [["SKILL", "RUNS", "MASTERY", "TREND", "RECENT", "DUE", "COST", "MOST MISSED"]];
  for (const p of progress) {
    rows.push([
      p.skill,
      String(p.runs),
      String(p.mastery),
      signed(p.trend),
      sparkline(p.recent),
      String(schedule.filter((e) => e.skill === p.skill && isDue(e, at)).length),
      `$${p.costUsd.toFixed(4)}`,
      p.mostMissed.map(({ id: c, count }) => `${c} (${count})`).join(", ") || "-",
    ]);
  }
  ctx.out(table(rows));
  ctx.out("\nMASTERY: mean of the latest score on each exercise you have run. TREND: last runs against the ones before.");
  const weakest = weakestSkills(progress).filter((p) => p.mastery < 100);
  if (weakest.length > 0) ctx.out(`Weakest: ${weakest.map((p) => `${p.skill} (${p.mastery})`).join(", ")}. See \`dojo review\`.`);
  ctx.out(`Total: ${runs.length} runs, $${runs.reduce((s, r) => s + r.costUsd, 0).toFixed(4)}`);
  return 0;
}
