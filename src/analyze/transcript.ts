import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Claude Code writes one JSONL file per session under ~/.claude/projects/<project>/.
 * The format is internal to Claude Code and changes between versions, so the
 * parser reads only a few stable fields and skips anything it doesn't know.
 */

export interface ToolUse {
  id: string;
  name: string;
  input: unknown;
}

export type TranscriptEvent =
  /** Something you typed. Tool results, slash command output and meta messages are not prompts. */
  | { kind: "prompt"; text: string; at?: string }
  /** You pressed Esc, or rejected a tool call. */
  | { kind: "interrupt"; at?: string }
  /** One model message, merged from the per-block lines Claude Code writes. */
  | { kind: "assistant"; id: string; text: string; toolUses: ToolUse[]; contextTokens: number; at?: string }
  | { kind: "tool-result"; toolUseId: string; isError: boolean; size: number; at?: string }
  /** The conversation was compacted because the context filled up. */
  | { kind: "compact"; at?: string };

export interface Session {
  id: string;
  file: string;
  /** The folder Claude Code ran in, by name. */
  project: string;
  start?: string;
  events: TranscriptEvent[];
}

export function defaultProjectsDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude"), "projects");
}

const INTERRUPTED = /^\[Request interrupted by user/;
const REJECTED = /The user doesn't want to proceed with this tool use|tool use was rejected/i;
/** Text Claude Code injects into the user turn; none of it is something you typed. */
const INJECTED = /^\s*<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|system-reminder|bash-input|bash-stdout|bash-stderr|user-memory-input)>/;

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function blocks(content: unknown): Json[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? content.filter(isObject) : [];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return blocks(content)
    .map((b) => str(b.text) ?? "")
    .join("\n");
}

/** Parses one session. Lines that aren't JSON or aren't understood are skipped. */
export function parseTranscript(source: string, file: string, fallbackProject: string): Session {
  const events: TranscriptEvent[] = [];
  let id = path.basename(file, ".jsonl");
  let project = fallbackProject;
  let start: string | undefined;
  let last: Extract<TranscriptEvent, { kind: "assistant" }> | undefined;

  for (const line of source.split("\n")) {
    if (!line.trim()) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(entry)) continue;
    // Subagent turns have no human in them.
    if (entry.isSidechain === true) continue;
    const at = str(entry.timestamp);
    if (at && !start) start = at;
    const cwd = str(entry.cwd);
    if (cwd) project = path.basename(cwd);
    const sessionId = str(entry.sessionId);
    if (sessionId) id = sessionId;

    if (entry.type === "system" && entry.subtype === "compact_boundary") {
      events.push({ kind: "compact", at });
      last = undefined;
      continue;
    }
    const message = isObject(entry.message) ? entry.message : undefined;
    if (!message) continue;

    if (entry.type === "assistant") {
      const msgId = str(message.id) ?? str(entry.uuid) ?? String(events.length);
      const usage = isObject(message.usage) ? message.usage : {};
      const contextTokens = num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
      if (!last || last.id !== msgId) {
        last = { kind: "assistant", id: msgId, text: "", toolUses: [], contextTokens: 0, at };
        events.push(last);
      }
      last.contextTokens = Math.max(last.contextTokens, contextTokens);
      for (const b of blocks(message.content)) {
        if (b.type === "text" && str(b.text)) last.text += (last.text ? "\n" : "") + str(b.text);
        if (b.type === "tool_use") last.toolUses.push({ id: str(b.id) ?? "", name: str(b.name) ?? "", input: b.input });
      }
      continue;
    }

    if (entry.type !== "user") continue;
    last = undefined;
    if (entry.isCompactSummary === true) {
      // Newer versions also write a compact_boundary line just before the summary.
      if (events.at(-1)?.kind !== "compact") events.push({ kind: "compact", at });
      continue;
    }
    const results = blocks(message.content).filter((b) => b.type === "tool_result");
    if (results.length > 0) {
      for (const r of results) {
        const text = textOf(r.content);
        if (REJECTED.test(text)) events.push({ kind: "interrupt", at });
        else events.push({ kind: "tool-result", toolUseId: str(r.tool_use_id) ?? "", isError: r.is_error === true, size: text.length, at });
      }
      continue;
    }
    if (entry.isMeta === true) continue;
    const text = textOf(message.content).trim();
    if (!text) continue;
    if (INTERRUPTED.test(text)) events.push({ kind: "interrupt", at });
    else if (!INJECTED.test(text)) events.push({ kind: "prompt", text, at });
  }
  return { id, file, project, ...(start ? { start } : {}), events };
}

export interface FindOptions {
  /** Only files changed within this many days; 0 means all. */
  days: number;
  /** Only projects whose folder name contains this. */
  project?: string;
  now?: number;
}

/** Every main-session transcript under `root`. Subagent transcripts are skipped. */
export async function findTranscripts(root: string, opts: FindOptions): Promise<string[]> {
  const now = opts.now ?? Date.now();
  const found: string[] = [];
  let projects: string[];
  try {
    projects = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
  for (const dir of projects.sort()) {
    if (opts.project && !dir.toLowerCase().includes(opts.project.toLowerCase())) continue;
    const names = await readdir(path.join(root, dir));
    for (const name of names.filter((n) => n.endsWith(".jsonl")).sort()) {
      const file = path.join(root, dir, name);
      if (opts.days > 0 && now - (await stat(file)).mtimeMs > opts.days * 86_400_000) continue;
      found.push(file);
    }
  }
  return found;
}

export async function loadSessions(root: string, opts: FindOptions): Promise<Session[]> {
  const sessions: Session[] = [];
  for (const file of await findTranscripts(root, opts)) {
    const session = parseTranscript(await readFile(file, "utf8"), file, path.basename(path.dirname(file)));
    if (session.events.some((e) => e.kind === "prompt")) sessions.push(session);
  }
  return sessions;
}
