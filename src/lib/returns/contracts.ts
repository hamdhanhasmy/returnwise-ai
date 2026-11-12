import { z } from "zod";

export const reasons = [
  "DAMAGED",
  "WRONG_ITEM",
  "DEFECTIVE",
  "NOT_AS_DESCRIBED",
  "MISSING_COMPONENTS",
  "CHANGE_OF_MIND",
  "OTHER",
  "UNKNOWN",
] as const;
export const conditions = [
  "DAMAGED",
  "UNOPENED",
  "OPENED",
  "USED",
  "UNKNOWN",
] as const;
export const resolutions = [
  "FULL_REFUND_RETURN",
  "FULL_REFUND_KEEP",
  "PARTIAL_REFUND_KEEP",
] as const;
export type Resolution = (typeof resolutions)[number];
export const minor = z.string().regex(/^(0|[1-9][0-9]{0,8})$/);
const categories = z.array(z.string().trim().min(1).max(60)).max(30);
export const returnPolicySchema = z
  .object({
    windowDays: z.number().int().min(1).max(365),
    eligibleCategories: categories.min(1),
    excludedCategories: categories,
    allowedReasons: z.array(z.enum(reasons)).min(1).max(reasons.length),
    manualConditions: z.array(z.enum(conditions)).max(conditions.length),
    allowReturnless: z.boolean(),
    allowPartial: z.boolean(),
    partialOfferMinor: minor,
    maxPartialMinor: minor,
    maxPartialBps: z.number().int().min(0).max(10000),
    shippingResponsibility: z.enum(["MERCHANT", "CUSTOMER"]),
    shippingMinor: minor,
    handlingMinor: minor,
    disposalMinor: minor,
    keepProcessingMinor: minor,
    recoveryMethod: z.enum(["PRODUCT_ESTIMATE", "FIXED", "UNKNOWN"]),
    recoveryMinor: minor.nullable(),
    highValueMinor: minor,
    currency: z.literal("USD"),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      minor.safeParse(p.partialOfferMinor).success &&
      minor.safeParse(p.maxPartialMinor).success &&
      BigInt(p.partialOfferMinor) > BigInt(p.maxPartialMinor)
    )
      ctx.addIssue({
        code: "custom",
        message: "Partial offer exceeds its ceiling",
        path: ["partialOfferMinor"],
      });
    if (p.recoveryMethod === "FIXED" && p.recoveryMinor === null)
      ctx.addIssue({
        code: "custom",
        message: "Fixed recovery estimate required",
        path: ["recoveryMinor"],
      });
  });
export type ReturnPolicy = z.infer<typeof returnPolicySchema>;
export const conservativePolicy: ReturnPolicy = {
  windowDays: 30,
  eligibleCategories: ["Home"],
  excludedCategories: [],
  allowedReasons: [
    "DAMAGED",
    "DEFECTIVE",
    "WRONG_ITEM",
    "NOT_AS_DESCRIBED",
    "MISSING_COMPONENTS",
  ],
  manualConditions: ["UNKNOWN", "USED"],
  allowReturnless: false,
  allowPartial: false,
  partialOfferMinor: "0",
  maxPartialMinor: "0",
  maxPartialBps: 0,
  shippingResponsibility: "MERCHANT",
  shippingMinor: "0",
  handlingMinor: "0",
  disposalMinor: "0",
  keepProcessingMinor: "0",
  recoveryMethod: "UNKNOWN",
  recoveryMinor: null,
  highValueMinor: "25000",
  currency: "USD",
};
export const submissionSchema = z
  .object({
    productId: z.uuid(),
    reason: z.enum(reasons),
    condition: z.enum(conditions),
    description: z.string().trim().min(20).max(4000),
  })
  .strict();
export const engineInputSchema = z.object({
  evidence: z
    .object({
      revision: z.number().int().nonnegative(),
      reviewed: z.boolean(),
      analysisId: z.string().nullable(),
      status: z.string(),
      uncertainty: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable(),
      claimSupport: z.string().nullable(),
      injectionSuspected: z.boolean(),
      observations: z.array(z.string()),
      limitations: z.array(z.string()),
    })
    .optional(),
  source: z.enum(["SIMULATED", "SANDBOX"]),
  orderMinor: minor,
  capturedMinor: minor.nullable(),
  refundedMinor: minor,
  reservedMinor: minor,
  paymentVerified: z.boolean(),
  ledgerReconciled: z.boolean(),
  currency: z.string(),
  category: z.string(),
  reason: z.string(),
  condition: z.string(),
  purchasedAt: z.iso.datetime().nullable(),
  submittedAt: z.iso.datetime().nullable(),
  timingTrusted: z.boolean(),
  recoveryMinor: minor.nullable(),
});
export type EngineInput = z.infer<typeof engineInputSchema>;
