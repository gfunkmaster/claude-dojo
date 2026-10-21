import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ZERO_USAGE } from "../src/core/pricing.ts";
import { ClaudeCliLlmClient, extractJson } from "../src/llm/claude-cli-client.ts";
import { askArgs, parseClaudeJson, RealClaudeCli, type ClaudeAskResult, type ClaudeCli } from "../src/llm/claude-cli.ts";
import { tempDir } from "./helpers.ts";

test("parses claude -p --output-format json", () => {
  const out = parseClaudeJson(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      num_turns: 6,
      result: "Added the endpoint.",
      total_cost_usd: 0.1234,
      usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 5000, cache_creation_input_tokens: 800 },
      modelUsage: { "claude-sonnet-5-5": {} },
    }),
  );
  assert.equal(out.turns, 6);
  assert.equal(out.costUsd, 0.1234);
  assert.deepEqual(out.usage, { inputTokens: 10, outputTokens: 200, cacheReadTokens: 5000, cacheWriteTokens: 800 });
  assert.deepEqual(out.models, ["claude-sonnet-5-5"]);
});

test("tolerates missing optional fields", () => {
  const out = parseClaudeJson(JSON.stringify({ result: "x" }));
  assert.equal(out.turns, 0);
  assert.equal(out.isError, false);
});

test("reads structured_output when --json-schema was used", () => {
  const out = parseClaudeJson(JSON.stringify({ result: "", structured_output: { a: 1 } }));
  assert.deepEqual(out.structuredOutput, { a: 1 });
  assert.equal(parseClaudeJson(JSON.stringify({ result: "x" })).structuredOutput, undefined);
});

test("ask runs one tool-free turn with your system prompt and model", () => {
  const args = askArgs({ model: "claude-haiku-5-5", system: "s", prompt: "p", jsonSchema: { type: "object" }, effort: "medium" }, "/tmp/system.md");
  const after = (flag: string) => args[args.indexOf(flag) + 1];
  assert.equal(after("--model"), "claude-haiku-5-5");
  assert.equal(after("--system-prompt-file"), "/tmp/system.md");
  assert.equal(after("--tools"), "");
  assert.equal(after("--effort"), "medium");
  assert.equal(after("--json-schema"), '{"type":"object"}');
  assert.ok(args.includes("--strict-mcp-config"));
  assert.ok(!args.includes("p"), "the prompt goes in on stdin, not argv");
});

// A stand-in `claude` binary that echoes what it was given.
async function fakeBin(): Promise<string> {
  const dir = await tempDir();
  const bin = path.join(dir, "claude");
  await writeFile(
    bin,
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const sys = args.includes("--system-prompt-file") ? fs.readFileSync(args[args.indexOf("--system-prompt-file") + 1], "utf8") : null;
const stdin = fs.readFileSync(0, "utf8");
const echo = { sys, stdin, hasKey: Boolean(process.env.ANTHROPIC_API_KEY), noMemory: process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY === "1", cwdFiles: fs.readdirSync(process.cwd()) };
console.log(JSON.stringify({ result: JSON.stringify(echo), num_turns: 1, usage: { input_tokens: 7, output_tokens: 3 } }));
`,
  );
  await chmod(bin, 0o755);
  return bin;
}

test("RealClaudeCli.ask sends the prompt on stdin and drops the API key on a subscription", { skip: process.platform === "win32" }, async () => {
  const bin = await fakeBin();
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE";
  try {
    const sub = await new RealClaudeCli({ bin, subscription: true }).ask({ model: "m", system: "be brief", prompt: "hello" });
    const echo = JSON.parse(sub.result) as { sys: string; stdin: string; hasKey: boolean; noMemory: boolean; cwdFiles: string[] };
    assert.equal(echo.sys, "be brief");
    assert.equal(echo.stdin, "hello");
    assert.equal(echo.hasKey, false);
    assert.equal(echo.noMemory, true, "your memory stays out of the prompt");
    assert.deepEqual(echo.cwdFiles, ["system.md"], "runs in an empty folder");
    assert.equal(sub.usage.inputTokens, 7);

    const api = await new RealClaudeCli({ bin }).ask({ model: "m", system: "s", prompt: "p" });
    assert.equal((JSON.parse(api.result) as { hasKey: boolean }).hasKey, true);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

function stubCli(reply: Partial<ClaudeAskResult>): ClaudeCli {
  const base: ClaudeAskResult = { result: "", isError: false, turns: 1, costUsd: 0, usage: ZERO_USAGE, models: [] };
  return { run: () => Promise.reject(new Error("unused")), ask: () => Promise.resolve({ ...base, ...reply }) };
}

const Schema = z.object({ grade: z.enum(["pass", "fail"]) });

test("the claude-cli client returns text and structured output", async () => {
  assert.equal((await new ClaudeCliLlmClient(stubCli({ result: "hi" })).complete({ model: "m", system: "s", user: "u" })).text, "hi");
  const structured = new ClaudeCliLlmClient(stubCli({ structuredOutput: { grade: "pass" } }));
  assert.deepEqual((await structured.structured({ model: "m", system: "s", user: "u", schema: Schema })).value, { grade: "pass" });
  const fenced = new ClaudeCliLlmClient(stubCli({ result: 'Here:\n```json\n{"grade":"fail"}\n```' }));
  assert.deepEqual((await fenced.structured({ model: "m", system: "s", user: "u", schema: Schema })).value, { grade: "fail" });
});

test("the judge's JSON Schema leaves out the $schema URI that claude rejects", async () => {
  let sent: object | undefined;
  const cli = stubCli({ structuredOutput: { grade: "pass" } });
  const spy: ClaudeCli = { ...cli, ask: (req) => ((sent = req.jsonSchema), cli.ask(req)) };
  await new ClaudeCliLlmClient(spy).structured({ model: "m", system: "s", user: "u", schema: Schema });
  assert.ok(sent && !("$schema" in sent));
  assert.equal((sent as { type?: string }).type, "object");
});

test("the claude-cli client rejects bad verdicts, errors and raw API requests", async () => {
  const bad = new ClaudeCliLlmClient(stubCli({ structuredOutput: { grade: "maybe" } }));
  await assert.rejects(bad.structured({ model: "m", system: "s", user: "u", schema: Schema }));
  const failed = new ClaudeCliLlmClient(stubCli({ isError: true, result: "not logged in" }));
  await assert.rejects(failed.complete({ model: "m", system: "s", user: "u" }), /not logged in/);
  await assert.rejects(failed.send({ model: "m", max_tokens: 1, messages: [] }), /DOJO_BACKEND=api/);
});

test("extractJson finds an object in prose", () => {
  assert.deepEqual(extractJson('Sure! {"a": 1} hope that helps'), { a: 1 });
  assert.throws(() => extractJson("no json here"));
});
