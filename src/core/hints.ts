import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Exercise, Reference } from "./exercise.ts";
import { listFiles } from "./files.ts";
import { SOLUTION_LEVEL, type HintLevel } from "./help.ts";
import type { RunResult } from "./result.ts";

/**
 * What `dojo hint` shows, built from the exercise's rubric, its reference answers
 * and your last run. No model calls: the same inputs always give the same hint.
 */

export interface HintFocus {
  id: string;
  text: string;
  weight: number;
  /** How your last run did on it; absent when the judge didn't grade it. */
  grade?: "partial" | "fail";
  /** Level 2: the judge's reasoning and tip from your last run. */
  reasoning?: string;
  tip?: string;
}

export interface HintFile {
  path: string;
  content: string;
}

export interface HintOutline {
  path: string;
  lines: number;
  /** Each line of the reference cut to its first few words: the shape and the ideas, not the wording. */
  skeleton: string[];
}

export interface HintSolution {
  files: HintFile[];
  /** Why it works: the exercise's own explanation, or the rubric it meets. */
  explanation: string[];
  /** The bad reference, to compare against. */
  contrast: HintFile[];
  expect: { good: [number, number]; bad: [number, number] | null };
}

export interface Hint {
  exerciseId: string;
  title: string;
  level: HintLevel;
  /** startedAt of the run the hint reads, or null before the first graded run. */
  basedOn: string | null;
  /** The judge didn't run last time (too few checks passed): fix the checks first. */
  judgeSkipped: boolean;
  /** Criteria to work on, most important first. */
  focus: HintFocus[];
  failedChecks: { case: string; check: string; detail: string }[];
  /** Level 2 and up. */
  nudges: string[];
  outline: HintOutline[];
  /** Level 3 only. */
  solution: HintSolution | null;
}

const MAX_FILE_CHARS = 20_000;

function reference(exercise: Exercise, label: Reference["label"]): Reference | undefined {
  return exercise.references.find((r) => r.label === label);
}

/** The files of a reference answer. A missing folder gives no files rather than an error. */
export async function referenceFiles(exercise: Exercise, label: Reference["label"]): Promise<HintFile[]> {
  const ref = reference(exercise, label);
  if (!ref) return [];
  const dir = path.join(exercise.dir, ref.dir);
  let names: string[];
  try {
    names = await listFiles(dir);
  } catch {
    return [];
  }
  const files: HintFile[] = [];
  for (const name of names) {
    const text = await readFile(path.join(dir, name), "utf8");
    files.push({ path: name.split(path.sep).join("/"), content: text.length > MAX_FILE_CHARS ? `${text.slice(0, MAX_FILE_CHARS)}\n…(truncated)` : text });
  }
  return files;
}

const SKELETON_WORDS = 4;
const SKELETON_LINES = 40;

function outlineOf(file: HintFile): HintOutline {
  const lines = file.content.replace(/\n$/, "").split("\n");
  const skeleton = lines
    .filter((l) => l.trim() !== "")
    .map((l) => {
      const indent = /^\s*/.exec(l)?.[0] ?? "";
      const words = l.trim().split(/\s+/);
      // Headings and fences are structure: keep them whole.
      if (/^(#{1,6}\s|```)/.test(l.trim()) || words.length <= SKELETON_WORDS) return l.trimEnd();
      return `${indent}${words.slice(0, SKELETON_WORDS).join(" ")} …`;
    });
  return {
    path: file.path,
    lines: lines.length,
    skeleton: skeleton.length > SKELETON_LINES ? [...skeleton.slice(0, SKELETON_LINES), "…"] : skeleton,
  };
}

function focusFor(exercise: Exercise, run: RunResult | undefined, level: HintLevel): { focus: HintFocus[]; judgeSkipped: boolean } {
  const byWeight = [...exercise.criteria].sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  if (!run || run.criteria.length === 0) {
    // Not graded yet, or the judge was skipped: everything the judge weighs, heaviest first.
    return { focus: byWeight.map((c) => ({ id: c.id, text: c.text, weight: c.weight })), judgeSkipped: run !== undefined && exercise.criteria.length > 0 };
  }
  const graded = new Map(run.criteria.map((c) => [c.id, c]));
  const missed = byWeight.flatMap((c) => {
    const g = graded.get(c.id);
    if (!g || g.grade === "pass") return [];
    const f: HintFocus = { id: c.id, text: c.text, weight: c.weight, grade: g.grade };
    if (level >= 2) {
      if (g.reasoning) f.reasoning = g.reasoning;
      if (g.tip) f.tip = g.tip;
    }
    return [f];
  });
  // Fails before partials; within each, the heavier criterion first (byWeight's order).
  missed.sort((a, b) => Number(b.grade === "fail") - Number(a.grade === "fail"));
  return { focus: missed, judgeSkipped: false };
}

/** The hint at `level` for this exercise, given your last graded run of it (if any). */
export async function buildHint(exercise: Exercise, level: HintLevel, lastRun?: RunResult): Promise<Hint> {
  const { focus, judgeSkipped } = focusFor(exercise, lastRun, level);
  const failedChecks = (lastRun?.cases ?? []).flatMap((c) =>
    c.checks.filter((ch) => !ch.passed).map((ch) => ({ case: c.name, check: ch.check, detail: ch.detail })),
  );
  const hint: Hint = {
    exerciseId: exercise.id,
    title: exercise.title,
    level,
    basedOn: lastRun?.startedAt ?? null,
    judgeSkipped,
    focus,
    failedChecks,
    nudges: [],
    outline: [],
    solution: null,
  };
  if (level < 2) return hint;

  const good = await referenceFiles(exercise, "good");
  hint.nudges = [...(exercise.hints ?? [])];
  if (exercise.playbook) hint.nudges.push(`The routine this trains, with a prompt template: dojo playbook ${exercise.playbook}`);
  hint.outline = good.map(outlineOf);
  if (level < SOLUTION_LEVEL) return hint;

  const goodRef = reference(exercise, "good");
  const badRef = reference(exercise, "bad");
  hint.solution = {
    files: good,
    explanation: exercise.explanation
      ? exercise.explanation.trim().split(/\n\s*\n/).map((p) => p.trim())
      : exercise.criteria.map((c) => `${c.id}: ${c.text}`),
    contrast: await referenceFiles(exercise, "bad"),
    expect: { good: goodRef?.expect ?? [0, 100], bad: badRef?.expect ?? null },
  };
  return hint;
}

const HEADINGS: Record<HintLevel, string> = {
  1: "Hint 1: what to focus on",
  2: "Hint 2: a stronger nudge",
  3: "The solution",
};

/** The hint as terminal lines. */
export function formatHint(hint: Hint): string[] {
  const out = [`${HEADINGS[hint.level]} — ${hint.title}`, ""];
  if (hint.basedOn === null) out.push("You haven't been graded yet, so this is what the judge weighs most.");
  else if (hint.judgeSkipped) out.push("The judge was skipped last time: too few checks passed. Fix the checks first, then these criteria count.");
  if (hint.failedChecks.length > 0 && !hint.solution) {
    out.push("Checks that failed last time:");
    for (const c of hint.failedChecks) out.push(`  ✗ ${c.case}: ${c.check}${c.detail ? ` — ${c.detail}` : ""}`);
    out.push("");
  }
  if (hint.focus.length > 0 && !hint.solution) {
    out.push(hint.basedOn !== null && !hint.judgeSkipped ? "Criteria you missed, most important first:" : "Criteria, most important first:");
    for (const f of hint.focus) {
      out.push(`  ${f.grade ? `${f.grade.padEnd(7)} ` : ""}${f.id} (weight ${f.weight}): ${f.text}`);
      if (f.reasoning) out.push(`          judge: ${f.reasoning}`);
      if (f.tip) out.push(`          tip: ${f.tip}`);
    }
  } else if (hint.basedOn !== null && hint.failedChecks.length === 0 && !hint.solution) {
    out.push("Your last run passed every criterion and check.");
  }
  if (hint.nudges.length > 0 && !hint.solution) {
    out.push("", "Nudges:");
    for (const n of hint.nudges) out.push(`  - ${n}`);
  }
  if (hint.outline.length > 0 && !hint.solution) {
    out.push("", "The reference solution, each line cut to its first words:");
    for (const o of hint.outline) {
      out.push(`  ${o.path} (${o.lines} lines)`);
      for (const line of o.skeleton) out.push(`    ${line}`);
    }
  }
  if (hint.solution) {
    const s = hint.solution;
    out.push("", `Reference solution (graded ${s.expect.good[0]}–${s.expect.good[1]}):`);
    for (const f of s.files) out.push("", `=== ${f.path} ===`, f.content.trimEnd());
    out.push("", "Why it works:");
    for (const e of s.explanation) out.push(`  - ${e}`);
    if (s.contrast.length > 0) {
      out.push("", `For contrast, the bad reference${s.expect.bad ? ` (graded ${s.expect.bad[0]}–${s.expect.bad[1]})` : ""}:`);
      for (const f of s.contrast) out.push("", `=== ${f.path} ===`, f.content.trimEnd());
    }
  }
  return out;
}
