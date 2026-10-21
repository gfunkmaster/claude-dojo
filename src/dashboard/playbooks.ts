import { PLAYBOOKS, type Playbook } from "../core/exercise.ts";
import { isPlaybook, playbookSummary, readPlaybook } from "../core/playbook.ts";

/** `dojo playbook` for the web UI: the list, and one playbook split so each code block gets a copy button. */

export interface PlaybookRow {
  name: Playbook;
  summary: string;
}

export async function loadPlaybooks(dir: string): Promise<PlaybookRow[]> {
  return Promise.all(PLAYBOOKS.map(async (name) => ({ name, summary: playbookSummary(await readPlaybook(dir, name)) })));
}

export type Segment = { kind: "text"; text: string } | { kind: "code"; lang: string; text: string };

/** Prose and fenced code blocks, in order. An unclosed fence runs to the end. */
export function splitFences(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let text: string[] = [];
  let code: string[] | null = null;
  let lang = "";
  const flushText = () => {
    const t = text.join("\n").trim();
    if (t) segments.push({ kind: "text", text: t });
    text = [];
  };
  for (const line of markdown.split("\n")) {
    const fence = /^```\s*([\w-]*)\s*$/.exec(line);
    if (code === null && fence) {
      flushText();
      code = [];
      lang = fence[1] ?? "";
    } else if (code !== null && /^```\s*$/.test(line)) {
      segments.push({ kind: "code", lang, text: code.join("\n") });
      code = null;
    } else if (code !== null) {
      code.push(line);
    } else {
      text.push(line);
    }
  }
  if (code !== null) segments.push({ kind: "code", lang, text: code.join("\n") });
  flushText();
  return segments;
}

export interface PlaybookDetail {
  name: Playbook;
  markdown: string;
  segments: Segment[];
}

export async function loadPlaybook(dir: string, name: string): Promise<PlaybookDetail | null> {
  if (!isPlaybook(name)) return null;
  const markdown = (await readPlaybook(dir, name)).trimEnd();
  return { name, markdown, segments: splitFences(markdown) };
}
