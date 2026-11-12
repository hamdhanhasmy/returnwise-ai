import { z } from "zod";
import type { AiConfig } from "@/lib/ai/config";
import type { Usage } from "@/lib/ai/cost";
import {
  AGENT_SYSTEM,
  analyticsTools,
  MAX_AGENT_OUTPUT,
  toolNames,
  type AnalyticsTool,
} from "./agent";
export type ToolSelection = {
  tool?: AnalyticsTool;
  usage?: Usage;
  errorCode?: string;
  definitelyUnbilled?: boolean;
  latencyMs: number;
};
export interface AnalyticsProvider {
  select(question: string): Promise<ToolSelection>;
}
const count = z.number().int().min(0).max(100000);
export class DeepSeekAnalyticsProvider implements AnalyticsProvider {
  constructor(
    readonly config: AiConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  async select(question: string): Promise<ToolSelection> {
    const start = Date.now();
    let usage: Usage | undefined;
    try {
      const response = await this.fetcher(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(20000),
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            thinking: { type: "disabled" },
            max_tokens: MAX_AGENT_OUTPUT,
            stream: false,
            tool_choice: "required",
            tools: analyticsTools,
            messages: [
              { role: "system", content: AGENT_SYSTEM },
              { role: "user", content: question },
            ],
          }),
        },
      );
      if (!response.ok)
        return {
          latencyMs: Date.now() - start,
          errorCode:
            response.status === 402
              ? "INSUFFICIENT_BALANCE"
              : "PROVIDER_UNAVAILABLE",
          definitelyUnbilled: [400, 401, 402, 422, 429].includes(
            response.status,
          ),
        };
      const reader = response.body?.getReader();
      if (!reader) throw Error("blank");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.byteLength;
          if (size > 32768) {
            await reader.cancel();
            throw Error("large");
          }
          chunks.push(r.value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const u = z
        .object({
          prompt_tokens: count,
          completion_tokens: count.max(MAX_AGENT_OUTPUT),
          prompt_cache_hit_tokens: count.optional(),
          prompt_tokens_details: z
            .object({ cached_tokens: count.optional() })
            .optional(),
        })
        .parse(raw.usage);
      const cached =
        u.prompt_cache_hit_tokens ??
        u.prompt_tokens_details?.cached_tokens ??
        0;
      if (cached > u.prompt_tokens) throw Error("usage");
      usage = {
        promptTokens: u.prompt_tokens,
        completionTokens: u.completion_tokens,
        cachedTokens: cached,
      };
      const call = z
        .object({
          choices: z
            .array(
              z.object({
                finish_reason: z.literal("tool_calls"),
                message: z.object({
                  tool_calls: z
                    .array(
                      z.object({
                        type: z.literal("function"),
                        function: z.object({
                          name: z.enum(toolNames),
                          arguments: z.string().max(100),
                        }),
                      }),
                    )
                    .length(1),
                }),
              }),
            )
            .length(1),
        })
        .parse(raw).choices[0]!.message.tool_calls[0]!;
      z.object({}).strict().parse(JSON.parse(call.function.arguments));
      return { tool: call.function.name, usage, latencyMs: Date.now() - start };
    } catch {
      return {
        usage,
        errorCode: usage
          ? "INVALID_TOOL_RESPONSE"
          : "NETWORK_OR_RESPONSE_UNKNOWN",
        latencyMs: Date.now() - start,
      };
    }
  }
}
