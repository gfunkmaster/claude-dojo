import { readFile } from "node:fs/promises";
import path from "node:path";
import { PLAYBOOKS, type Playbook } from "./exercise.ts";

export function isPlaybook(name: string): name is Playbook {
  return (PLAYBOOKS as readonly string[]).includes(name);
}

/** The markdown of `playbooks/<name>.md`. */
export async function readPlaybook(dir: string, name: Playbook): Promise<string> {
  return readFile(path.join(dir, `${name}.md`), "utf8");
}

/** The one-line summary under a playbook's title. */
export function playbookSummary(markdown: string): string {
  return markdown.split("\n").find((line) => line.trim() !== "" && !line.startsWith("#"))?.trim() ?? "";
}
