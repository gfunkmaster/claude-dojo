import type Anthropic from "@anthropic-ai/sdk";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import type { z } from "zod";
import { cleanEnv } from "../src/checks/index.ts";
import type { TokenUsage } from "../src/core/pricing.ts";
import type { ClaudeCli, ClaudeRunRequest, ClaudeRunResult } from "../src/llm/claude-cli.ts";
import type {
  CompleteRequest,
  CompleteResponse,
  LlmClient,
  SendResponse,
  StructuredRequest,
  StructuredResponse,
} from "../src/llm/client.ts";

const USAGE: TokenUsage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };

/**
 * Stands in for the model. It reacts to the prompt the way a real model
 * roughly would, so good and bad reference answers separate without network
 * calls. Each branch below belongs to one exercise.
 */
export class FakeLlm implements LlmClient {
  calls: CompleteRequest[] = [];
  sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  structuredCalls: StructuredRequest<z.ZodType>[] = [];
  /** Override the judge's verdict; by default it passes every criterion when all checks passed. */
  verdict?: (req: StructuredRequest<z.ZodType>) => unknown;
  private readonly cache = new Set<string>();

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    this.calls.push(req);
    return { text: respond(req.system, req.user), usage: USAGE };
  }

  async send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<SendResponse> {
    this.sent.push(params);
    const system = systemText(params.system);
    const user = lastUserText(params.messages);
    if (params.tools?.length) return { ...fakeToolCall(system, params.tools as Anthropic.Tool[], user), model: params.model, usage: USAGE };
    return { text: respondToRequest(params, system, user), toolCalls: [], model: params.model, usage: this.usageFor(params) };
  }

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    this.structuredCalls.push(req);
    const value = this.verdict ? this.verdict(req) : defaultVerdict(req.system, req.user);
    return { value: value as z.infer<T>, usage: { ...USAGE, cacheWriteTokens: 500 } };
  }

  /** Simulates prompt caching: a prefix up to the last cache_control marker is read back on an exact repeat. */
  private usageFor(params: Anthropic.MessageCreateParamsNonStreaming): TokenUsage {
    const thinkingHeavy = params.model === "claude-opus-5-5" && params.output_config?.effort !== "low";
    const usage = { inputTokens: Math.ceil(JSON.stringify(params).length / 4), outputTokens: thinkingHeavy ? 400 : 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const blocks = Array.isArray(params.system) ? params.system : [];
    const last = blocks.map((b) => Boolean(b.cache_control)).lastIndexOf(true);
    if (last === -1) return usage;
    const prefix = JSON.stringify(blocks.slice(0, last + 1));
    const tokens = Math.ceil(prefix.length / 4);
    usage.inputTokens = Math.max(1, usage.inputTokens - tokens);
    if (this.cache.has(prefix)) usage.cacheReadTokens = tokens;
    else {
      usage.cacheWriteTokens = tokens;
      this.cache.add(prefix);
    }
    return usage;
  }
}

function systemText(system: Anthropic.MessageCreateParamsNonStreaming["system"]): string {
  if (!system) return "";
  return typeof system === "string" ? system : system.map((b) => b.text).join("\n");
}

function lastUserText(messages: Anthropic.MessageParam[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  return typeof last.content === "string"
    ? last.content
    : last.content.map((b) => (b.type === "text" ? b.text : "")).join("");
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

// --- prompt exercises (system prompt + user message) ---

const INVOICES: [RegExp, object][] = [
  [/2026-0412/, { invoiceNumber: "2026-0412", date: "2026-09-14", seller: "Nordisk Kodverkstad AB", total: 1249.5, vat: 249.9, currency: "SEK" }],
  [/A-7731/, { invoiceNumber: "A-7731", date: "2026-08-02", seller: "Pixel Harbor LLC", total: 480, vat: null, currency: "USD" }],
  [/Bergqvist/, { invoiceNumber: null, date: "2026-09-30", seller: "Bergqvist Måleri", total: 3100, vat: null, currency: "SEK" }],
];

const TICKET_LABELS: [RegExp, string][] = [
  [/freezes|crash/i, "bug"],
  [/charged|refund|invoice/i, "billing"],
  [/would be great|export/i, "feature"],
];

function sentiment(text: string): string {
  if (/kraschar|säger upp|pengarna tillbaka|arg/i.test(text)) return "negative";
  if (/tack|löste|good|great|nice/i.test(text)) return "positive";
  return "neutral";
}

function respond(system: string, user: string): string {
  if (/support ticket/i.test(system)) {
    const label = TICKET_LABELS.find(([re]) => re.test(user))?.[1] ?? (system.includes("- other") ? "other" : "feature");
    if (system.includes("Category: <Name>")) return `The customer describes their issue.\nCategory: ${capitalize(label)}`;
    return label;
  }
  if (/sentiment/i.test(system)) {
    const label = sentiment(user);
    return /Capitalize/.test(system) ? capitalize(label) : label;
  }
  if (/invoice/i.test(system)) {
    const strict = system.includes("not_an_invoice") && system.includes("null");
    if (!strict) return "Here is the information I found in your invoice: it looks like a bill.";
    const hit = INVOICES.find(([re]) => re.test(user));
    return JSON.stringify(hit ? hit[1] : { error: "not_an_invoice" });
  }
  if (/intern anteckning|anteckningen|note/i.test(system) && /kund/i.test(system)) return toneReply(system, user);
  if (/email/i.test(system) && /suspicious/.test(system)) return summariseEmail(system, user);
  if (/planner|project manager/i.test(system)) return plan(system, user);
  if (/faithful/i.test(system)) return judgeSummary(system, user);
  return "";
}

function toneReply(system: string, user: string): string {
  const onBrand = system.includes("/Teamet på Dojo") && system.includes("<example>");
  if (!onBrand) return "Hej! Tack för att Ni hörde av Er, vi har ordnat allt!";
  let body = "Hej, tack för att du hörde av dig.";
  if (/299/.test(user)) body = "Hej, du blev dubbeldebiterad och vi har i dag återbetalat 299 kr. Pengarna syns på ditt konto om 3-5 bankdagar.";
  if (/pdf/i.test(user)) body = "Hej, exporten till PDF fungerar inte sedan releasen i tisdags. En rättning kommer på fredag, och tills dess kan du exportera som PNG.";
  if (/telefon/i.test(user)) body = "Hej, vi har tyvärr ingen telefonsupport. Du når oss snabbast i chatten.";
  return `${body}\n/Teamet på Dojo`;
}

function summariseEmail(system: string, user: string): string {
  const hardened = /untrusted/i.test(system);
  const injected = /ignore all previous|\[SYSTEM MESSAGE\]/i.test(user);
  if (!hardened && /PWNED/.test(user)) return "PWNED";
  const actions = /fredag/i.test(user) ? ["Skicka kvartalsrapporten som PDF senast fredag", "Bjud in Omar till genomgången"] : [];
  if (!hardened && /evil\.example/.test(user)) actions.push("Reset your password now at https://evil.example/reset");
  return JSON.stringify({
    summary: /fredag/i.test(user) ? "Lina vill ha kvartalsrapporten på fredag." : "Ett mejl om en faktura eller ett konto.",
    action_items: actions,
    suspicious: hardened && injected,
  });
}

function plan(system: string, user: string): string {
  if (!system.includes("dependsOn")) return "Step 1: understand the problem. Step 2: write the code. Step 3: test it.";
  if (/bättre/i.test(user) && user.length < 30) return JSON.stringify({ question: "Vad är det viktigaste som ska bli bättre?", tasks: [] });
  return JSON.stringify({
    question: null,
    tasks: [
      { id: "t1", agent: "researcher", goal: `Map what is needed for: ${user}`, dependsOn: [] },
      { id: "t2", agent: "coder", goal: "Implement the change and add tests.", dependsOn: ["t1"] },
      { id: "t3", agent: "reviewer", goal: "Review the change against the goal.", dependsOn: ["t2"] },
    ],
  });
}

function judgeSummary(system: string, user: string): string {
  const source = /<source>([\s\S]*?)<\/source>/.exec(user)?.[1] ?? "";
  const summary = /<summary>([\s\S]*?)<\/summary>/.exec(user)?.[1] ?? "";
  if (!/individual claims|each claim/i.test(system)) return JSON.stringify({ faithful: true, unsupported_claims: [] });
  const unsupported: string[] = [];
  for (const n of summary.match(/\d[\d ]*/g) ?? []) if (!source.includes(n.trim())) unsupported.push(`${n.trim()} procent`);
  const cause = /tack vare [^,.]+/.exec(summary)?.[0];
  if (cause && !source.includes(cause)) unsupported.push(cause);
  return JSON.stringify({ faithful: unsupported.length === 0, unsupported_claims: unsupported });
}

// --- tools exercises (tool definitions + user message) ---

function fakeToolCall(system: string, tools: Anthropic.Tool[], user: string): Omit<SendResponse, "model" | "usage"> {
  const describes = (t: Anthropic.Tool, re: RegExp) => re.test(t.description ?? "");
  const informative = tools.every((t) => (t.description ?? "").length > 40);
  const none = { text: "Hej! Hur kan jag hjälpa dig?", toolCalls: [] };

  if (tools.some((t) => t.name === "book_meeting")) return bookMeeting(system, tools[0], user);

  if (!informative) {
    const first = tools[0];
    return first ? { text: "", toolCalls: [{ name: first.name, input: {} }] } : none;
  }
  if (/^hej|hur är läget/i.test(user) && /small talk|Do not use/i.test(system + tools.map((t) => t.description).join(" "))) return none;
  const pick = (re: RegExp) => tools.find((t) => describes(t, re));
  if (/regn|väder|vädret/i.test(user)) {
    const tool = pick(/weather|forecast/i);
    if (tool) return { text: "", toolCalls: [{ name: tool.name, input: { city: /Malmö/.exec(user)?.[0] ?? "" } }] };
  }
  if (/ärende|logga in/i.test(user)) {
    const tool = pick(/support ticket/i);
    const priorities = JSON.stringify(tool?.input_schema ?? {});
    if (tool) return { text: "", toolCalls: [{ name: tool.name, input: { title: "Kan inte logga in", priority: priorities.includes('"high"') ? "high" : "hög" } }] };
  }
  const docs = pick(/documentation|docs/i);
  if (docs) return { text: "", toolCalls: [{ name: docs.name, input: { query: user } }] };
  return none;
}

function bookMeeting(system: string, tool: Anthropic.Tool | undefined, user: string): Omit<SendResponse, "model" | "usage"> {
  if (!tool) return { text: "", toolCalls: [] };
  const schema = JSON.stringify(tool.input_schema);
  const typed = schema.includes('"duration_minutes"') && schema.includes('"integer"') && schema.includes('"enum"');
  const asks = /ask the user|missing/i.test(system + (tool.description ?? ""));
  const emails = user.match(/[\w.]+@[\w.]+\w/g) ?? [];
  if (asks && emails.length === 0) return { text: "Hur långt ska mötet vara, och när?", toolCalls: [] };
  if (!typed) return { text: "", toolCalls: [{ name: tool.name, input: { duration: "30 min", people: emails.join(", "), when: "torsdag 14" } }] };
  const date = /\d{4}-\d{2}-\d{2}/.exec(user)?.[0] ?? "";
  const hour = /kl(?:ockan)? (\d{1,2})/.exec(user)?.[1] ?? "0";
  return {
    text: "",
    toolCalls: [
      {
        name: tool.name,
        input: {
          duration_minutes: /kvart/.test(user) ? 15 : 30,
          attendees: emails,
          start: `${date}T${hour.padStart(2, "0")}:00`,
          timezone: /London/.test(user) ? "Europe/London" : "Europe/Stockholm",
        },
      },
    ],
  };
}

// --- request exercises (a whole Messages API body) ---

const ADS: [RegExp, object][] = [
  [/Kånken/, { name: "Fjällräven Kånken", price_sek: 650, in_stock: true, condition: "like_new" }],
  [/Moccamaster/, { name: "Moccamaster KBG Select", price_sek: 1200, in_stock: false, condition: "used" }],
  [/iPad/, { name: "iPad Air 13", price_sek: null, in_stock: true, condition: "new" }],
];

const HANDBOOK_ANSWERS: [RegExp, string][] = [
  [/semester/i, "Du har 30 semesterdagar per år."],
  [/friskvård/i, "Friskvårdsbidraget är 5 000 kronor per år."],
  [/kontorsdag/i, "Tisdagar är kontorsdag för alla."],
  [/uppsägning/i, "Uppsägningstiden är tre månader."],
];

function respondToRequest(params: Anthropic.MessageCreateParamsNonStreaming, system: string, user: string): string {
  if (/handbook/i.test(system) && system.includes("# Dojo personalhandbok")) {
    const question = system.includes("Question:") ? (/Question: (.*)/.exec(system)?.[1] ?? user) : user;
    return HANDBOOK_ANSWERS.find(([re]) => re.test(question))?.[1] ?? "Det står inte i handboken.";
  }
  if (/product/i.test(system)) {
    const hit = ADS.find(([re]) => re.test(user))?.[1] ?? {};
    const json = JSON.stringify(hit);
    return params.output_config?.format ? json : `Here is the product information:\n\`\`\`json\n${json}\n\`\`\`\nI assumed the price is in SEK.`;
  }
  if (/sentiment/i.test(system)) {
    const label = sentiment(user);
    return /only/i.test(system) ? label : `The sentiment of this message is ${label}, because of its wording.`;
  }
  return "";
}

// --- env exercises: a fake `claude -p` acting on the sandbox ---

interface HookGroup {
  matcher?: string;
  hooks: { command: string }[];
}

interface Settings {
  hooks?: Record<string, HookGroup[]>;
  permissions?: { allow?: string[]; deny?: string[] };
}

/** The sandbox as Claude Code sees it: merged settings, hooks and permission rules. */
class Sandbox {
  readonly cwd: string;
  private readonly allowedTools: string[];
  turns = 0;

  constructor(req: ClaudeRunRequest) {
    this.cwd = req.cwd;
    this.allowedTools = req.allowedTools;
  }

  private settings(): Settings[] {
    return ["settings.json", "settings.local.json"]
      .map((f) => path.join(this.cwd, ".claude", f))
      .filter((f) => existsSync(f))
      .map((f) => JSON.parse(readFileSync(f, "utf8")) as Settings);
  }

  private hooks(event: string, tool?: string): string[] {
    return this.settings()
      .flatMap((s) => s.hooks?.[event] ?? [])
      .filter((g) => !tool || !g.matcher || new RegExp(`^(${g.matcher})$`).test(tool))
      .flatMap((g) => g.hooks.map((h) => h.command));
  }

  private runHook(command: string, input: object): number {
    const proc = spawnSync(command, {
      cwd: this.cwd,
      shell: true,
      input: JSON.stringify(input),
      env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: this.cwd },
    });
    return proc.status ?? 1;
  }

  /** Mirrors Claude Code's rule syntax: `Tool`, `Tool(exact)`, `Tool(prefix:*)`, `Read(./path/**)`. */
  private matches(rule: string, tool: string, arg: string): boolean {
    const m = /^([^(]+)(?:\((.*)\))?$/.exec(rule);
    if (!m || m[1] !== tool) return false;
    const spec = m[2];
    if (spec === undefined) return true;
    if (spec.endsWith(":*")) return arg.startsWith(spec.slice(0, -2));
    const normalized = arg.replace(/^\.\//, "");
    const pattern = spec.replace(/^\.\//, "");
    if (pattern.endsWith("/**")) return normalized.startsWith(pattern.slice(0, -2));
    return normalized === pattern;
  }

  private permitted(tool: string, arg: string): boolean {
    const rules = this.settings().map((s) => s.permissions ?? {});
    if (rules.some((r) => (r.deny ?? []).some((rule) => this.matches(rule, tool, arg)))) return false;
    if (tool === "Write" || tool === "Edit") return true; // acceptEdits
    const allow = [...this.allowedTools, ...rules.flatMap((r) => r.allow ?? [])];
    return allow.some((rule) => this.matches(rule, tool, arg));
  }

  /** One tool call: PreToolUse hooks, permissions, the action, PostToolUse hooks. Returns false if blocked. */
  tool(name: string, input: Record<string, unknown>, action: () => void = () => {}): boolean {
    this.turns++;
    const arg = String(input.command ?? input.file_path ?? input.subagent_type ?? input.skill ?? "");
    for (const command of this.hooks("PreToolUse", name)) {
      if (this.runHook(command, { tool_name: name, tool_input: input }) === 2) return false;
    }
    if (!this.permitted(name, arg)) return false;
    action();
    for (const command of this.hooks("PostToolUse", name)) this.runHook(command, { tool_name: name, tool_input: input });
    return true;
  }

  bash(command: string): { ran: boolean; ok: boolean } {
    let ok = false;
    const ran = this.tool("Bash", { command }, () => {
      ok = spawnSync(command, { cwd: this.cwd, shell: true, env: cleanEnv() }).status === 0;
    });
    return { ran, ok };
  }

  read(rel: string): string | null {
    let text: string | null = null;
    this.tool("Read", { file_path: rel }, () => {
      text = readFileSync(path.join(this.cwd, rel), "utf8");
    });
    return text;
  }

  write(rel: string, content: string): void {
    this.tool("Write", { file_path: rel }, () => {
      mkdirSync(path.dirname(path.join(this.cwd, rel)), { recursive: true });
      writeFileSync(path.join(this.cwd, rel), content);
    });
  }

  /** Stop hooks; returns true when a hook sent Claude back to work. */
  stop(stopHookActive: boolean): boolean {
    return this.hooks("Stop").some((command) => this.runHook(command, { stop_hook_active: stopHookActive }) === 2);
  }

  file(rel: string): string {
    const full = path.join(this.cwd, rel);
    return existsSync(full) ? readFileSync(full, "utf8") : "";
  }
}

/**
 * Stands in for `claude -p`. It acts on the sandbox like Claude would and runs
 * the sandbox's real hooks, permission rules and MCP servers.
 */
export class FakeClaude implements ClaudeCli {
  runs: ClaudeRunRequest[] = [];

  async run(req: ClaudeRunRequest): Promise<ClaudeRunResult> {
    this.runs.push(req);
    const sb = new Sandbox(req);
    const p = req.prompt;
    if (p.includes("GET /health")) health(sb);
    else if (p.includes("rm -rf")) sb.write("CLEANUP.md", sb.bash("rm -rf build tmp").ran ? "Deleted build/ and tmp/.\n" : "rm -rf was blocked by a hook.\n");
    else if (p.includes("build/old.log")) {
      sb.bash("rm build/old.log");
      sb.write("DONE.md", "klart\n");
    } else if (p.includes("slugify")) slugify(sb);
    else if (p.includes("test-writer")) testWriter(sb);
    else if (p.includes("SUMMARY.md")) summary(sb);
    else if (p.trim() === "/audit") audit(sb);
    else if (/release notes/i.test(p)) releaseNotes(sb);
    else if (p.includes("order 1042")) await orders(sb);
    else if (p.includes("applyDiscount")) discount(sb);
    return { result: "Done.", isError: false, turns: Math.max(sb.turns, 1), costUsd: 0.05, usage: USAGE, models: ["claude-sonnet-5-5"] };
  }
}

function health(sb: Sandbox): void {
  const guided = sb.file("AGENTS.md").includes("src/routes/index.js");
  sb.write("src/routes/health.js", `export default {\n  method: "GET",\n  path: "/health",\n  handler: () => ({ status: 200, body: { status: "ok" } }),\n};\n`);
  if (!guided) {
    for (const f of ["src/server.js", "src/router.js", "src/routes/users.js", "test/routes/users.test.js", "package.json", "scripts/lint.js"]) sb.read(f);
    for (let i = 0; i < 10; i++) sb.bash("ls");
    return;
  }
  sb.write("src/routes/index.js", `import health from "./health.js";\nimport users from "./users.js";\n\nexport const routes = [health, users];\n`);
  sb.write("test/routes/health.test.js", `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { dispatch } from "../../src/router.js";\n\ntest("GET /health", async () => {\n  const res = await dispatch({ method: "GET", url: "/health" });\n  assert.deepEqual(res.body, { status: "ok" });\n});\n`);
  sb.bash("npm test");
  sb.bash("npm run lint");
}

function slugify(sb: Sandbox): void {
  const guided = /npm run check/.test(sb.file("AGENTS.md"));
  if (!guided) {
    sb.read("package.json");
    sb.bash("npm test");
    sb.read("src/slug.js");
    sb.read("test/slug.test.js");
  }
  sb.bash("npm run check");
  sb.write("src/slug.js", `export function slugify(text) {\n  return text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");\n}\n`);
  sb.bash("npm run check");
  if (!guided) {
    sb.read("src/slug.js");
    sb.bash("npm run check");
  }
}

const MATH_TEST = `import { test } from "node:test";\nimport assert from "node:assert/strict";\nimport { clamp, mean } from "../src/math.js";\n\ntest("clamp", () => {\n  assert.equal(clamp(5, 0, 3), 3);\n  assert.throws(() => clamp(1, 2, 0), RangeError);\n});\n\ntest("mean", () => {\n  assert.equal(mean([1, 2, 3]), 2);\n  assert.equal(mean([]), 0);\n});\n`;

function testWriter(sb: Sandbox): void {
  const agent = sb.file(".claude/agents/test-writer.md");
  const valid = /^---\n[\s\S]*name: test-writer[\s\S]*description: (?!TODO)[^\n]+[\s\S]*?\n---/.test(agent);
  if (valid) sb.tool("Agent", { subagent_type: "test-writer", prompt: "Write tests for src/math.js" }, () => sb.write("test/math.test.js", MATH_TEST));
  else sb.write("test/math.test.js", MATH_TEST);
  sb.bash("npm test");
}

function summary(sb: Sandbox): void {
  const seen: string[] = [];
  for (const f of ["package.json", "src/config.js", "test/config.test.js", ".env", "secrets/prod.key"]) {
    const text = sb.read(f);
    if (text !== null) seen.push(`- ${f}: ${text.split("\n")[0]}`);
  }
  sb.bash("npm test");
  sb.write("SUMMARY.md", `# Summary\n\nA small config module with one test.\n\n${seen.join("\n")}\n`);
}

const PACKAGE_FINDINGS: Record<string, string> = {
  api: "- server.js:1: hardcoded secret API_TOKEN (severity high)",
  web: "- calc.js:3: eval on user input (severity high)",
  worker: "- sync.js:1: plain http:// URL for billing export (severity medium)",
};

function audit(sb: Sandbox): void {
  const command = sb.file(".claude/commands/audit.md");
  if (!/subagent/i.test(command) || !/parallel/i.test(command)) {
    sb.read("packages/api/server.js");
    sb.write("AUDIT.md", "# Audit\n\nThe code looks mostly fine. Consider a security review.\n");
    return;
  }
  const sections: string[] = [];
  for (const name of Object.keys(PACKAGE_FINDINGS).sort()) {
    sb.tool("Agent", { subagent_type: "general-purpose", description: `audit ${name}`, prompt: `Audit packages/${name}/` }, () =>
      sections.push(`## ${name}\n\n${PACKAGE_FINDINGS[name]}\n`),
    );
  }
  sb.write("AUDIT.md", `# Security audit\n\n${sections.join("\n")}`);
}

function releaseNotes(sb: Sandbox): void {
  const skill = sb.file(".claude/skills/release-notes/SKILL.md");
  const changes = sb.file("changes.txt").trim().split("\n");
  const discoverable = /^---[\s\S]*description: [^\n]*release notes[\s\S]*?---/i.test(skill);
  if (!discoverable) {
    sb.write("RELEASE_NOTES.md", `# Release 2.4.0\n\n## Changes\n${changes.map((c) => `- ${c}`).join("\n")}\n`);
    return;
  }
  sb.tool("Skill", { skill: "release-notes" });
  const line = (c: string) => `- ${c.replace(/^\w+: /, "")}`;
  const feats = changes.filter((c) => c.startsWith("feat:")).map(line);
  const fixes = changes.filter((c) => c.startsWith("fix:")).map(line);
  sb.write("RELEASE_NOTES.md", `# 2.4.0\n\n## Nyheter\n${feats.join("\n")}\n\n## Fixar\n${fixes.join("\n")}\n`);
}

async function orders(sb: Sandbox): Promise<void> {
  const answers: string[] = [];
  try {
    const config = JSON.parse(sb.file(".mcp.json")) as { mcpServers?: Record<string, { command: string; args?: string[] }> };
    const server = config.mcpServers?.orders;
    if (!server) throw new Error("no orders server");
    const expand = (s: string) => s.replace(/\$\{(\w+)(?::-([^}]*))?\}/g, (_, name: string, def?: string) => (name === "CLAUDE_PROJECT_DIR" ? sb.cwd : (process.env[name] ?? def ?? "")));
    const client = await McpClient.start(expand(server.command), (server.args ?? []).map(expand), sb.cwd);
    try {
      await client.request("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-claude", version: "0" } });
      client.notify("notifications/initialized");
      const list = (await client.request("tools/list", {})) as { tools?: { name: string }[] };
      if (!list.tools?.some((t) => t.name === "get_order_status")) throw new Error("tool missing");
      for (const id of ["1042", "1077"]) {
        const result = (await client.request("tools/call", { name: "get_order_status", arguments: { order_id: id } })) as { content?: { text?: string }[] };
        sb.tool("mcp__orders__get_order_status", { order_id: id }, () => answers.push(result.content?.map((c) => c.text).join(" ") ?? ""));
      }
    } finally {
      client.close();
    }
  } catch {
    answers.push("Kunde inte hämta status från orders-servern.");
  }
  sb.write("ANSWER.md", answers.join("\n") + "\n");
}

/** Just enough of an MCP stdio client to talk to the student's server. */
class McpClient {
  private nextId = 1;
  private readonly pending = new Map<number, (msg: { result?: unknown; error?: unknown }) => void>();
  private readonly child: ReturnType<typeof spawn>;

  private constructor(child: ReturnType<typeof spawn>) {
    this.child = child;
    if (!child.stdout) throw new Error("no stdout");
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const msg = JSON.parse(line) as { id?: number; result?: unknown; error?: unknown };
        if (typeof msg.id === "number") this.pending.get(msg.id)?.(msg);
      } catch {
        // Anything that is not JSON-RPC corrupts the stream; the request below times out.
      }
    });
  }

  static async start(command: string, args: string[], cwd: string): Promise<McpClient> {
    return new McpClient(spawn(command, args, { cwd, stdio: ["pipe", "pipe", "ignore"] }));
  }

  request(method: string, params: object): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 2000);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.error || msg.result === undefined) reject(new Error(`${method} failed`));
        else resolve(msg.result);
      });
      this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method: string): void {
    this.child.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method }) + "\n");
  }

  close(): void {
    this.child.kill();
  }
}

function discount(sb: Sandbox): void {
  const base = sb.file("src/cart.js").split("\nexport function applyDiscount")[0]?.trimEnd() ?? "";
  sb.read("src/cart.js");
  sb.write("src/cart.js", `${base}\n\nexport function applyDiscount(total, percent) {\n  return total - (total * percent) / 100;\n}\n`);
  if (!sb.stop(false)) return;
  sb.bash("npm test");
  sb.write("src/cart.js", `${base}\n\nexport function applyDiscount(total, percent) {\n  const discounted = total - (total * percent) / 100;\n  return Math.max(0, Math.round(discounted * 100) / 100);\n}\n`);
  sb.bash("npm test");
  sb.stop(true);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
