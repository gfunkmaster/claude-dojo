import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { TokenUsage } from "../core/pricing.ts";

export interface ClaudeRunRequest {
  cwd: string;
  prompt: string;
  maxBudgetUsd: number;
  allowedTools: string[];
}

export interface ClaudeRunResult {
  result: string;
  isError: boolean;
  turns: number;
  costUsd: number;
  usage: TokenUsage;
  models: string[];
}

/** One model turn with no tools, for prompt exercises and the judge on a Claude subscription. */
export interface ClaudeAskRequest {
  model: string;
  /** Replaces Claude Code's own system prompt. */
  system: string;
  prompt: string;
  /** JSON Schema for structured output (`--json-schema`). */
  jsonSchema?: object;
  effort?: "low" | "medium" | "high";
}

export interface ClaudeAskResult extends ClaudeRunResult {
  /** The validated object when a JSON Schema was given and Claude Code returned one. */
  structuredOutput?: unknown;
}

/** Headless Claude Code. Tests and CI use a fake instead of the real binary. */
export interface ClaudeCli {
  run(req: ClaudeRunRequest): Promise<ClaudeRunResult>;
  ask(req: ClaudeAskRequest): Promise<ClaudeAskResult>;
}

const ResultJson = z.object({
  result: z.string().default(""),
  is_error: z.boolean().default(false),
  num_turns: z.number().default(0),
  total_cost_usd: z.number().default(0),
  usage: z
    .object({
      input_tokens: z.number().default(0),
      output_tokens: z.number().default(0),
      cache_read_input_tokens: z.number().default(0),
      cache_creation_input_tokens: z.number().default(0),
    })
    .default({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }),
  modelUsage: z.record(z.string(), z.unknown()).default({}),
  structured_output: z.unknown().optional(),
});

export function parseClaudeJson(stdout: string): ClaudeAskResult {
  const json = ResultJson.parse(JSON.parse(stdout));
  return {
    result: json.result,
    isError: json.is_error,
    turns: json.num_turns,
    costUsd: json.total_cost_usd,
    usage: {
      inputTokens: json.usage.input_tokens,
      outputTokens: json.usage.output_tokens,
      cacheReadTokens: json.usage.cache_read_input_tokens,
      cacheWriteTokens: json.usage.cache_creation_input_tokens,
    },
    models: Object.keys(json.modelUsage),
    ...(json.structured_output === undefined ? {} : { structuredOutput: json.structured_output }),
  };
}

export interface RealClaudeCliOptions {
  bin?: string;
  /**
   * Drop ANTHROPIC_API_KEY from the child's environment, so `claude` uses the
   * subscription you signed in with instead of billing the API.
   */
  subscription?: boolean;
}

export class RealClaudeCli implements ClaudeCli {
  private readonly bin: string;
  private readonly subscription: boolean;

  constructor(opts: RealClaudeCliOptions = {}) {
    this.bin = opts.bin ?? process.env.DOJO_CLAUDE_BIN ?? "claude";
    this.subscription = opts.subscription ?? false;
  }

  run(req: ClaudeRunRequest): Promise<ClaudeRunResult> {
    const args = [
      "-p",
      req.prompt,
      "--output-format",
      "json",
      "--max-budget-usd",
      String(req.maxBudgetUsd),
      // Only the sandbox's own settings count, so your personal hooks can't help or hurt.
      "--setting-sources",
      "project,local",
      "--permission-mode",
      "acceptEdits",
    ];
    if (req.allowedTools.length > 0) args.push("--allowedTools", ...req.allowedTools);
    return this.spawn(args, req.cwd);
  }

  async ask(req: ClaudeAskRequest): Promise<ClaudeAskResult> {
    // An empty folder as cwd, so no project CLAUDE.md or settings leak into the prompt.
    const dir = await mkdtemp(path.join(tmpdir(), "dojo-ask-"));
    try {
      const systemFile = path.join(dir, "system.md");
      await writeFile(systemFile, req.system);
      return await this.spawn(askArgs(req, systemFile), dir, req.prompt, ASK_ENV);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private spawn(args: string[], cwd: string, stdin?: string, extraEnv: Record<string, string> = {}): Promise<ClaudeAskResult> {
    const env = { ...process.env, ...extraEnv };
    if (this.subscription) delete env.ANTHROPIC_API_KEY;
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
      child.on("error", (err) => reject(new Error(`could not start ${this.bin}: ${err.message}`)));
      child.on("close", (code) => {
        try {
          resolve(parseClaudeJson(stdout));
        } catch {
          reject(new Error(`${this.bin} exited ${code} without JSON output: ${stderr.trim().slice(-500)}`));
        }
      });
      child.stdin.on("error", () => {}); // a child that exits early must not crash Dojo with EPIPE
      child.stdin.end(stdin ?? "");
    });
  }
}

/** Keeps your CLAUDE.md files and auto memory out of a prompt exercise or the judge. */
const ASK_ENV: Record<string, string> = { CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };

/** Arguments for a single tool-free turn; the prompt itself goes in on stdin. */
export function askArgs(req: ClaudeAskRequest, systemFile: string): string[] {
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    req.model,
    "--system-prompt-file",
    systemFile,
    "--setting-sources",
    "project,local",
    "--strict-mcp-config",
    "--disable-slash-commands",
    "--no-session-persistence",
    "--tools",
    "",
  ];
  if (req.effort) args.push("--effort", req.effort);
  if (req.jsonSchema) args.push("--json-schema", JSON.stringify(req.jsonSchema));
  return args;
}
