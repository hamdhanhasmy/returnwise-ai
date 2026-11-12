import {
  engineInputSchema,
  conditions,
  returnPolicySchema,
  type Resolution,
} from "./contracts";

export const LOGIC_VERSION = "returns-v2-reviewed-evidence";
export type CostOption = {
  resolution: Resolution;
  refundMinor: string;
  shippingMinor: string;
  customerShippingMinor: string;
  handlingMinor: string;
  disposalMinor: string;
  processingMinor: string;
  recoveryMinor: string;
  totalMinor: string;
  requiresConsent: boolean;
  explanation: string;
};
export type Evaluation = {
  logicVersion: string;
  source: "SIMULATED" | "SANDBOX" | "UNKNOWN";
  recommended: Resolution | null;
  options: CostOption[];
  reasonCodes: string[];
  missingInformation: string[];
  rules: string[];
  manualReview: boolean;
  advantageMinor: string | null;
  remainingMinor: string | null;
  explanation: string;
};
/** Pure, reproducible, integer-money calculation. It never calls a provider or approves money. */
export function evaluateReturn(
  rawInput: unknown,
  rawPolicy: unknown,
): Evaluation {
  const base: Evaluation = {
    logicVersion: LOGIC_VERSION,
    source: "UNKNOWN",
    recommended: null,
    options: [],
    reasonCodes: [],
    missingInformation: [],
    rules: [],
    manualReview: true,
    advantageMinor: null,
    remainingMinor: null,
    explanation:
      "Manual review is required before a resolution can be proposed.",
  };
  const input = engineInputSchema.safeParse(rawInput),
    policy = returnPolicySchema.safeParse(rawPolicy);
  if (!input.success || !policy.success)
    return {
      ...base,
      reasonCodes: [
        !input.success ? "INVALID_FINANCIAL_INPUT" : "INVALID_POLICY",
      ],
      missingInformation: ["Valid persisted financial inputs and policy"],
    };
  const i = input.data,
    p = policy.data;
  base.source = i.source;
  const issue = (code: string, missing?: string) => {
    base.reasonCodes.push(code);
    if (missing) base.missingInformation.push(missing);
  };
  if (i.evidence) {
    const e = i.evidence;
    if (!e.reviewed)
      issue(
        "EVIDENCE_HUMAN_REVIEW_REQUIRED",
        "Merchant review of current observations and limitations",
      );
    base.rules.push(
      `Evidence revision ${e.revision}: ${e.status}; human review ${e.reviewed ? "recorded" : "required"}. Observations do not set prices, eligibility or legal rights.`,
    );
    if (
      e.status !== "SUCCEEDED" ||
      e.uncertainty === "HIGH" ||
      e.injectionSuspected ||
      e.claimSupport !== "SUPPORTED"
    )
      base.rules.push(
        "Evidence is unavailable, uncertain, contradictory or suspicious. Document independent human assessment; do not infer fraud or deny a remedy from AI uncertainty.",
      );
    base.rules.push(
      ...e.observations.map((x) => `Untrusted visible observation: ${x}`),
      ...e.limitations.map((x) => `Evidence limitation: ${x}`),
    );
  }
  const total = BigInt(i.orderMinor),
    captured = BigInt(i.capturedMinor ?? "0"),
    refunded = BigInt(i.refundedMinor),
    held = BigInt(i.reservedMinor);
  const available = captured - refunded - held;
  base.remainingMinor = available >= 0n ? available.toString() : null;
  if (i.currency !== "USD") issue("CURRENCY_MISMATCH");
  if (total <= 0n || captured !== total) issue("CAPTURE_AMOUNT_MISMATCH");
  if (i.source === "SANDBOX" && (!i.paymentVerified || !i.ledgerReconciled))
    issue("UNVERIFIED_PAYMENT", "Verified reconciled capture");
  if (available < 0n) issue("LEDGER_MISMATCH");
  else if (available === 0n) issue("FULLY_REFUNDED");
  if (held > 0n) issue("REFUND_RESERVED");
  if (refunded > 0n && available > 0n) issue("PREVIOUS_REFUND_REVIEW");
  if (!i.timingTrusted || !i.purchasedAt || !i.submittedAt)
    issue("UNRELIABLE_TIMING", "Trusted UTC purchase and submission instants");
  else {
    const elapsed = Date.parse(i.submittedAt) - Date.parse(i.purchasedAt);
    if (elapsed < 0) issue("FUTURE_PURCHASE");
    else if (elapsed > p.windowDays * 86400000)
      issue("OUTSIDE_STANDARD_WINDOW");
    else
      base.rules.push(
        `Submitted within ${p.windowDays} × 24 hours of purchase (UTC, inclusive boundary).`,
      );
  }
  if (
    !p.eligibleCategories.includes(i.category) ||
    p.excludedCategories.includes(i.category)
  )
    issue("CATEGORY_REQUIRES_REVIEW");
  if (
    !p.allowedReasons.includes(i.reason as (typeof p.allowedReasons)[number]) ||
    ["UNKNOWN", "OTHER"].includes(i.reason)
  )
    issue("REASON_REQUIRES_REVIEW");
  if (
    p.manualConditions.includes(
      i.condition as (typeof p.manualConditions)[number],
    ) ||
    i.condition === "UNKNOWN" ||
    !conditions.includes(i.condition as (typeof conditions)[number])
  )
    issue("CONDITION_REQUIRES_REVIEW");
  if (total > BigInt(p.highValueMinor)) issue("HIGH_VALUE_REVIEW");
  const recovery =
    p.recoveryMethod === "FIXED"
      ? p.recoveryMinor
      : p.recoveryMethod === "PRODUCT_ESTIMATE"
        ? i.recoveryMinor
        : null;
  if (recovery === null)
    issue("MISSING_RECOVERY", "Configured recovery estimate");
  else if (BigInt(recovery) > total) issue("RECOVERY_EXCEEDS_ITEM_VALUE");
  if (BigInt(p.shippingMinor) > total) issue("UNUSUAL_SHIPPING_REVIEW");
  if (base.reasonCodes.length) return base;
  const shipping = BigInt(p.shippingMinor),
    handling = BigInt(p.handlingMinor),
    disposal = BigInt(p.disposalMinor),
    recovered = BigInt(recovery!),
    processing = BigInt(p.keepProcessingMinor);
  const merchantShipping =
    p.shippingResponsibility === "MERCHANT" ? shipping : 0n;
  const returned = total + merchantShipping + handling + disposal - recovered;
  const keep = total + processing;
  const physical: CostOption = {
    resolution: "FULL_REFUND_RETURN",
    refundMinor: total.toString(),
    shippingMinor: merchantShipping.toString(),
    customerShippingMinor: (shipping - merchantShipping).toString(),
    handlingMinor: handling.toString(),
    disposalMinor: disposal.toString(),
    recoveryMinor: recovered.toString(),
    processingMinor: "0",
    totalMinor: returned.toString(),
    requiresConsent: false,
    explanation:
      "Full refund after physical return and required inspection. Shipping allocation is a configured assumption, subject to human rights/entitlement review.",
  };
  base.options.push(physical);
  if (p.allowReturnless)
    base.options.push({
      ...physical,
      resolution: "FULL_REFUND_KEEP",
      shippingMinor: "0",
      customerShippingMinor: "0",
      handlingMinor: "0",
      disposalMinor: "0",
      recoveryMinor: "0",
      processingMinor: processing.toString(),
      totalMinor: keep.toString(),
      explanation:
        "Full refund without return, permitted by this policy. Avoided logistics are estimates, not measured savings.",
    });
  const partial = BigInt(p.partialOfferMinor),
    partialCap = (total * BigInt(p.maxPartialBps)) / 10000n;
  if (
    p.allowReturnless &&
    p.allowPartial &&
    partial > 0n &&
    partial < total &&
    partial <= BigInt(p.maxPartialMinor) &&
    partial <= partialCap
  )
    base.options.push({
      ...physical,
      resolution: "PARTIAL_REFUND_KEEP",
      refundMinor: partial.toString(),
      shippingMinor: "0",
      customerShippingMinor: "0",
      handlingMinor: "0",
      disposalMinor: "0",
      recoveryMinor: "0",
      processingMinor: processing.toString(),
      totalMinor: (partial + processing).toString(),
      requiresConsent: true,
      explanation:
        "Optional negotiated remedy only: merchant must confirm entitlement and the customer must accept these exact terms. Never ranked against full-refund rights.",
    });
  base.recommended =
    p.allowReturnless && keep < returned
      ? "FULL_REFUND_KEEP"
      : "FULL_REFUND_RETURN";
  base.advantageMinor = p.allowReturnless ? (returned - keep).toString() : null;
  base.manualReview = false;
  base.reasonCodes = [
    base.recommended === "FULL_REFUND_KEEP"
      ? "RETURN_COST_EXCEEDS_RECOVERY"
      : "RECOVERY_SUPPORTS_RETURN",
  ];
  base.rules.push(
    "Only policy-permitted full-refund remedies are cost-ranked. Partial offers are not economically interchangeable.",
    "Recommendation is conditional on human eligibility/rights review; approval does not execute a payment.",
  );
  base.explanation =
    base.recommended === "FULL_REFUND_KEEP"
      ? "Full refund without return has lower estimated merchant cost because return logistics exceed recoverable value. Merchant review is required."
      : "Physical return has the lower or equal estimated cost among permitted full-refund options. Merchant review and any required inspection remain necessary.";
  return base;
}
