import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { TokenUsage } from "../core/pricing.ts";

export interface CompleteRequest {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}

export interface CompleteResponse {
  text: string;
  usage: TokenUsage;
}

export interface StructuredRequest<T extends z.ZodType> {
  model: string;
  /** Stable part of the prompt, cached across runs. */
  system: string;
  user: string;
  schema: T;
}

export interface StructuredResponse<T> {
  value: T;
  usage: TokenUsage;
}

export interface ToolCall {
  name: string;
  input: unknown;
}

export interface SendResponse {
  text: string;
  toolCalls: ToolCall[];
  /** The model that actually answered, for pricing. */
  model: string;
  usage: TokenUsage;
}

/** Every call to the Anthropic API goes through this, so tests can swap in a fake. */
export interface LlmClient {
  complete(req: CompleteRequest): Promise<CompleteResponse>;
  /** A raw Messages API request, for exercises where the request itself is the solution. */
  send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<SendResponse>;
  structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>>;
}

function toUsage(u: Anthropic.Usage): TokenUsage {
  return {
    inputTokens: u.input_tokens,
    outputTokens: u.output_tokens,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
  };
}

export class AnthropicLlmClient implements LlmClient {
  private readonly client: Anthropic;

  constructor(client = new Anthropic()) {
    this.client = client;
  }

  async complete(req: CompleteRequest): Promise<CompleteResponse> {
    const msg = await this.client.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    if (msg.stop_reason === "refusal") throw new Error(`model refused: ${req.model}`);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, usage: toUsage(msg.usage) };
  }

  async send(params: Anthropic.MessageCreateParamsNonStreaming): Promise<SendResponse> {
    const msg = await this.client.messages.create(params);
    if (msg.stop_reason === "refusal") throw new Error(`model refused: ${params.model}`);
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const toolCalls = msg.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ name: b.name, input: b.input }));
    return { text, toolCalls, model: msg.model, usage: toUsage(msg.usage) };
  }

  async structured<T extends z.ZodType>(req: StructuredRequest<T>): Promise<StructuredResponse<z.infer<T>>> {
    const msg = await this.client.messages.parse({
      model: req.model,
      max_tokens: 16000,
      system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: req.user }],
      output_config: { effort: "medium", format: zodOutputFormat(req.schema) },
    });
    if (msg.stop_reason === "refusal") throw new Error(`model refused: ${req.model}`);
    if (msg.parsed_output == null) throw new Error("structured response could not be parsed");
    return { value: msg.parsed_output as z.infer<T>, usage: toUsage(msg.usage) };
  }
}
