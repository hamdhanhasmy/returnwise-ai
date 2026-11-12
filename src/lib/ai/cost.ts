import { SYSTEM_PROMPT } from "./contracts";
// Peak USD prices checked 2026-11-10. Integer nano-USD per token.
export const PRICING_VERSION = "deepseek-flash-2026-11-10-peak";
export type Usage = {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
};
export function estimatedCost(u: Usage) {
  return (
    BigInt(u.promptTokens - u.cachedTokens) * 300n +
    BigInt(u.cachedTokens) * 6n +
    BigInt(u.completionTokens) * 1200n
  );
}
export function reservation(
  description: string,
  images: number,
  maxTokens: number,
) {
  // UTF-8 bytes conservatively bound text token count, plus framing margin and documented image maximum.
  const promptTokens =
    Buffer.byteLength(SYSTEM_PROMPT + description, "utf8") +
    2048 +
    images * 1024;
  return estimatedCost({
    promptTokens,
    cachedTokens: 0,
    completionTokens: maxTokens,
  });
}
