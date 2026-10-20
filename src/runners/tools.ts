import type Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { runCheck } from "../checks/index.ts";
import { caseInput } from "../core/exercise.ts";
import { addUsage, costUsd, ZERO_USAGE } from "../core/pricing.ts";
import type { CaseRun, Runner } from "./types.ts";

export const ToolsFileSchema = z
  .object({
    system: z.string().optional(),
    tools: z
      .array(
        z
          .object({
            name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/),
            description: z.string(),
            input_schema: z.object({ type: z.literal("object") }).loose(),
            strict: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/**
 * Sends each case with your tool definitions. The output checks see is JSON:
 * `{"tool": name | null, "input": {...}, "text": "..."}` for the first tool call.
 */
export const toolsRunner: Runner = async (exercise, solutionDir, deps) => {
  const file = ToolsFileSchema.parse(JSON.parse(await readFile(path.join(solutionDir, exercise.solution), "utf8")));
  let usage = ZERO_USAGE;
  let cost = 0;
  const runs: CaseRun[] = [];
  for (const c of exercise.cases) {
    const res = await deps.llm.send({
      model: exercise.model,
      max_tokens: 2048,
      ...(file.system ? { system: file.system } : {}),
      tools: file.tools as Anthropic.Tool[],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: await caseInput(exercise, c) }],
    });
    usage = addUsage(usage, res.usage);
    cost += costUsd(res.model, res.usage);
    const call = res.toolCalls[0];
    const output = JSON.stringify({ tool: call?.name ?? null, input: call?.input ?? null, text: res.text });
    runs.push({ name: c.name, output, checks: c.checks.map((check) => runCheck(check, { output })) });
  }
  return { cases: runs, usage, costUsd: cost, turns: exercise.cases.length, models: [exercise.model] };
};
