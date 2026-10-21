import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { parseExercise, SKILLS, type Exercise } from "../core/exercise.ts";
import type { LlmClient } from "../llm/client.ts";
import { PATTERN_INFO, PATTERN_KINDS, type Analysis, type PatternKind } from "./patterns.ts";
import { redact } from "./redact.ts";

export const DEFAULT_ANALYZE_MODEL = process.env.DOJO_ANALYZE_MODEL ?? "claude-opus-5-5";

/** Generated exercises must run on a subscription, so no raw Messages API types. */
export const GENERATED_TYPES = ["prompt", "env", "eval"] as const;

/** Caps on what is sent to the model, so a long history never turns into a huge prompt. */
const EXCERPTS_PER_KIND = 5;
const MAX_EVIDENCE_CHARS = 24_000;

export const PatternSummarySchema = z.object({
  overview: z.string(),
  patterns: z.array(
    z.object({
      kind: z.enum(PATTERN_KINDS),
      title: z.string(),
      summary: z.string(),
      skill: z.enum(SKILLS),
      difficulty: z.number().int().min(1).max(3),
      exerciseIdea: z.string(),
    }),
  ),
});
export type PatternSummary = z.infer<typeof PatternSummarySchema>;
export type SummarizedPattern = PatternSummary["patterns"][number];

export const DraftSchema = z.object({
  slug: z.string(),
  files: z.array(z.object({ path: z.string(), content: z.string() })),
});
export type Draft = z.infer<typeof DraftSchema>;

/** The redacted excerpts, grouped by pattern, that the model gets to see. */
export function buildEvidence(analysis: Analysis, kinds: readonly PatternKind[] = PATTERN_KINDS): string {
  let out = "";
  for (const s of analysis.summary.filter((p) => kinds.includes(p.kind))) {
    const section = [`## ${s.kind}: ${PATTERN_INFO[s.kind].label} (${s.count} times in ${s.sessions} sessions)`];
    for (const f of analysis.findings.filter((x) => x.kind === s.kind).slice(0, EXCERPTS_PER_KIND)) {
      section.push(`### ${f.project}${f.at ? `, ${f.at.slice(0, 10)}` : ""}\n${f.excerpt}`);
    }
    const text = `${section.join("\n\n")}\n\n`;
    if (out.length + text.length > MAX_EVIDENCE_CHARS) break;
    out += text;
  }
  return redact(out.trim());
}

const SUMMARY_SYSTEM = `You coach a developer who wants to become an expert user of Claude: prompting, context files (AGENTS.md, CLAUDE.md, memory, skills), tools and MCP, agents and subagents, the Claude Code environment (hooks, permissions, headless mode), the API, and evals.

You get patterns that heuristics found in their own Claude Code sessions, with short redacted excerpts. Find what the developer could have done differently so Claude got it right the first time: a clearer prompt, a rule in AGENTS.md, a hook, a subagent, a test to run, and so on. Ignore findings that are noise (a heuristic that misfired).

Write titles, summaries and exercise ideas in Swedish. For each real pattern, pick the one skill that would have prevented it most directly, and a difficulty: 1 nybörjare, 2 avancerad, 3 elit. Order patterns by how much they cost the developer. Never repeat secrets, names or personal details from the excerpts.`;

export async function summarizePatterns(llm: LlmClient, analysis: Analysis, model = DEFAULT_ANALYZE_MODEL): Promise<PatternSummary> {
  const user = `Sessions analysed: ${analysis.sessions}, prompts: ${analysis.prompts}.\n\n${buildEvidence(analysis)}`;
  const res = await llm.structured({ model, system: SUMMARY_SYSTEM, user, schema: PatternSummarySchema });
  return res.value;
}

const DRAFT_SYSTEM = `You write exercises for Claude Dojo, a CLI that grades exercises about using Claude well. You turn a pattern from the developer's own Claude Code sessions into one exercise that trains the habit that would have prevented it.

An exercise is a set of files, returned as {"slug", "files": [{"path", "content"}]} with paths relative to the exercise folder:
- exercise.md: YAML frontmatter, then the task text in markdown.
- starter/<solution>: what the developer starts from (usually a stub with TODOs).
- refs/good/<solution>: a solution that should score 75 or more.
- refs/bad/<solution>: a plausible but weak solution that should score below 50.
- Any inputs, fixture repo files or eval variants the frontmatter points to.

Rules:
- type is one of: ${GENERATED_TYPES.join(", ")}. Never tools or request.
- prompt: the solution is a system prompt; each case sends \`text:\` or \`input:\` (a file) as the user message and checks the reply.
- env: a fixture repo (a folder inside the exercise, e.g. fixture/) plus the solution files are copied into a sandbox, and \`claude -p\` runs each case's \`task:\` there. Checks look at files and commands. Keep the fixture tiny, plain Node with no dependencies. Fixture paths must stay inside the exercise folder.
- eval: the solution file holds \`cases:\`; it is run against variants listed under eval.variants.
- Leave out \`id\` and \`source\`; Dojo sets them.
- Checks must be deterministic and must separate refs/good from refs/bad. Criteria are for the LLM judge; give each one observable thing to judge.
- Score = 50% share of checks passed + 50% judge. refs/bad must land below 50, so it has to fail most checks, not just be shorter. In env exercises Claude is capable on its own, so a weak solution file often still gets the task done: add checks that only pass when the habit is in place (file-contains on the solution file itself, a check that a rule was followed, max-turns), and make refs/bad miss the key rule entirely.
- Write exercise text, criteria and case names in Swedish. Code and code comments in English.
- Use the excerpts only for inspiration. Never copy secrets, names, company details, paths or code from them; invent neutral example content.

Examples of real exercises follow. Match their format exactly.`;

export interface DraftRequest {
  pattern: SummarizedPattern;
  evidence: string;
  /** exercise.md and solution files of existing exercises, as format examples. */
  examples: string[];
  model?: string;
}

function draftPrompt(req: DraftRequest): string {
  const p = req.pattern;
  return [
    `Pattern: ${p.title} (${p.kind})`,
    `What happened: ${p.summary}`,
    `Exercise idea: ${p.exerciseIdea}`,
    `Skill: ${p.skill}. Difficulty: ${p.difficulty}.`,
    `Excerpts from the sessions (redacted):\n${req.evidence}`,
  ].join("\n\n");
}

export interface ValidatedDraft {
  id: string;
  exercise: Exercise;
  files: { path: string; content: string }[];
}

const SAFE_PATH = /^(?!\/)(?!.*(^|\/)\.\.(\/|$))[\w.@ -]+(\/[\w.@ -]+)*$/;
const MAX_FILES = 40;
const MAX_FILE_CHARS = 50_000;

/** Checks a drafted exercise and rewrites its frontmatter with Dojo's id and source. Throws a readable error. */
export function validateDraft(draft: Draft, id: string, source: string, dir: string): ValidatedDraft {
  if (draft.files.length === 0 || draft.files.length > MAX_FILES) throw new Error(`expected 1 to ${MAX_FILES} files, got ${draft.files.length}`);
  const files = new Map<string, string>();
  for (const f of draft.files) {
    const p = f.path.replace(/^\.\//, "");
    if (!SAFE_PATH.test(p)) throw new Error(`unsafe file path: ${f.path}`);
    if (f.content.length > MAX_FILE_CHARS) throw new Error(`${p} is too long`);
    files.set(p, redact(f.content));
  }
  const md = files.get("exercise.md");
  if (md === undefined) throw new Error("exercise.md is missing");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!match) throw new Error("exercise.md has no YAML frontmatter");
  const fm: unknown = parseYaml(match[1] ?? "");
  if (typeof fm !== "object" || fm === null) throw new Error("the frontmatter is not a YAML object");
  const rewritten = `---\n${stringifyYaml({ id, ...fm, source })}---\n\n${(match[2] ?? "").trim()}\n`;
  const exercise = parseExercise(rewritten, dir);
  files.set("exercise.md", rewritten);

  if (!(GENERATED_TYPES as readonly string[]).includes(exercise.type)) throw new Error(`type must be one of ${GENERATED_TYPES.join(", ")}, not ${exercise.type}`);
  const has = (p: string) => files.has(path.posix.normalize(p));
  const hasDir = (p: string) => {
    const prefix = `${path.posix.normalize(p).replace(/\/$/, "")}/`;
    return [...files.keys()].some((f) => f.startsWith(prefix));
  };
  const missing: string[] = [];
  if (!has(`starter/${exercise.solution}`)) missing.push(`starter/${exercise.solution}`);
  for (const r of exercise.references) if (!has(`${r.dir}/${exercise.solution}`)) missing.push(`${r.dir}/${exercise.solution}`);
  for (const c of exercise.cases) if (c.input !== undefined && !has(c.input)) missing.push(c.input);
  if (exercise.env) {
    for (const fixture of [exercise.env.fixture].flat()) {
      if (!SAFE_PATH.test(fixture)) throw new Error(`fixture must be a folder inside the exercise: ${fixture}`);
      if (!hasDir(fixture)) missing.push(`${fixture}/`);
    }
  }
  for (const v of exercise.eval?.variants ?? []) if (!has(v.file)) missing.push(v.file);
  if (missing.length > 0) throw new Error(`files the frontmatter points to are missing: ${missing.join(", ")}`);
  return { id, exercise, files: [...files].map(([p, content]) => ({ path: p, content })) };
}

export function exerciseId(slug: string, taken: Set<string>): string {
  const base = `my-${slug.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^my-/, "").slice(0, 50) || "exercise"}`;
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Drafts one exercise; an invalid draft is sent back once with the error. */
export async function draftExercise(
  llm: LlmClient,
  req: DraftRequest,
  opts: { taken: Set<string>; source: string; dir: (id: string) => string },
): Promise<ValidatedDraft> {
  const system = `${DRAFT_SYSTEM}\n\n${req.examples.join("\n\n")}`;
  let user = draftPrompt(req);
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const { value } = await llm.structured({ model: req.model ?? DEFAULT_ANALYZE_MODEL, system, user, schema: DraftSchema });
    const id = exerciseId(value.slug, opts.taken);
    try {
      return validateDraft(value, id, opts.source, opts.dir(id));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      user = `${draftPrompt(req)}\n\nYour previous draft was invalid: ${lastError}\nReturn the whole exercise again, fixed.`;
    }
  }
  throw new Error(`the drafted exercise was invalid twice: ${lastError}`);
}

export async function writeDraft(root: string, draft: ValidatedDraft): Promise<string> {
  const dir = path.join(root, draft.id);
  for (const f of draft.files) {
    const file = path.join(dir, f.path);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, f.content, { flag: "wx" });
  }
  return dir;
}
