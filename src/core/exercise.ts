import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const SKILLS = ["prompting", "context", "tools", "agents", "env", "api", "evals"] as const;
export type Skill = (typeof SKILLS)[number];

export const EXERCISE_TYPES = ["prompt", "env", "eval", "tools", "request"] as const;

/** difficulty 1..3 */
export const LEVELS = ["nybörjare", "avancerad", "elit"] as const;

export const CheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("json-valid") }),
  z.object({ kind: z.literal("json-path"), path: z.string(), equals: z.unknown() }),
  z.object({
    kind: z.literal("regex"),
    pattern: z.string(),
    flags: z.string().optional(),
    negate: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("command"), run: z.string(), exitCode: z.number().int().default(0) }),
  z.object({ kind: z.literal("file-exists"), path: z.string(), negate: z.boolean().default(false) }),
  z.object({
    kind: z.literal("file-contains"),
    path: z.string(),
    pattern: z.string(),
    negate: z.boolean().default(false),
  }),
  z.object({ kind: z.literal("min-cache-read"), tokens: z.number().int().positive() }),
  z.object({ kind: z.literal("max-turns"), value: z.number().int().positive() }),
  z.object({ kind: z.literal("max-cost"), usd: z.number().positive() }),
]);
export type Check = z.infer<typeof CheckSchema>;

export const CaseSchema = z
  .object({
    name: z.string(),
    /** Prompt cases: user message, inline or as a file relative to the exercise folder. */
    text: z.string().optional(),
    input: z.string().optional(),
    /** Env cases: the task given to `claude -p`. */
    task: z.string().optional(),
    checks: z.array(CheckSchema).min(1),
  })
  .strict();
export type Case = z.infer<typeof CaseSchema>;

export const CriterionSchema = z.object({
  id: z.string(),
  text: z.string(),
  weight: z.number().positive().default(1),
});
export type Criterion = z.infer<typeof CriterionSchema>;

export const ReferenceSchema = z.object({
  label: z.enum(["good", "bad"]),
  /** Folder (relative to the exercise) laid out like a workspace solution. */
  dir: z.string(),
  expect: z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)]),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export const FrontmatterSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string(),
    skill: z.enum(SKILLS),
    type: z.enum(EXERCISE_TYPES),
    difficulty: z.number().int().min(1).max(3),
    /** Model that runs the solution (prompt and eval exercises). */
    model: z.string().default("claude-haiku-5-5"),
    /** File in the workspace that holds the solution prompt or eval. */
    solution: z.string(),
    cases: z.array(CaseSchema).default([]),
    criteria: z.array(CriterionSchema).default([]),
    references: z.array(ReferenceSchema).min(2),
    weights: z
      .object({ checks: z.number().min(0).max(1), judge: z.number().min(0).max(1) })
      .refine((w) => Math.abs(w.checks + w.judge - 1) < 1e-9, "weights must sum to 1")
      .default({ checks: 0.5, judge: 0.5 }),
    env: z
      .object({
        /** One folder, or several copied in order (later ones win). */
        fixture: z.union([z.string(), z.array(z.string())]).default("fixture"),
        maxTurns: z.number().int().positive().default(20),
        maxCostUsd: z.number().positive().default(1),
        allowedTools: z.array(z.string()).default([]),
      })
      .optional(),
    eval: z
      .object({
        variants: z.array(z.object({ file: z.string(), shouldPass: z.boolean() })).min(2),
      })
      .optional(),
    /** Phase 2: where a generated exercise came from (e.g. a transcript path). */
    source: z.string().optional(),
  })
  .strict()
  .superRefine((fm, ctx) => {
    if (fm.type === "env" && !fm.env) ctx.addIssue({ code: "custom", message: "env exercises need an `env` block" });
    if (fm.type === "eval" && !fm.eval) ctx.addIssue({ code: "custom", message: "eval exercises need an `eval` block" });
    if (fm.type !== "eval" && fm.cases.length === 0) ctx.addIssue({ code: "custom", message: "at least one case is required" });
    if (!fm.references.some((r) => r.label === "good") || !fm.references.some((r) => r.label === "bad")) {
      ctx.addIssue({ code: "custom", message: "references need at least one good and one bad answer" });
    }
  });
export type Frontmatter = z.infer<typeof FrontmatterSchema>;

export interface Exercise extends Frontmatter {
  /** Absolute folder of the exercise; relative paths in the frontmatter resolve against it. */
  dir: string;
  /** The markdown body: the task you read. */
  body: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseExercise(source: string, dir: string): Exercise {
  const match = FRONTMATTER.exec(source);
  if (!match) throw new Error("missing YAML frontmatter");
  const fm = FrontmatterSchema.parse(parseYaml(match[1] ?? ""));
  return { ...fm, dir, body: (match[2] ?? "").trim() };
}

export async function loadExercise(file: string): Promise<Exercise> {
  const source = await readFile(file, "utf8");
  try {
    return parseExercise(source, path.dirname(path.resolve(file)));
  } catch (err) {
    throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
}

export interface LoadResult {
  exercises: Exercise[];
  errors: string[];
}

/** Finds every `exercise.md` under `root`. Invalid exercises are reported, not thrown. */
export async function loadExercises(root: string): Promise<LoadResult> {
  const files = await findExerciseFiles(root);
  const exercises: Exercise[] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      exercises.push(await loadExercise(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  const seen = new Set<string>();
  for (const ex of exercises) {
    if (seen.has(ex.id)) errors.push(`duplicate exercise id: ${ex.id}`);
    seen.add(ex.id);
  }
  exercises.sort((a, b) => a.id.localeCompare(b.id));
  return { exercises, errors };
}

async function findExerciseFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Assets inside an exercise folder are never exercises themselves.
      if (await isFile(path.join(full, "exercise.md"))) found.push(path.join(full, "exercise.md"));
      else found.push(...(await findExerciseFiles(full)));
    }
  }
  return found;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

export async function caseInput(exercise: Exercise, c: Case): Promise<string> {
  if (c.text !== undefined) return c.text;
  if (c.input !== undefined) return readFile(path.join(exercise.dir, c.input), "utf8");
  throw new Error(`case ${c.name} has neither text nor input`);
}
