import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_ANALYZE_MODEL, buildEvidence, draftExercise, summarizePatterns, writeDraft } from "../analyze/generate.ts";
import { PATTERN_INFO, analyze } from "../analyze/patterns.ts";
import { defaultProjectsDir, loadSessions } from "../analyze/transcript.ts";
import { levelName } from "../core/curriculum.ts";
import { loadExercises, type Exercise } from "../core/exercise.ts";
import { ClaudeCliLlmClient } from "../llm/claude-cli-client.ts";
import { exerciseRoots, table, type CliContext } from "./context.ts";

export interface AnalyzeOptions {
  dir?: string;
  days: number;
  project?: string;
  generate: boolean;
  max: number;
}

/** Bundled exercises shown to the model as format examples, one per generated type. */
const EXAMPLE_IDS = ["prompt-extract-invoice", "context-agents-md", "evals-first-eval"];
const EXAMPLES_PER_KIND = 3;

export async function analyzeCommand(ctx: CliContext, opts: AnalyzeOptions): Promise<number> {
  const dir = opts.dir ?? defaultProjectsDir();
  const sessions = await loadSessions(dir, { days: opts.days, ...(opts.project ? { project: opts.project } : {}) });
  const window = opts.days > 0 ? `from the last ${opts.days} days` : "from all time";
  if (sessions.length === 0) {
    ctx.out(`No Claude Code sessions ${window} in ${dir}.`);
    return 0;
  }
  const analysis = analyze(sessions);
  ctx.out(`Analysed ${analysis.sessions} sessions (${analysis.prompts} prompts) in ${analysis.projects.length} projects ${window}.`);
  if (analysis.summary.length === 0) {
    ctx.out("No patterns found. Nice.");
    return 0;
  }

  const rows = [["PATTERN", "FINDINGS", "SESSIONS", "TRAINS"]];
  for (const s of analysis.summary) rows.push([s.kind, String(s.count), String(s.sessions), PATTERN_INFO[s.kind].skills.join(", ")]);
  ctx.out(`\n${table(rows)}\n\nExamples (redacted):`);
  for (const s of analysis.summary) {
    for (const f of analysis.findings.filter((x) => x.kind === s.kind).slice(0, EXAMPLES_PER_KIND)) {
      ctx.out(`  ${s.kind.padEnd(13)} ${f.project}  ${f.at?.slice(0, 10) ?? ""}  ${f.detail}`);
    }
  }

  if (!opts.generate) {
    ctx.out("\nNothing has left your machine. `dojo analyze --generate` has your local `claude -p` summarise these patterns and draft personal exercises.");
    return 0;
  }

  // Transcript excerpts only ever go to your own `claude -p`, whatever DOJO_BACKEND says.
  const llm = new ClaudeCliLlmClient(ctx.claude());
  ctx.out(`\nSummarising the patterns with claude -p (${DEFAULT_ANALYZE_MODEL})…`);
  const summary = await summarizePatterns(llm, analysis);
  ctx.out(summary.overview);
  summary.patterns.forEach((p, i) => ctx.out(`  ${i + 1}. ${p.title} (${p.skill}, ${levelName(p.difficulty)}): ${p.summary}`));

  const { exercises } = await loadExercises(exerciseRoots(ctx));
  const taken = new Set(exercises.map((e) => e.id));
  const examples = await formatExamples(exercises.filter((e) => EXAMPLE_IDS.includes(e.id)));
  const today = new Date().toISOString().slice(0, 10);
  const written: string[] = [];
  const todo = summary.patterns.slice(0, opts.max);
  for (const [i, pattern] of todo.entries()) {
    ctx.out(`Drafting exercise ${i + 1}/${todo.length}: ${pattern.title}…`);
    try {
      const draft = await draftExercise(
        llm,
        { pattern, evidence: buildEvidence(analysis, [pattern.kind]), examples },
        { taken, source: `dojo analyze ${today}: ${pattern.kind}`, dir: (id) => path.join(ctx.generatedDir, id) },
      );
      const out = await writeDraft(ctx.generatedDir, draft);
      taken.add(draft.id);
      written.push(draft.id);
      ctx.out(`  wrote ${out}`);
    } catch (err) {
      ctx.out(`  skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  if (written.length === 0) return 1;
  ctx.out("\nGenerated exercises are drafts. Check each one before you train on it:");
  for (const id of written) ctx.out(`  dojo run ${id} --calibrate   then   dojo run ${id}`);
  return 0;
}

async function formatExamples(exercises: Exercise[]): Promise<string[]> {
  return Promise.all(
    exercises.map(async (e) => {
      const md = await readFile(path.join(e.dir, "exercise.md"), "utf8");
      const good = await readFile(path.join(e.dir, "refs/good", e.solution), "utf8").catch(() => "");
      return `<example id="${e.id}">\n<file path="exercise.md">\n${md}</file>\n<file path="refs/good/${e.solution}">\n${good}</file>\n</example>`;
    }),
  );
}
