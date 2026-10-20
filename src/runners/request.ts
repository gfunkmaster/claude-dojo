import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { runCheck } from "../checks/index.ts";
import { caseInput, type Exercise } from "../core/exercise.ts";
import { addUsage, costUsd, PRICES, ZERO_USAGE } from "../core/pricing.ts";
import type { CaseRun, Runner } from "./types.ts";

export const MAX_TOKENS_CAP = 16000;

export const RequestFileSchema = z
  .object({
    model: z.string().refine((m) => m in PRICES, { message: `model must be one of: ${Object.keys(PRICES).join(", ")}` }),
    max_tokens: z.number().int().positive().max(MAX_TOKENS_CAP),
    stream: z.literal(false).optional(),
  })
  .loose();

const PLACEHOLDER = /\{\{(input|file:([^}]+))\}\}/g;

/** Replaces `{{input}}` with the case input and `{{file:path}}` with a file from the exercise folder. */
export async function fillTemplate(value: unknown, exercise: Exercise, input: string): Promise<unknown> {
  if (typeof value === "string") {
    let out = value;
    for (const match of value.matchAll(PLACEHOLDER)) {
      const replacement = match[2] ? await readFile(path.join(exercise.dir, match[2]), "utf8") : input;
      out = out.replace(match[0], () => replacement);
    }
    return out;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => fillTemplate(v, exercise, input)));
  if (value && typeof value === "object") {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await fillTemplate(v, exercise, input)] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

/**
 * Your solution is a Messages API request body. It is sent once per case, in
 * order, so caching across cases works the way it would in production.
 */
export const requestRunner: Runner = async (exercise, solutionDir, deps) => {
  const template = RequestFileSchema.parse(JSON.parse(await readFile(path.join(solutionDir, exercise.solution), "utf8")));
  let usage = ZERO_USAGE;
  let cost = 0;
  const models = new Set<string>();
  const runs: CaseRun[] = [];
  for (const c of exercise.cases) {
    const input = await caseInput(exercise, c);
    const body = (await fillTemplate(template, exercise, input)) as Record<string, unknown>;
    if (!body.messages) body.messages = [{ role: "user", content: input }];
    const res = await deps.llm.send(body as unknown as Anthropic.MessageCreateParamsNonStreaming);
    const caseCost = costUsd(res.model, res.usage);
    usage = addUsage(usage, res.usage);
    cost += caseCost;
    models.add(res.model);
    const ctx = { output: res.text, costUsd: caseCost, cacheReadTokens: res.usage.cacheReadTokens };
    runs.push({
      name: c.name,
      output: `${res.text}\n\n(model ${res.model}, ${res.usage.inputTokens} in, ${res.usage.outputTokens} out, ${res.usage.cacheReadTokens} cache read, ${res.usage.cacheWriteTokens} cache write, $${caseCost.toFixed(5)})`,
      checks: c.checks.map((check) => runCheck(check, ctx)),
    });
  }
  return { cases: runs, usage, costUsd: cost, turns: exercise.cases.length, models: [...models] };
};
