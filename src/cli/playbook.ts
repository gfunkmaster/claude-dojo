import { PLAYBOOKS } from "../core/exercise.ts";
import { isPlaybook, playbookSummary, readPlaybook } from "../core/playbook.ts";
import { type CliContext, table } from "./context.ts";

export async function playbookCommand(ctx: CliContext, name: string | undefined): Promise<number> {
  if (name === undefined) {
    const rows = [["PLAYBOOK", "ROUTINE"]];
    for (const p of PLAYBOOKS) rows.push([p, playbookSummary(await readPlaybook(ctx.playbooksDir, p))]);
    ctx.out(table(rows));
    ctx.out("\nPrint one with `dojo playbook <name>`.");
    return 0;
  }
  if (!isPlaybook(name)) {
    ctx.out(`unknown playbook: ${name} (one of ${PLAYBOOKS.join(", ")})`);
    return 1;
  }
  ctx.out((await readPlaybook(ctx.playbooksDir, name)).trimEnd());
  return 0;
}
