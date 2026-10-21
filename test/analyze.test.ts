import assert from "node:assert/strict";
import { cp, readFile, readdir, stat, utimes } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { validateDraft, type Draft } from "../src/analyze/generate.ts";
import { analyze, detectPatterns, isCorrection, similarity } from "../src/analyze/patterns.ts";
import { redact } from "../src/analyze/redact.ts";
import { findTranscripts, loadSessions, parseTranscript, type Session } from "../src/analyze/transcript.ts";
import { main } from "../src/cli/index.ts";
import type { ClaudeAskRequest, ClaudeAskResult, ClaudeCli, ClaudeRunResult } from "../src/llm/claude-cli.ts";
import { tempDir, testContext } from "./helpers.ts";

const FIXTURES = path.resolve(import.meta.dirname, "fixtures/transcripts");
const ALL_TIME = { days: 0 };

async function session(project: string): Promise<Session> {
  const sessions = await loadSessions(FIXTURES, { ...ALL_TIME, project });
  assert.equal(sessions.length, 1);
  return sessions[0] as Session;
}

test("the parser keeps your prompts and skips meta, injected, sidechain and broken lines", async () => {
  const s = await session("shop");
  assert.equal(s.project, "shop");
  assert.equal(s.id, "11111111-aaaa-4000-8000-000000000001");
  const prompts = s.events.flatMap((e) => (e.kind === "prompt" ? [e.text] : []));
  assert.equal(prompts.length, 4);
  assert.ok(!prompts.some((p) => p.includes("/clear") || p.includes("Caveat") || p === "nej, fel fil"));
  assert.equal(s.events.filter((e) => e.kind === "interrupt").length, 2, "Esc and a rejected tool call");
});

test("the parser merges the per-block lines of one assistant message", () => {
  const msg = (block: object) => JSON.stringify({ type: "assistant", message: { id: "m1", content: [block], usage: { input_tokens: 10, cache_read_input_tokens: 90 } } });
  const s = parseTranscript(
    [
      JSON.stringify({ type: "user", message: { content: "hi" } }),
      msg({ type: "text", text: "one" }),
      msg({ type: "tool_use", id: "t1", name: "Read", input: { file_path: "a.ts" } }),
    ].join("\n"),
    "/x/s.jsonl",
    "proj",
  );
  assert.equal(s.events.length, 2);
  const a = s.events[1];
  assert.equal(a?.kind, "assistant");
  if (a?.kind !== "assistant") return;
  assert.equal(a.text, "one");
  assert.equal(a.toolUses.length, 1);
  assert.equal(a.contextTokens, 100);
});

test("corrections are recognised in Swedish and English, without the usual false alarms", () => {
  for (const p of ["nej, jag sa före moms", "Nej.", "Fel fil", "No, use pnpm", "That's not what I asked", "it still doesn't work", "du glömde testerna", "why did you delete that?", "Det fungerar fortfarande inte"]) {
    assert.ok(isCorrection(p), p);
  }
  for (const p of ["Nice, no worries", "Add a stop button", "Felhantering i API:t behövs", "Notera att vi kör node 22", "Novel idea: add caching"]) {
    assert.ok(!isCorrection(p), p);
  }
});

test("similar prompts score high, different ones low", () => {
  assert.ok(similarity("Kör alltid npm test innan du är klar", "Kör alltid npm test innan du är klar, tack") > 0.6);
  assert.ok(similarity("Lägg till en rabattkod", "Skriv ett test för datumet") < 0.2);
});

test("each fixture shows the patterns it was built for", async () => {
  const kinds = async (project: string) => detectPatterns(await session(project)).map((f) => f.kind).sort();
  assert.deepEqual(await kinds("shop"), ["correction", "interrupt", "interrupt", "repeat"]);
  assert.deepEqual(await kinds("api"), ["retry-loop", "rework"]);
  assert.deepEqual(await kinds("monorepo"), ["context-bloat"]);
  assert.deepEqual(await kinds("notes"), []);
});

test("findings are redacted and never carry tool output", async () => {
  const findings = detectPatterns(await session("shop"));
  const all = JSON.stringify(findings);
  assert.ok(!all.includes("sk-ant-api03"), "API key");
  assert.ok(!all.includes("dev@example.com"), "email");
  assert.ok(!all.includes("PRIVATE-TOOL-OUTPUT"), "tool results stay out");
  const correction = findings.find((f) => f.kind === "correction");
  assert.match(correction?.excerpt ?? "", /Claude: Jag lägger till rabatten efter momsen/);
  assert.match(correction?.excerpt ?? "", /You: nej, jag sa/);
});

test("the summary ranks patterns by how many sessions they appear in", async () => {
  const a = analyze(await loadSessions(FIXTURES, ALL_TIME));
  assert.equal(a.sessions, 4);
  assert.deepEqual(a.projects, ["api", "monorepo", "notes", "shop"]);
  assert.equal(a.summary[0]?.kind, "interrupt");
  assert.equal(a.summary.find((s) => s.kind === "context-bloat")?.count, 1, "a compaction is counted once");
});

test("redact removes keys, tokens, passwords, emails and home folders", () => {
  const cases: [string, RegExp][] = [
    ["key sk-ant-api03-FAKEabcdefghijklmnop", /key \[REDACTED\]/],
    ["ghp_FAKEabcdefghijklmnopqrstuvwxyz0123", /^\[REDACTED\]$/],
    ["AKIAFAKEFAKEFAKEFAKE", /^\[REDACTED\]$/],
    ["DATABASE_PASSWORD=hunter22", /DATABASE_PASSWORD=\[REDACTED\]/],
    ['"apiKey": "abcd1234efgh"', /"apiKey": "\[REDACTED\]"/],
    ["postgres://admin:s3cret@db:5432/app", /postgres:\/\/\[REDACTED\]@db/],
    ["Authorization: Bearer abcdefghijklmnopqrstuvwxyz", /Bearer \[REDACTED\]/],
    ["mail me at dev@example.com", /\[EMAIL\]/],
    ["/Users/someone/code/app and /home/someone/x", /^~\/code\/app and ~\/x$/],
  ];
  for (const [input, expected] of cases) assert.match(redact(input), expected, input);
  assert.equal(redact("npm test passes"), "npm test passes");
});

test("--days skips transcripts that haven't changed recently", async () => {
  const dir = await tempDir();
  await cp(FIXTURES, dir, { recursive: true });
  const old = path.join(dir, "-home-dev-api", "22222222-bbbb-4000-8000-000000000002.jsonl");
  const longAgo = new Date(Date.now() - 90 * 86_400_000);
  await utimes(old, longAgo, longAgo);
  assert.equal((await findTranscripts(dir, { days: 30 })).length, 3);
  assert.equal((await findTranscripts(dir, { days: 0 })).length, 4);
  assert.deepEqual(await findTranscripts(path.join(dir, "missing"), ALL_TIME), []);
});

const GOOD_EXERCISE = `---
title: Regler som gäller från första svaret
skill: context
type: prompt
difficulty: 1
solution: system.md
cases:
  - name: rabatt före moms
    text: "Pris 100 kr, rabatt 10 kr, moms 25 %. Vad blir totalen?"
    checks:
      - { kind: regex, pattern: "112[,.]5" }
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 50] }
weights: { checks: 1, judge: 0 }
---

Skriv en systemprompt där rabatten alltid dras före moms.
`;

function draft(overrides: Partial<Record<string, string>> = {}): Draft {
  const files: Record<string, string> = {
    "exercise.md": GOOD_EXERCISE,
    "starter/system.md": "TODO\n",
    "refs/good/system.md": "Dra rabatten före moms.\n",
    "refs/bad/system.md": "Räkna ut totalen. API_KEY=sk-ant-api03-FAKEFAKEFAKEFAKE\n",
    ...overrides,
  };
  return { slug: "Rabatt före moms", files: Object.entries(files).flatMap(([p, content]) => (content === undefined ? [] : [{ path: p, content }])) };
}

test("a valid draft gets Dojo's id and source, and its files are redacted", () => {
  const v = validateDraft(draft(), "my-rabatt", "dojo analyze: correction", "/tmp/my-rabatt");
  assert.equal(v.exercise.id, "my-rabatt");
  assert.equal(v.exercise.source, "dojo analyze: correction");
  assert.match(v.files.find((f) => f.path === "refs/bad/system.md")?.content ?? "", /API_KEY=\[REDACTED\]/);
});

test("invalid drafts are rejected with a reason the model can act on", () => {
  const bad: [Draft, RegExp][] = [
    [{ slug: "x", files: [...draft().files, { path: "../escape.md", content: "x" }] }, /unsafe file path/],
    [{ slug: "x", files: [...draft().files, { path: "/etc/passwd", content: "x" }] }, /unsafe file path/],
    [draft({ "refs/bad/system.md": undefined }), /missing: refs\/bad\/system.md/],
    [draft({ "exercise.md": GOOD_EXERCISE.replace("type: prompt", "type: request") }), /type must be one of/],
    [draft({ "exercise.md": "no frontmatter" }), /no YAML frontmatter/],
    [draft({ "exercise.md": GOOD_EXERCISE.replace("skill: context", "skill: cooking") }), /skill/],
  ];
  for (const [d, error] of bad) assert.throws(() => validateDraft(d, "my-x", "s", "/tmp/my-x"), error);
});

/** Stands in for `claude -p` on the analyze prompts. The first draft is broken, to exercise the retry. */
class FakeAnalyzeClaude implements ClaudeCli {
  asks: ClaudeAskRequest[] = [];
  private drafts = 0;

  async ask(req: ClaudeAskRequest): Promise<ClaudeAskResult> {
    this.asks.push(req);
    const base = { result: "", isError: false, turns: 1, costUsd: 0.02, usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }, models: [req.model] };
    const props = Object.keys((req.jsonSchema as { properties?: object } | undefined)?.properties ?? {});
    if (props.includes("overview")) {
      return {
        ...base,
        structuredOutput: {
          overview: "Du rättar ofta Claude om regler som borde stå i AGENTS.md.",
          patterns: [
            { kind: "correction", title: "Rabattregeln glöms bort", summary: "Claude drog rabatten efter moms.", skill: "context", difficulty: 1, exerciseIdea: "Skriv regeln så att den följs direkt." },
          ],
        },
      };
    }
    this.drafts++;
    return { ...base, structuredOutput: this.drafts === 1 ? draft({ "refs/good/system.md": undefined }) : draft() };
  }

  run(): Promise<ClaudeRunResult> {
    return Promise.reject(new Error("analyze never runs claude in a sandbox"));
  }
}

test("dojo analyze reports patterns without any model call", async () => {
  const ctx = await testContext();
  assert.equal(await main(["analyze", "--dir", FIXTURES, "--days", "0"], ctx), 0);
  const out = ctx.lines.join("\n");
  assert.match(out, /Analysed 4 sessions \(9 prompts\) in 4 projects/);
  assert.match(out, /correction\s+1\s+1\s+prompting, context/);
  assert.match(out, /Nothing has left your machine/);
  assert.ok(!out.includes("sk-ant-api03"));
  assert.equal(ctx.fakeClaude.asks.length + ctx.fakeLlm.calls.length + ctx.fakeLlm.structuredCalls.length, 0);
});

test("dojo analyze --generate drafts a valid personal exercise through claude -p only", async () => {
  const ctx = await testContext();
  const claude = new FakeAnalyzeClaude();
  ctx.claude = () => claude;
  assert.equal(await main(["analyze", "--dir", FIXTURES, "--days", "0", "--generate", "--max", "1"], ctx), 0, ctx.lines.join("\n"));

  assert.equal(claude.asks.length, 3, "one summary, one broken draft, one retry");
  assert.equal(ctx.fakeLlm.calls.length + ctx.fakeLlm.structuredCalls.length, 0, "nothing goes to the API, even on the api backend");
  const sent = claude.asks.map((a) => `${a.system}\n${a.prompt}`).join("\n");
  for (const secret of ["sk-ant-api03", "dev@example.com", "PRIVATE-TOOL-OUTPUT", "/home/dev"]) assert.ok(!sent.includes(secret), secret);
  assert.match(claude.asks[2]?.prompt ?? "", /previous draft was invalid: .*refs\/good\/system.md/);
  assert.match(claude.asks[1]?.system ?? "", /id: prompt-extract-invoice/, "real exercises are the format examples");

  const dir = path.join(ctx.generatedDir, "my-rabatt-fore-moms");
  assert.ok((await stat(path.join(dir, "exercise.md"))).isFile());
  assert.deepEqual((await readdir(path.join(dir, "refs"))).sort(), ["bad", "good"]);
  assert.match(await readFile(path.join(dir, "exercise.md"), "utf8"), /source: "dojo analyze \d{4}-\d{2}-\d{2}: correction"/);
  assert.ok(ctx.lines.some((l) => l.includes("dojo run my-rabatt-fore-moms --calibrate")));

  // A generated exercise is an exercise like any other.
  ctx.lines.length = 0;
  await main(["list"], ctx);
  assert.ok(ctx.lines.some((l) => /my-rabatt-fore-moms\s+nybörjare\s+context\s+prompt/.test(l)), ctx.lines.join("\n"));
  assert.equal(await main(["run", "my-rabatt-fore-moms"], ctx), 0);
  assert.ok((await stat(path.join(ctx.workspaceDir, "my-rabatt-fore-moms", "system.md"))).isFile());

  // A second run never overwrites the first exercise.
  assert.equal(await main(["analyze", "--dir", FIXTURES, "--days", "0", "--generate", "--max", "1"], ctx), 0);
  assert.ok((await stat(path.join(ctx.generatedDir, "my-rabatt-fore-moms-2", "exercise.md"))).isFile());
});

test("dojo analyze rejects bad numbers", async () => {
  const ctx = await testContext();
  assert.equal(await main(["analyze", "--days", "abc"], ctx), 1);
  assert.equal(await main(["analyze", "--max", "0"], ctx), 1);
});
