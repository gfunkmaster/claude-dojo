import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { z } from "zod";
import type { ClaudeCli, ClaudeRunRequest, ClaudeRunResult } from "../src/llm/claude-cli.ts";
import type {
  CompleteRequest,
  CompleteResponse,
  LlmClient,
  StructuredRequest,
  StructuredResponse,
} from "../src/llm/client.ts";

const USAGE = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * Stands in for the model. It reacts to the system prompt the way a real model
 * roughly would, so good and bad reference answers separate without network calls.
 */
export class FakeLlm implements LlmClient {
  calls: CompleteRequest[] = [];
  structuredCalls: StructuredRequest<z.ZodType>[] = [];
  /** Override the judge's verdict; by default it passes every criterion when all checks passed. */
  verdict?: (req: StructuredRequest<z.ZodType>) => unknown;

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.calls.push(req);
    return { text: respond(req.system, req.user), usage: USAGE };
  }

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    this.structuredCalls.push(req);
    const value = this.verdict ? this.verdict(req) : defaultVerdict(req.system, req.user);
    return { value: value as z.infer<T>, usage: { ...USAGE, cacheWriteTokens: 500 } };
  }
}

function defaultVerdict(system: string, user: string): unknown {
  const ids = [...system.matchAll(/^- ([a-z0-9-]+) \(weight/gm)].map((m) => m[1]);
  const allChecksPassed = !user.includes("- [ ]");
  return {
    criteria: ids.map((id) => ({
      id,
      reasoning: allChecksPassed ? "Meets the criterion." : "Checks failed, so the criterion is not met.",
      grade: allChecksPassed ? "pass" : "fail",
      tip: allChecksPassed ? "" : `Improve ${id}.`,
    })),
    summary: allChecksPassed ? "Solid solution." : "Needs work.",
  };
}

const INVOICES: [RegExp, object][] = [
  [/2026-0412/, { invoiceNumber: "2026-0412", date: "2026-09-14", seller: "Nordisk Kodverkstad AB", total: 1249.5, vat: 249.9, currency: "SEK" }],
  [/A-7731/, { invoiceNumber: "A-7731", date: "2026-08-02", seller: "Pixel Harbor LLC", total: 480, vat: null, currency: "USD" }],
  [/Bergqvist/, { invoiceNumber: null, date: "2026-09-30", seller: "Bergqvist Måleri", total: 3100, vat: null, currency: "SEK" }],
];

const LABELS: [RegExp, string][] = [
  [/freezes|crash/i, "bug"],
  [/charged|refund|invoice/i, "billing"],
  [/would be great|export/i, "feature"],
];

function respond(system: string, user: string): string {
  if (/support ticket/i.test(system)) {
    const label = LABELS.find(([re]) => re.test(user))?.[1] ?? (system.includes("- other") ? "other" : "feature");
    if (system.includes("Category: <Name>")) return `The customer describes their issue.\nCategory: ${label[0]?.toUpperCase()}${label.slice(1)}`;
    return label;
  }
  if (/invoice/i.test(system)) {
    const strict = system.includes("not_an_invoice") && system.includes("null");
    if (!strict) return "Here is the information I found in your invoice: it looks like a bill.";
    const hit = INVOICES.find(([re]) => re.test(user));
    return JSON.stringify(hit ? hit[1] : { error: "not_an_invoice" });
  }
  return "";
}

/**
 * Stands in for `claude -p`. It acts on the sandbox like Claude would and runs
 * the sandbox's real PreToolUse hooks before each shell command.
 */
export class FakeClaude implements ClaudeCli {
  runs: ClaudeRunRequest[] = [];

  async run(req: ClaudeRunRequest): Promise<ClaudeRunResult> {
    this.runs.push(req);
    const { cwd, prompt } = req;
    let turns = 4;
    if (prompt.includes("GET /health")) {
      const guided = readIf(path.join(cwd, "AGENTS.md")).includes("src/routes/index.js");
      write(cwd, "src/routes/health.js", `export default {\n  method: "GET",\n  path: "/health",\n  handler: () => ({ status: 200, body: { status: "ok" } }),\n};\n`);
      if (guided) {
        const index = path.join(cwd, "src/routes/index.js");
        writeFileSync(index, `import health from "./health.js";\nimport users from "./users.js";\n\nexport const routes = [health, users];\n`);
        write(cwd, "test/routes/health.test.js", `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { dispatch } from "../../src/router.js";\n\ntest("GET /health", async () => {\n  const res = await dispatch({ method: "GET", url: "/health" });\n  assert.deepEqual(res.body, { status: "ok" });\n});\n`);
        turns = 7;
      } else {
        turns = 18;
      }
    } else if (prompt.includes("rm -rf")) {
      const blocked = bash(cwd, "rm -rf build tmp");
      write(cwd, "CLEANUP.md", blocked ? "rm -rf was blocked by a hook.\n" : "Deleted build/ and tmp/.\n");
    } else if (prompt.includes("build/old.log")) {
      bash(cwd, "rm build/old.log");
      write(cwd, "DONE.md", "klart\n");
    }
    return { result: "Done.", isError: false, turns, costUsd: 0.05, usage: USAGE, models: ["claude-sonnet-5-5"] };
  }
}

/** Runs PreToolUse hooks for Bash; returns true when a hook blocked the command. */
function bash(cwd: string, command: string): boolean {
  const settingsFile = path.join(cwd, ".claude/settings.json");
  const settings = existsSync(settingsFile) ? (JSON.parse(readFileSync(settingsFile, "utf8")) as Settings) : {};
  for (const group of settings.hooks?.PreToolUse ?? []) {
    if (group.matcher && !new RegExp(`^(${group.matcher})$`).test("Bash")) continue;
    for (const hook of group.hooks) {
      const proc = spawnSync(hook.command, {
        cwd,
        shell: true,
        input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
        env: { ...process.env, CLAUDE_PROJECT_DIR: cwd },
      });
      if (proc.status === 2) return true;
    }
  }
  spawnSync(command, { cwd, shell: true });
  return false;
}

interface Settings {
  hooks?: { PreToolUse?: { matcher?: string; hooks: { command: string }[] }[] };
}

function write(cwd: string, rel: string, content: string): void {
  mkdirSync(path.dirname(path.join(cwd, rel)), { recursive: true });
  writeFileSync(path.join(cwd, rel), content);
}

function readIf(file: string): string {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}
