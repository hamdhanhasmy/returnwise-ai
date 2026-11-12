import { z } from "zod";
const schema = z.object({
  AI_ENABLED: z.enum(["true", "false"]).default("false"),
  DEEPSEEK_API_KEY: z.string().trim().min(10).optional(),
  DEEPSEEK_BASE_URL: z
    .literal("https://api.deepseek.com")
    .default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: z.literal("deepseek-flash").default("deepseek-flash"),
  DEEPSEEK_IMAGE_DETAIL: z.enum(["low", "high", "auto"]).default("high"),
  AI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(512)
    .max(1400)
    .default(1200),
  AI_SPENDING_CAP_USD: z
    .string()
    .regex(/^(0|[1-9]\d{0,2})(\.\d{1,6})?$/)
    .default("0.25"),
});
export function usdToNano(value: string) {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 1000000000n + BigInt(fraction.padEnd(9, "0"));
}
export function aiConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const parsed = schema.safeParse({
    ...env,
    DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY || undefined,
  });
  if (!parsed.success)
    throw new Error(
      "Invalid AI configuration; check enabled flag, fixed DeepSeek endpoint/model, detail, output and spending limits.",
    );
  const c = parsed.data;
  return {
    enabled: c.AI_ENABLED === "true",
    apiKey: c.DEEPSEEK_API_KEY,
    baseUrl: c.DEEPSEEK_BASE_URL,
    model: c.DEEPSEEK_MODEL,
    detail: c.DEEPSEEK_IMAGE_DETAIL,
    maxTokens: c.AI_MAX_OUTPUT_TOKENS,
    capNano: usdToNano(c.AI_SPENDING_CAP_USD),
  };
}
export type AiConfig = ReturnType<typeof aiConfig>;
