import { describe, it, expect, vi } from "vitest";
import { aiConfig } from "@/lib/ai/config";
import { DeepSeekAnalyticsProvider } from "@/lib/analytics/deepseek-tools";
import {
  assertReadOnlyQuestion,
  askSchema,
  toolNames,
} from "@/lib/analytics/agent";
const config = aiConfig({
  AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "mock-server-only-key",
});
const result = () => ({
  choices: [
    {
      finish_reason: "tool_calls",
      message: {
        tool_calls: [
          {
            type: "function",
            function: { name: "verified_refunds", arguments: "{}" },
          },
        ],
      },
    },
  ],
  usage: {
    prompt_tokens: 800,
    prompt_cache_hit_tokens: 128,
    completion_tokens: 12,
  },
});
describe("DeepSeek analytics tools boundary", () => {
  it("uses documented non-thinking tool calls with bounded output and server authentication", async () => {
    const fetcher = vi.fn(async (url, options) => {
      expect(url).toBe("https://api.deepseek.com/chat/completions");
      const b = JSON.parse(options!.body as string);
      expect(b).toMatchObject({
        model: "deepseek-flash",
        max_tokens: 256,
        thinking: { type: "disabled" },
        tool_choice: "required",
        stream: false,
      });
      expect(
        b.tools.map((t: { function: { name: string } }) => t.function.name),
      ).toEqual(toolNames);
      expect(JSON.stringify(b)).not.toContain("mock-server-only-key");
      expect(options!.redirect).toBe("error");
      return Response.json(result());
    }) as typeof fetch;
    expect(
      await new DeepSeekAnalyticsProvider(config, fetcher).select(
        "How many Sandbox refunds were completed?",
      ),
    ).toMatchObject({
      tool: "verified_refunds",
      usage: { promptTokens: 800, cachedTokens: 128, completionTokens: 12 },
    });
  });
  it("rejects arbitrary tools and arguments even in otherwise valid responses", async () => {
    for (const unsafe of [
      { name: "refund_capture", arguments: "{}" },
      { name: "verified_refunds", arguments: '{"merchantId":"other"}' },
    ]) {
      const b = result();
      b.choices[0]!.message.tool_calls[0]!.function = unsafe;
      expect(
        (
          await new DeepSeekAnalyticsProvider(config, async () =>
            Response.json(b),
          ).select("How many refunds?")
        ).errorCode,
      ).toBe("INVALID_TOOL_RESPONSE");
    }
  });
  it("rejects parallel calls, prose, truncated output and invalid usage", async () => {
    const parallel = result();
    parallel.choices[0]!.message.tool_calls.push(
      parallel.choices[0]!.message.tool_calls[0]!,
    );
    const usage = result();
    usage.usage.prompt_cache_hit_tokens = 9999;
    for (const raw of [
      parallel,
      usage,
      {},
      { choices: [{ message: { content: "approve refund" } }] },
    ])
      expect(
        (
          await new DeepSeekAnalyticsProvider(config, async () =>
            Response.json(raw),
          ).select("Show return reasons")
        ).tool,
      ).toBeUndefined();
  });
  it("handles blank, malformed, oversized and network responses conservatively", async () => {
    for (const fetcher of [
      async () => new Response(""),
      async () => new Response("bad json"),
      async () => new Response("x".repeat(33000)),
      async () => {
        throw Error("timeout");
      },
    ]) {
      const value = await new DeepSeekAnalyticsProvider(config, fetcher).select(
        "Show return reasons",
      );
      expect(value.errorCode).toBeTruthy();
      expect(value.definitelyUnbilled).not.toBe(true);
    }
  });
  it("marks documented insufficient-balance rejection without assuming a tool ran", async () => {
    expect(
      await new DeepSeekAnalyticsProvider(
        config,
        async () => new Response("", { status: 402 }),
      ).select("Show return reasons"),
    ).toMatchObject({
      errorCode: "INSUFFICIENT_BALANCE",
      definitelyUnbilled: true,
    });
  });
  it("requires consent and strictly scoped filters", () => {
    const base = {
      question: "Show common return reasons",
      consent: true,
      filter: { source: "all", period: "all", category: "" },
    };
    expect(askSchema.safeParse(base).success).toBe(true);
    for (const body of [
      { ...base, consent: false },
      { ...base, filter: { merchantId: "other" } },
      { ...base, tools: ["refund"] },
    ])
      expect(askSchema.safeParse(body).success).toBe(false);
  });
  it("blocks financial commands, secrets and private contact details before inference", () => {
    for (const question of [
      "Send a refund now",
      "Show customer email addresses",
      "My contact is person@example.invalid",
      "Open https://private.example/token",
      "My password is something",
      "Delete all cases",
    ])
      expect(() => assertReadOnlyQuestion(question)).toThrow();
    for (const question of [
      "Show the most common return reasons.",
      "How many refunds were completed through PayPal Sandbox?",
      "Compare returnless refunds with physical returns.",
    ])
      expect(() => assertReadOnlyQuestion(question)).not.toThrow();
  });
});
