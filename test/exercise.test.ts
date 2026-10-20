import assert from "node:assert/strict";
import { test } from "node:test";
import { loadExercises, parseExercise } from "../src/core/exercise.ts";
import { EXERCISES_DIR } from "./helpers.ts";

test("all bundled exercises load without errors", async () => {
  const { exercises, errors } = await loadExercises(EXERCISES_DIR);
  assert.deepEqual(errors, []);
  assert.deepEqual(
    exercises.map((e) => e.id),
    ["context-agents-md", "env-hook-block-rm", "evals-eval-discriminates", "prompt-extract-invoice"],
  );
});

const valid = `---
id: demo
title: Demo
skill: prompting
type: prompt
difficulty: 1
solution: system.md
cases:
  - name: one
    text: hi
    checks: [{ kind: regex, pattern: hi }]
references:
  - { label: good, dir: refs/good, expect: [70, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 40] }
---
Body text.`;

test("parses frontmatter, applies defaults and keeps the body", () => {
  const ex = parseExercise(valid, "/x");
  assert.equal(ex.model, "claude-haiku-5-5");
  assert.deepEqual(ex.weights, { checks: 0.5, judge: 0.5 });
  assert.equal(ex.body, "Body text.");
  assert.equal(ex.dir, "/x");
});

test("rejects unknown fields, bad skills and missing references", () => {
  assert.throws(() => parseExercise(valid.replace("difficulty: 1", "difficulty: 1\nextra: true"), "/x"));
  assert.throws(() => parseExercise(valid.replace("skill: prompting", "skill: cooking"), "/x"));
  assert.throws(() => parseExercise(valid.replace(/ {2}- \{ label: bad.*\n/, ""), "/x"), /good and one bad/);
  assert.throws(() => parseExercise("no frontmatter", "/x"), /frontmatter/);
});

test("env and eval exercises need their blocks", () => {
  assert.throws(() => parseExercise(valid.replace("type: prompt", "type: env"), "/x"), /env/);
  assert.throws(() => parseExercise(valid.replace("type: prompt", "type: eval"), "/x"), /eval/);
});

test("weights must sum to 1", () => {
  const src = valid.replace("solution: system.md", "solution: system.md\nweights: { checks: 0.7, judge: 0.7 }");
  assert.throws(() => parseExercise(src, "/x"), /sum to 1/);
});
