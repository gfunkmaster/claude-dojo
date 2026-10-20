import { spawn } from "node:child_process";
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

/** Headless Claude Code. Tests and CI use a fake instead of the real binary. */
export interface ClaudeCli {
  run(req: ClaudeRunRequest): Promise<ClaudeRunResult>;
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
});

export function parseClaudeJson(stdout: string): ClaudeRunResult {
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
  };
}

export class RealClaudeCli implements ClaudeCli {
  private readonly bin: string;

  constructor(bin = process.env.DOJO_CLAUDE_BIN ?? "claude") {
    this.bin = bin;
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
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { cwd: req.cwd, stdio: ["ignore", "pipe", "pipe"] });
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
    });
  }
}
