import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Check } from "../core/exercise.ts";

export interface CheckContext {
  /** Model output for prompt cases. */
  output?: string;
  /** Sandbox folder for env cases. */
  cwd?: string;
  turns?: number;
  costUsd?: number;
  /** Cache-read input tokens for this case (request exercises). */
  cacheReadTokens?: number;
}

export interface CheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

export function describeCheck(check: Check): string {
  switch (check.kind) {
    case "json-valid":
      return "json-valid";
    case "json-path":
      return `json-path ${check.path} == ${JSON.stringify(check.equals)}`;
    case "regex":
      return `${check.negate ? "not " : ""}regex /${check.pattern}/${check.flags ?? ""}`;
    case "command":
      return `command \`${check.run}\` exits ${check.exitCode}`;
    case "file-exists":
      return `${check.negate ? "no " : ""}file ${check.path}`;
    case "file-contains":
      return `file ${check.path} ${check.negate ? "does not match" : "matches"} /${check.pattern}/`;
    case "min-cache-read":
      return `reads at least ${check.tokens} tokens from cache`;
    case "max-turns":
      return `at most ${check.value} turns`;
    case "max-cost":
      return `at most $${check.usd}`;
  }
}

export function runCheck(check: Check, ctx: CheckContext): CheckResult {
  const result = (passed: boolean, detail = ""): CheckResult => ({ check: describeCheck(check), passed, detail });
  switch (check.kind) {
    case "json-valid": {
      const parsed = parseJson(ctx.output);
      return result(parsed.ok, parsed.ok ? "" : parsed.error);
    }
    case "json-path": {
      const parsed = parseJson(ctx.output);
      if (!parsed.ok) return result(false, parsed.error);
      const actual = getPath(parsed.value, check.path);
      const passed = deepEqual(actual, check.equals);
      return result(passed, passed ? "" : `got ${JSON.stringify(actual)}`);
    }
    case "regex": {
      const matched = new RegExp(check.pattern, check.flags).test(ctx.output ?? "");
      return result(matched !== check.negate);
    }
    case "command": {
      const cwd = requireCwd(ctx);
      const proc = spawnSync(check.run, { cwd, shell: true, encoding: "utf8", timeout: 120_000, env: cleanEnv() });
      const code = proc.status ?? -1;
      const passed = code === check.exitCode;
      return result(passed, passed ? "" : `exit ${code}: ${tail(proc.stdout + proc.stderr)}`);
    }
    case "file-exists": {
      const exists = existsSync(path.join(requireCwd(ctx), check.path));
      return result(exists !== check.negate);
    }
    case "file-contains": {
      const file = path.join(requireCwd(ctx), check.path);
      if (!existsSync(file)) return result(check.negate, "file missing");
      return result(new RegExp(check.pattern).test(readFileSync(file, "utf8")) !== check.negate);
    }
    case "min-cache-read": {
      const read = ctx.cacheReadTokens ?? 0;
      return result(read >= check.tokens, `${read} tokens read from cache`);
    }
    case "max-turns": {
      const turns = ctx.turns ?? 0;
      return result(turns <= check.value, `${turns} turns`);
    }
    case "max-cost": {
      const cost = ctx.costUsd ?? 0;
      return result(cost <= check.usd, `$${cost.toFixed(4)}`);
    }
  }
}

/** Node's test runner leaks NODE_TEST_CONTEXT, which makes a nested `node --test` report to the parent and exit 0. */
export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function requireCwd(ctx: CheckContext): string {
  if (!ctx.cwd) throw new Error("this check needs a sandbox folder (env exercises only)");
  return ctx.cwd;
}

type Parsed = { ok: true; value: unknown } | { ok: false; error: string };

/** Accepts bare JSON or JSON inside a single ```json fence, which models often add. */
export function parseJson(text: string | undefined): Parsed {
  const raw = (text ?? "").trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(raw);
  try {
    return { ok: true, value: JSON.parse(fenced?.[1] ?? raw) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "invalid JSON" };
  }
}

/** Minimal JSONPath: `$.a.b[0].c`. */
export function getPath(value: unknown, jsonPath: string): unknown {
  const parts = jsonPath
    .replace(/^\$\.?/, "")
    .split(/\.|\[(\d+)\]/)
    .filter((p) => p !== undefined && p !== "");
  let current: unknown = value;
  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function tail(text: string, max = 300): string {
  const t = text.trim();
  return t.length > max ? `…${t.slice(-max)}` : t;
}
