import type { Skill } from "../core/exercise.ts";
import { redact } from "./redact.ts";
import type { Session, TranscriptEvent } from "./transcript.ts";

/**
 * Deterministic heuristics over a session. They are cheap, run locally and
 * decide what is worth showing to a model at all; the model only summarises.
 */
export const PATTERN_KINDS = ["correction", "repeat", "interrupt", "retry-loop", "rework", "context-bloat"] as const;
export type PatternKind = (typeof PATTERN_KINDS)[number];

export const PATTERN_INFO: Record<PatternKind, { label: string; skills: Skill[] }> = {
  correction: { label: "you corrected Claude", skills: ["prompting", "context"] },
  repeat: { label: "you repeated a request", skills: ["context", "prompting"] },
  interrupt: { label: "you stopped Claude or rejected a tool call", skills: ["env", "prompting"] },
  "retry-loop": { label: "Claude retried failing tool calls", skills: ["env", "tools"] },
  rework: { label: "the same file was edited over and over", skills: ["evals", "prompting"] },
  "context-bloat": { label: "the context grew huge or was compacted", skills: ["context", "agents"] },
};

export interface Finding {
  kind: PatternKind;
  sessionId: string;
  file: string;
  project: string;
  at?: string;
  /** One line, for the report. */
  detail: string;
  /** Redacted text around the finding: the only transcript content that leaves this module. */
  excerpt: string;
}

export interface Thresholds {
  /** Token overlap (Jaccard) at which two prompts count as the same request. */
  repeatSimilarity: number;
  /** Consecutive failing tool calls that count as a retry loop. */
  errorStreak: number;
  /** Edits of one file in one session that count as rework. */
  reworkEdits: number;
  /** Context size, in tokens, that counts as bloat. */
  contextTokens: number;
  /** A single tool result this many characters long counts as bloat. */
  toolResultChars: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  repeatSimilarity: 0.6,
  errorStreak: 3,
  reworkEdits: 6,
  contextTokens: 150_000,
  toolResultChars: 50_000,
};

/** Words that are a correction when a prompt opens with them, in Swedish and English. */
const CORRECTION_OPENER = /^\W*(nej|nope|no|fel|wrong|sluta|stop|inte så|that'?s not|det var inte|hm+,? nej)(?![\p{L}])/iu;
/** Phrases that are a correction anywhere near the start of a prompt. */
const CORRECTION_PHRASE =
  /(^|[^\p{L}])(jag sa|jag bad dig|som sagt|du glömde|du missade|varför (gjorde|har) du|gör om|ångra|återställ|(funkar|fungerar) (fortfarande )?inte|inte det jag|not what i|i said|i asked you|as i said|you forgot|you missed|why did you|undo (that|this|it)|revert (that|this|it)|(doesn'?t|didn'?t|still doesn'?t) work|still (fails|failing|broken|wrong)|try again)(?![\p{L}])/iu;

export function isCorrection(prompt: string): boolean {
  const head = prompt.slice(0, 300);
  return CORRECTION_OPENER.test(head) || CORRECTION_PHRASE.test(head);
}

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);

const clip = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max)}…`);
const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}_]{3,}/gu) ?? []);
}

export function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared++;
  return shared / (wa.size + wb.size - shared);
}

function previousAssistant(events: TranscriptEvent[], index: number): Extract<TranscriptEvent, { kind: "assistant" }> | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const e = events[i];
    if (e?.kind === "assistant" && (e.text || e.toolUses.length > 0)) return e;
    if (e?.kind === "prompt") return undefined;
  }
  return undefined;
}

function nextPrompt(events: TranscriptEvent[], index: number): string | undefined {
  for (let i = index + 1; i < events.length; i++) {
    const e = events[i];
    if (e?.kind === "prompt") return e.text;
  }
  return undefined;
}

function describeTool(name: string, input: unknown): string {
  const i = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const arg = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.url ?? i.description;
  return typeof arg === "string" ? `${name}(${clip(oneLine(arg), 120)})` : name;
}

function claudeSaid(a: Extract<TranscriptEvent, { kind: "assistant" }> | undefined): string {
  if (!a) return "";
  const tools = a.toolUses.map((t) => describeTool(t.name, t.input)).join(", ");
  const text = a.text ? clip(oneLine(a.text), 400) : "";
  return `Claude: ${[text, tools && `[${tools}]`].filter(Boolean).join(" ")}`;
}

export function detectPatterns(session: Session, t: Thresholds = DEFAULT_THRESHOLDS): Finding[] {
  const findings: Finding[] = [];
  const { events } = session;
  const add = (kind: PatternKind, at: string | undefined, detail: string, excerpt: string) =>
    findings.push({
      kind,
      sessionId: session.id,
      file: session.file,
      project: session.project,
      ...(at ? { at } : {}),
      detail: redact(detail),
      excerpt: redact(excerpt),
    });

  const prompts: string[] = [];
  const toolsById = new Map<string, { name: string; input: unknown }>();
  const edits = new Map<string, number>();
  let streak: string[] = [];
  let streakAt: string | undefined;
  let peakContext = 0;
  let compactions = 0;
  let biggestResult = 0;

  const endStreak = () => {
    if (streak.length >= t.errorStreak) {
      add("retry-loop", streakAt, `${streak.length} failing tool calls in a row`, `Failing calls, in order:\n${streak.map((s) => `- ${s}`).join("\n")}`);
    }
    streak = [];
  };

  events.forEach((e, i) => {
    switch (e.kind) {
      case "prompt": {
        const before = previousAssistant(events, i);
        if (before && isCorrection(e.text)) {
          add("correction", e.at, clip(oneLine(e.text), 100), `${claudeSaid(before)}\nYou: ${clip(e.text, 600)}`);
        } else if (words(e.text).size >= 5) {
          const earlier = prompts.find((p) => similarity(p, e.text) >= t.repeatSimilarity);
          if (earlier) add("repeat", e.at, clip(oneLine(e.text), 100), `Earlier: ${clip(earlier, 400)}\nAgain: ${clip(e.text, 400)}`);
        }
        prompts.push(e.text);
        break;
      }
      case "interrupt": {
        const after = nextPrompt(events, i);
        add(
          "interrupt",
          e.at,
          after ? clip(oneLine(after), 100) : "stopped without a follow-up",
          `${claudeSaid(previousAssistant(events, i))}\n[you stopped Claude]${after ? `\nYou: ${clip(after, 600)}` : ""}`,
        );
        break;
      }
      case "assistant":
        peakContext = Math.max(peakContext, e.contextTokens);
        for (const tool of e.toolUses) {
          toolsById.set(tool.id, tool);
          const target = (tool.input as { file_path?: unknown; notebook_path?: unknown } | null)?.file_path ?? (tool.input as { notebook_path?: unknown } | null)?.notebook_path;
          if (EDIT_TOOLS.has(tool.name) && typeof target === "string") edits.set(target, (edits.get(target) ?? 0) + 1);
        }
        break;
      case "tool-result": {
        biggestResult = Math.max(biggestResult, e.size);
        if (e.isError) {
          const tool = toolsById.get(e.toolUseId);
          if (streak.length === 0) streakAt = e.at;
          streak.push(tool ? describeTool(tool.name, tool.input) : "unknown tool");
        } else endStreak();
        break;
      }
      case "compact":
        compactions++;
        break;
    }
  });
  endStreak();

  for (const [file, count] of edits) {
    if (count >= t.reworkEdits) add("rework", session.start, `${file} edited ${count} times`, `${file} was edited ${count} times in one session.\nFirst prompt: ${clip(prompts[0] ?? "", 400)}`);
  }
  const bloat: string[] = [];
  if (peakContext >= t.contextTokens) bloat.push(`context peaked at ${Math.round(peakContext / 1000)}k tokens`);
  if (compactions > 0) bloat.push(`compacted ${compactions} time${compactions === 1 ? "" : "s"}`);
  if (biggestResult >= t.toolResultChars) bloat.push(`one tool result was ${Math.round(biggestResult / 1000)}k characters`);
  if (bloat.length > 0) {
    add("context-bloat", session.start, bloat.join(", "), `${bloat.join(", ")} after ${prompts.length} prompts.\nFirst prompt: ${clip(prompts[0] ?? "", 400)}`);
  }
  return findings;
}

export interface PatternSummary {
  kind: PatternKind;
  count: number;
  sessions: number;
}

export interface Analysis {
  sessions: number;
  prompts: number;
  projects: string[];
  findings: Finding[];
  /** Most frequent first; kinds with no findings are left out. */
  summary: PatternSummary[];
}

export function analyze(sessions: Session[], t: Thresholds = DEFAULT_THRESHOLDS): Analysis {
  const findings = sessions.flatMap((s) => detectPatterns(s, t));
  const summary = PATTERN_KINDS.map((kind) => {
    const of = findings.filter((f) => f.kind === kind);
    return { kind, count: of.length, sessions: new Set(of.map((f) => f.file)).size };
  })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.sessions - a.sessions || b.count - a.count);
  return {
    sessions: sessions.length,
    prompts: sessions.reduce((n, s) => n + s.events.filter((e) => e.kind === "prompt").length, 0),
    projects: [...new Set(sessions.map((s) => s.project))].sort(),
    findings,
    summary,
  };
}
