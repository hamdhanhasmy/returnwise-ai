import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { aiConfig } from "@/lib/ai/config";
import { assessmentSchema } from "@/lib/ai/contracts";
import { estimatedCost, reservation } from "@/lib/ai/cost";
import { DeepSeekProvider } from "@/lib/ai/deepseek";
import { normalizeEvidence, MAX_UPLOAD_BYTES } from "@/lib/ai/images";
import {
  mockAssessment,
  syntheticImage,
  evidenceScenarios,
} from "../fixtures/evidence";
const config = aiConfig({
  AI_ENABLED: "true",
  DEEPSEEK_API_KEY: "synthetic-test-key",
});
const response = (content: unknown = JSON.stringify(mockAssessment)) => ({
  id: "synthetic",
  model: "deepseek-flash",
  choices: [{ finish_reason: "stop", message: { content } }],
  usage: {
    prompt_tokens: 200,
    completion_tokens: 100,
    prompt_cache_hit_tokens: 50,
  },
});
describe("DeepSeek adapter and privacy boundaries", () => {
  it("uses fixed OpenAI-compatible vision JSON, non-thinking, bounded output and no tools", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(response())));
    const result = await new DeepSeekProvider(config, fetcher).analyze({
      description: "Untrusted claim",
      images: [Buffer.from("synthetic")],
    });
    const [url, options] = fetcher.mock.calls[0]!,
      body = JSON.parse(String(options?.body));
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(options?.redirect).toBe("error");
    expect(body).toMatchObject({
      model: "deepseek-flash",
      thinking: { type: "disabled" },
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
    expect(body.tools).toBeUndefined();
    expect(body.messages[1].content[1].image_url.url).toMatch(
      /^data:image\/jpeg;base64,/,
    );
    expect(result.assessment).toEqual(mockAssessment);
    expect(result.usage).toEqual({
      promptTokens: 200,
      cachedTokens: 50,
      completionTokens: 100,
    });
  });
  it.each([
    ["   ", "BLANK_JSON"],
    ["not json", "INVALID_JSON"],
    [
      JSON.stringify({ ...mockAssessment, refundAmount: 100 }),
      "INVALID_SCHEMA",
    ],
    [
      JSON.stringify({ ...mockAssessment, requiresHumanReview: false }),
      "INVALID_SCHEMA",
    ],
  ])("handles malformed/blank/unsafe response %s", async (content, code) => {
    const r = await new DeepSeekProvider(
      config,
      async () => new Response(JSON.stringify(response(content))),
    ).analyze({ description: "claim", images: [] });
    expect(r.errorCode).toBe(code);
    expect(r.usage?.promptTokens).toBe(200);
  });
  it.each([
    [401, "AUTHENTICATION"],
    [402, "INSUFFICIENT_BALANCE"],
    [429, "RATE_LIMITED"],
    [503, "PROVIDER_UNAVAILABLE"],
  ])("maps HTTP %i safely", async (status, code) => {
    const r = await new DeepSeekProvider(
      config,
      async () =>
        new Response("private provider error", { status: status as number }),
    ).analyze({ description: "claim", images: [] });
    expect(r.errorCode).toBe(code);
    expect(JSON.stringify(r)).not.toContain("private");
  });
  it("handles timeout without an implicit retry", async () => {
    const fetcher = vi.fn<typeof fetch>(
      (_, o) =>
        new Promise((_, reject) =>
          o?.signal?.addEventListener("abort", () => reject(Error("abort"))),
        ),
    );
    const r = await new DeepSeekProvider(config, fetcher, 5).analyze({
      description: "claim",
      images: [],
    });
    expect(r.errorCode).toBe("TIMEOUT_UNKNOWN");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles truncated and refused completions", async () => {
    for (const finish of ["length", "content_filter"]) {
      const b = response();
      b.choices[0]!.finish_reason = finish;
      const r = await new DeepSeekProvider(
        config,
        async () => new Response(JSON.stringify(b)),
      ).analyze({ description: "claim", images: [] });
      expect(r.assessment).toBeUndefined();
    }
  });
  it("does not send without server configuration", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(
      (
        await new DeepSeekProvider(aiConfig({}), fetcher).analyze({
          description: "claim",
          images: [],
        })
      ).errorCode,
    ).toBe("UNCONFIGURED");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects alternate hosts/models and malformed budgets", () => {
    for (const env of [
      { DEEPSEEK_BASE_URL: "https://evil.example" },
      { DEEPSEEK_MODEL: "other" },
      { AI_SPENDING_CAP_USD: "-1" },
      { AI_MAX_OUTPUT_TOKENS: "100000" },
    ])
      expect(() => aiConfig(env)).toThrow();
  });
  it("only accepts observation fields and always requires human review", () => {
    expect(
      assessmentSchema.safeParse({ ...mockAssessment, approved: true }).success,
    ).toBe(false);
  });
  it("computes integer costs with cached tokens and conservative reservations", () => {
    expect(
      estimatedCost({
        promptTokens: 200,
        cachedTokens: 50,
        completionTokens: 100,
      }),
    ).toBe(165300n);
    expect(reservation("claim", 3, 1200)).toBeGreaterThan(165300n);
  });
});
describe("private image validation", () => {
  it("decodes, strips metadata and creates a bounded non-cropped inference image", async () => {
    const b = await sharp(await syntheticImage())
      .withMetadata({ orientation: 1 })
      .jpeg()
      .toBuffer();
    const n = await normalizeEvidence(b, "image/jpeg"),
      m = await sharp(n.image).metadata();
    expect(m.exif).toBeUndefined();
    expect(m.icc).toBeUndefined();
    expect(m.width).toBe(600);
    expect(n.contentHash).toHaveLength(64);
    expect((await sharp(n.inferenceImage).metadata()).format).toBe("jpeg");
  });
  it("rejects SVG, MIME mismatch, invalid bytes, oversize and small dimensions", async () => {
    for (const [buffer, mime] of [
      [
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
        ),
        "image/svg+xml",
      ],
      [await syntheticImage(), "image/jpeg"],
      [Buffer.from("junk"), "image/png"],
      [Buffer.alloc(MAX_UPLOAD_BYTES + 1), "image/png"],
      [
        await sharp({
          create: { width: 10, height: 10, channels: 3, background: "white" },
        })
          .png()
          .toBuffer(),
        "image/png",
      ],
    ] as [Buffer, string][])
      await expect(normalizeEvidence(buffer, mime)).rejects.toThrow();
  });
  it("provides twenty deterministic labeled synthetic scenarios", async () => {
    expect(evidenceScenarios).toHaveLength(20);
    expect(new Set(evidenceScenarios.map((s) => s.id)).size).toBe(20);
    expect(await syntheticImage("broken")).toEqual(
      await syntheticImage("broken"),
    );
  });
});
