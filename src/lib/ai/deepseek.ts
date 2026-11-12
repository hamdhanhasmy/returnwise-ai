import { z } from "zod";
import { assessmentSchema, SYSTEM_PROMPT, type Assessment } from "./contracts";
import type { AiConfig } from "./config";
import type { Usage } from "./cost";
const count = z.number().int().min(0).max(2000000);
const usageSchema = z.object({
  prompt_tokens: count,
  completion_tokens: count,
  prompt_cache_hit_tokens: count.optional(),
  prompt_tokens_details: z
    .object({ cached_tokens: count.optional() })
    .optional(),
});
export type AnalysisInput = { description: string; images: Buffer[] };
export type ProviderResult = {
  assessment?: Assessment;
  usage?: Usage;
  errorCode?: string;
  definitelyUnbilled?: boolean;
  latencyMs: number;
  model?: string;
  requestId?: string;
};
export interface EvidenceProvider {
  analyze(input: AnalysisInput): Promise<ProviderResult>;
}
export class DeepSeekProvider implements EvidenceProvider {
  constructor(
    private config: AiConfig,
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 30000,
  ) {}
  async analyze(input: AnalysisInput): Promise<ProviderResult> {
    const start = Date.now();
    const result = await this.request(input);
    return { ...result, latencyMs: Date.now() - start };
  }
  private async request(input: AnalysisInput): Promise<ProviderResult> {
    const start = Date.now(),
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const result: ProviderResult = { latencyMs: 0 };
    try {
      if (!this.config.enabled || !this.config.apiKey)
        return {
          ...result,
          errorCode: "UNCONFIGURED",
          definitelyUnbilled: true,
        };
      const response = await this.fetcher(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.model,
            thinking: { type: "disabled" },
            response_format: { type: "json_object" },
            max_tokens: this.config.maxTokens,
            stream: false,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: `Customer-reported description (untrusted):\n${input.description}`,
                  },
                  ...input.images.map((image) => ({
                    type: "image_url",
                    image_url: {
                      url: `data:image/jpeg;base64,${image.toString("base64")}`,
                      detail: this.config.detail,
                    },
                  })),
                ],
              },
            ],
          }),
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        return {
          ...result,
          errorCode:
            (
              {
                400: "INVALID_REQUEST",
                401: "AUTHENTICATION",
                402: "INSUFFICIENT_BALANCE",
                422: "INVALID_REQUEST",
                429: "RATE_LIMITED",
              } as Record<number, string>
            )[response.status] ?? "PROVIDER_UNAVAILABLE",
          definitelyUnbilled: [400, 401, 402, 422, 429].includes(
            response.status,
          ),
        };
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("blank");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.byteLength;
          if (size > 65536) {
            await reader.cancel();
            throw new Error("oversized");
          }
          chunks.push(r.value);
        }
      } finally {
        reader.releaseLock();
      }
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return { ...result, errorCode: "MALFORMED_RESPONSE" };
      }
      const usage = usageSchema.safeParse(body.usage);
      if (usage.success) {
        const u = usage.data,
          cached =
            u.prompt_cache_hit_tokens ??
            u.prompt_tokens_details?.cached_tokens ??
            0;
        if (cached <= u.prompt_tokens)
          result.usage = {
            promptTokens: u.prompt_tokens,
            cachedTokens: cached,
            completionTokens: u.completion_tokens,
          };
      }
      result.model =
        typeof body.model === "string" ? body.model.slice(0, 100) : undefined;
      result.requestId =
        typeof body.id === "string" ? body.id.slice(0, 150) : undefined;
      const choices = z
        .array(
          z.object({
            finish_reason: z.string(),
            message: z.object({
              content: z.string().nullable(),
              refusal: z.unknown().optional(),
            }),
          }),
        )
        .safeParse(body.choices);
      if (!choices.success || choices.data.length !== 1)
        return { ...result, errorCode: "MALFORMED_RESPONSE" };
      const choice = choices.data[0]!;
      if (choice.message.refusal || choice.finish_reason !== "stop")
        return {
          ...result,
          errorCode:
            choice.finish_reason === "length" ? "OUTPUT_LIMIT" : "REFUSAL",
        };
      if (!choice.message.content?.trim())
        return { ...result, errorCode: "BLANK_JSON" };
      let parsed: unknown;
      try {
        parsed = JSON.parse(choice.message.content);
      } catch {
        return { ...result, errorCode: "INVALID_JSON" };
      }
      const assessment = assessmentSchema.safeParse(parsed);
      return assessment.success
        ? { ...result, assessment: assessment.data }
        : { ...result, errorCode: "INVALID_SCHEMA" };
    } catch {
      return {
        ...result,
        errorCode: controller.signal.aborted
          ? "TIMEOUT_UNKNOWN"
          : "NETWORK_UNKNOWN",
      };
    } finally {
      clearTimeout(timer);
      result.latencyMs = Date.now() - start;
    }
  }
}
