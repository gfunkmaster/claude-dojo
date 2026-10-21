import { parseArgs } from "node:util";
import { analyzeCommand } from "./analyze.ts";
import { defaultContext, type CliContext } from "./context.ts";
import { listCommand } from "./list.ts";
import { nextCommand } from "./next.ts";
import { playbookCommand } from "./playbook.ts";
import { reviewCommand } from "./review.ts";
import { runCommand } from "./run.ts";
import { statsCommand } from "./stats.ts";

const USAGE = `Usage:
  dojo list                    The path from beginner to elite, with best score and calibration
  dojo next                    A review that is due, or else the next exercise on the path
  dojo review                  Exercises due for repetition, and what you missed last time
  dojo run <id>                First time: set up your workspace. After that: grade it
  dojo run <id> --calibrate    Grade the reference answers to check the judge
  dojo run <id> --keep         Keep the env sandbox on disk for debugging
  dojo run <id> --fresh        Move your old solution aside and start over from the starter
  dojo playbook [name]         Working routine and prompt template for a ticket: feature, bugfix, research
  dojo stats [id]              Per skill: mastery, trend, due reviews and cost; or one exercise's history
  dojo analyze                 Find patterns in your Claude Code sessions (local, no model calls)
    --days <n>                 Sessions from the last n days (default 30, 0 for all)
    --project <name>           Only projects whose folder name contains this
    --dir <path>               Transcript folder (default ~/.claude/projects)
    --generate                 Have your local claude -p draft personal exercises from them
    --max <n>                  At most n exercises (default 3)`;

export async function main(argv: string[], ctx: CliContext = defaultContext()): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      calibrate: { type: "boolean", default: false },
      keep: { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
      dir: { type: "string" },
      days: { type: "string", default: "30" },
      project: { type: "string" },
      generate: { type: "boolean", default: false },
      max: { type: "string", default: "3" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, id] = positionals;
  if (values.help || !command) {
    ctx.out(USAGE);
    return command || values.help ? 0 : 1;
  }
  switch (command) {
    case "list":
      return listCommand(ctx);
    case "next":
      return nextCommand(ctx);
    case "run":
      if (!id) {
        ctx.out("dojo run needs an exercise id");
        return 1;
      }
      return runCommand(ctx, id, { calibrate: values.calibrate, keep: values.keep, fresh: values.fresh });
    case "review":
      return reviewCommand(ctx);
    case "stats":
      return statsCommand(ctx, id);
    case "playbook":
      return playbookCommand(ctx, id);
    case "analyze": {
      const days = Number(values.days);
      const max = Number(values.max);
      if (!Number.isInteger(days) || days < 0 || !Number.isInteger(max) || max < 1) {
        ctx.out("--days must be a whole number of 0 or more, and --max 1 or more");
        return 1;
      }
      return analyzeCommand(ctx, {
        days,
        max,
        generate: values.generate,
        ...(values.dir ? { dir: values.dir } : {}),
        ...(values.project ? { project: values.project } : {}),
      });
    }
    default:
      ctx.out(`unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}
