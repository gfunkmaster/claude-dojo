import assert from "node:assert/strict";
import { test } from "node:test";
import { parseExercise } from "../src/core/exercise.ts";
import { fillTemplate, RequestFileSchema } from "../src/runners/request.ts";
import { ToolsFileSchema } from "../src/runners/tools.ts";
import { EXERCISES_DIR } from "./helpers.ts";

const exercise = parseExercise(
  `---
id: demo
title: Demo
skill: api
type: request
difficulty: 1
solution: request.json
cases: [{ name: one, text: hi, checks: [{ kind: regex, pattern: hi }] }]
references:
  - { label: good, dir: refs/good, expect: [70, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 40] }
---
`,
  `${EXERCISES_DIR}/api/prompt-caching`,
);

test("templates fill input and files anywhere in the request", async () => {
  const filled = (await fillTemplate(
    { system: [{ type: "text", text: "{{file:docs/handbook.md}}" }], messages: [{ role: "user", content: "Q: {{input}} $1" }] },
    exercise,
    "semester?",
  )) as { system: { text: string }[]; messages: { content: string }[] };
  assert.match(filled.system[0]?.text ?? "", /^# Dojo personalhandbok/);
  assert.equal(filled.messages[0]?.content, "Q: semester? $1");
});

test("request files must use a priced model and a bounded max_tokens", () => {
  assert.ok(RequestFileSchema.safeParse({ model: "claude-haiku-5-5", max_tokens: 100 }).success);
  assert.equal(RequestFileSchema.safeParse({ model: "gpt-5", max_tokens: 100 }).success, false);
  assert.equal(RequestFileSchema.safeParse({ model: "claude-haiku-5-5", max_tokens: 64000 }).success, false);
  assert.equal(RequestFileSchema.safeParse({ model: "claude-haiku-5-5", max_tokens: 100, stream: true }).success, false);
});

test("tools files need named tools with object schemas", () => {
  assert.ok(ToolsFileSchema.safeParse({ tools: [{ name: "a", description: "b", input_schema: { type: "object" } }] }).success);
  assert.equal(ToolsFileSchema.safeParse({ tools: [] }).success, false);
  assert.equal(ToolsFileSchema.safeParse({ tools: [{ name: "a b", description: "", input_schema: { type: "object" } }] }).success, false);
});
