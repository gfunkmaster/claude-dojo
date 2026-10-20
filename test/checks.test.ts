import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { getPath, parseJson, runCheck } from "../src/checks/index.ts";
import { tempDir } from "./helpers.ts";

test("json checks accept bare and fenced JSON", () => {
  assert.equal(runCheck({ kind: "json-valid" }, { output: '{"a":1}' }).passed, true);
  assert.equal(runCheck({ kind: "json-valid" }, { output: '```json\n{"a":1}\n```' }).passed, true);
  assert.equal(runCheck({ kind: "json-valid" }, { output: "nope" }).passed, false);
  assert.equal(parseJson(undefined).ok, false);
});

test("json-path compares values and tells null from missing", () => {
  const output = '{"a":{"b":[1,{"c":null}]},"n":2.5}';
  assert.equal(getPath(JSON.parse(output), "$.a.b[1].c"), null);
  assert.equal(runCheck({ kind: "json-path", path: "$.n", equals: 2.5 }, { output }).passed, true);
  assert.equal(runCheck({ kind: "json-path", path: "$.a.b[1].c", equals: null }, { output }).passed, true);
  const missing = runCheck({ kind: "json-path", path: "$.zzz", equals: null }, { output });
  assert.equal(missing.passed, false);
});

test("regex supports flags and negate", () => {
  assert.equal(runCheck({ kind: "regex", pattern: "^bug$", negate: false }, { output: "bug" }).passed, true);
  assert.equal(runCheck({ kind: "regex", pattern: "BUG", flags: "i", negate: false }, { output: "bug" }).passed, true);
  assert.equal(runCheck({ kind: "regex", pattern: "bug", negate: true }, { output: "bug" }).passed, false);
});

test("file and command checks run in the sandbox", async () => {
  const cwd = await tempDir();
  mkdirSync(path.join(cwd, "a"));
  writeFileSync(path.join(cwd, "a/f.txt"), "hello world");
  assert.equal(runCheck({ kind: "file-exists", path: "a/f.txt", negate: false }, { cwd }).passed, true);
  assert.equal(runCheck({ kind: "file-exists", path: "nope", negate: true }, { cwd }).passed, true);
  assert.equal(runCheck({ kind: "file-contains", path: "a/f.txt", pattern: "wor", negate: false }, { cwd }).passed, true);
  assert.equal(runCheck({ kind: "command", run: "test -f a/f.txt", exitCode: 0 }, { cwd }).passed, true);
  const failing = runCheck({ kind: "command", run: "exit 3", exitCode: 0 }, { cwd });
  assert.equal(failing.passed, false);
  assert.match(failing.detail, /exit 3/);
  assert.throws(() => runCheck({ kind: "file-exists", path: "x", negate: false }, {}), /sandbox/);
});

test("turn and cost limits", () => {
  assert.equal(runCheck({ kind: "max-turns", value: 5 }, { turns: 5 }).passed, true);
  assert.equal(runCheck({ kind: "max-turns", value: 5 }, { turns: 6 }).passed, false);
  assert.equal(runCheck({ kind: "max-cost", usd: 0.1 }, { costUsd: 0.2 }).passed, false);
});

test("file-contains can be negated and treats a missing file as not matching", async () => {
  const cwd = await tempDir();
  writeFileSync(path.join(cwd, "log"), "Read\t.env\n");
  assert.equal(runCheck({ kind: "file-contains", path: "log", pattern: "\\.env", negate: true }, { cwd }).passed, false);
  assert.equal(runCheck({ kind: "file-contains", path: "missing", pattern: "x", negate: true }, { cwd }).passed, true);
  assert.equal(runCheck({ kind: "file-contains", path: "missing", pattern: "x", negate: false }, { cwd }).passed, false);
});

test("min-cache-read looks at the case's cache reads", () => {
  assert.equal(runCheck({ kind: "min-cache-read", tokens: 1000 }, { cacheReadTokens: 4000 }).passed, true);
  assert.equal(runCheck({ kind: "min-cache-read", tokens: 1000 }, {}).passed, false);
});

test("command checks do not inherit the test runner's context", async () => {
  const cwd = await tempDir();
  const res = runCheck({ kind: "command", run: 'test -z "$NODE_TEST_CONTEXT"', exitCode: 0 }, { cwd });
  assert.equal(res.passed, true);
});
