import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ClaudeCli } from "./claude-cli.ts";
import type {
  CompleteRequest,
  CompleteResponse,
  LlmClient,
  SendResponse,
  StructuredRequest,
  StructuredResponse,
} from "./client.ts";

/** Pulls a JSON value out of a reply that may wrap it in a code fence or a sentence. */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(text);
  const body = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("no JSON object in the reply");
    return JSON.parse(body.slice(start, end + 1));
  }
}

/**
 * LlmClient on top of `claude -p`, so prompt exercises and the judge run on a
 * Claude subscription instead of API credits. Tokens are reported from Claude
 * Code's JSON output; the cost Dojo prints is the API list price for them.
 */
export class ClaudeCliLlmClient implements LlmClient {
  private readonly cli: ClaudeCli;

  constructor(cli: ClaudeCli) {
    this.cli = cli;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const res = await this.cli.ask({ model: req.model, system: req.system, prompt: req.user });
    if (res.isError) throw new Error(`claude -p failed: ${res.result.slice(0, 500)}`);
    return { text: res.result, usage: res.usage };
  }

  send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<SendResponse> {
    return Promise.reject(
      new Error(
        `tools and request exercises send a raw Messages API request (${params.model}), which needs the API backend: set ANTHROPIC_API_KEY and DOJO_BACKEND=api`,
      ),
    );
  }

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    // Claude Code's validator rejects zod's draft 2020-12 `$schema` URI, and the shape needs no draft marker.
    const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(req.schema) };
    delete jsonSchema.$schema;
    // --json-schema should enforce the shape; the instruction is a fallback if it only comes back as text.
    const prompt = `${req.user}\n\nAnswer with only a JSON object that matches this JSON Schema:\n${JSON.stringify(jsonSchema)}`;
    const res = await this.cli.ask({ model: req.model, system: req.system, prompt, jsonSchema, effort: "medium" });
    if (res.isError) throw new Error(`claude -p failed: ${res.result.slice(0, 500)}`);
    const raw = res.structuredOutput ?? extractJson(res.result);
    return { value: req.schema.parse(raw), usage: res.usage };
  }
}
