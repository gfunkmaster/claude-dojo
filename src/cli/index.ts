import { parseArgs } from "node:util";
import { defaultContext, type CliContext } from "./context.ts";
import { listCommand } from "./list.ts";
import { runCommand } from "./run.ts";
import { statsCommand } from "./stats.ts";

const USAGE = `Usage:
  dojo list                    List exercises with best score and calibration status
  dojo run <id>                First time: set up your workspace. After that: grade it
  dojo run <id> --calibrate    Grade the reference answers to check the judge
  dojo run <id> --keep         Keep the env sandbox on disk for debugging
  dojo stats [id]              Scores, tokens and cost per skill, or history for one exercise`;

export async function main(argv: string[], ctx: CliContext = defaultContext()): Promise<number> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      calibrate: { type: "boolean", default: false },
      keep: { type: "boolean", default: false },
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
    case "run":
      if (!id) {
        ctx.out("dojo run needs an exercise id");
        return 1;
      }
      return runCommand(ctx, id, { calibrate: values.calibrate, keep: values.keep });
    case "stats":
      return statsCommand(ctx, id);
    default:
      ctx.out(`unknown command: ${command}\n\n${USAGE}`);
      return 1;
  }
}
