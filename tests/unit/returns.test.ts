import { describe, expect, it } from "vitest";
import { evaluateReturn } from "@/lib/returns/engine";
import {
  conservativePolicy,
  type EngineInput,
  type ReturnPolicy,
} from "@/lib/returns/contracts";
import { assertTransition } from "@/lib/returns/state";
import { modeledImpact } from "@/lib/returns/impact";
export const policy: ReturnPolicy = {
  ...conservativePolicy,
  allowReturnless: true,
  allowPartial: true,
  partialOfferMinor: "2000",
  maxPartialMinor: "3000",
  maxPartialBps: 5000,
  shippingMinor: "1800",
  handlingMinor: "700",
  recoveryMethod: "PRODUCT_ESTIMATE",
  highValueMinor: "50000",
};
export const input: EngineInput = {
  source: "SANDBOX",
  orderMinor: "8000",
  capturedMinor: "8000",
  refundedMinor: "0",
  reservedMinor: "0",
  paymentVerified: true,
  ledgerReconciled: true,
  currency: "USD",
  category: "Home",
  reason: "DAMAGED",
  condition: "DAMAGED",
  purchasedAt: "2026-11-01T00:00:00.000Z",
  submittedAt: "2026-11-09T00:00:00.000Z",
  timingTrusted: true,
  recoveryMinor: "1200",
};
describe("deterministic return policy and economics", () => {
  it("requires reviewed evidence but never treats uncertain observations as fraud or financial inputs", () => {
    const evidence = {
      revision: 2,
      reviewed: false,
      analysisId: null,
      status: "FAILED",
      uncertainty: "HIGH" as const,
      claimSupport: "UNSUPPORTED",
      injectionSuspected: true,
      observations: [],
      limitations: ["No reliable image detail"],
    };
    expect(
      evaluateReturn({ ...input, evidence }, policy).reasonCodes,
    ).toContain("EVIDENCE_HUMAN_REVIEW_REQUIRED");
    const reviewed = evaluateReturn(
      { ...input, evidence: { ...evidence, reviewed: true } },
      policy,
    );
    expect(reviewed.manualReview).toBe(false);
    expect(reviewed.options).toEqual(evaluateReturn(input, policy).options);
    expect(reviewed.rules.join(" ")).toContain("do not infer fraud");
  });
  it("compares equivalent full remedies only and counts manual reviews in modeled impact", () => {
    const low = evaluateReturn(input, policy),
      high = evaluateReturn(
        {
          ...input,
          orderMinor: "24000",
          capturedMinor: "24000",
          recoveryMinor: "18000",
        },
        policy,
      ),
      unclear = evaluateReturn({ ...input, reason: "OTHER" }, policy);
    expect(modeledImpact([low, high, unclear])).toMatchObject({
      compared: 2,
      manualReview: 1,
      baselineMinor: "17800",
      selectedMinor: "16500",
      avoidableLossMinor: "1300",
    });
  });
  it("returns structured review for malformed partial policy values", () => {
    expect(
      evaluateReturn(input, { ...policy, partialOfferMinor: "not-money" }),
    ).toMatchObject({ manualReview: true, reasonCodes: ["INVALID_POLICY"] });
  });
  it("recommends equivalent full keep and never ranks the cheaper partial against rights", () => {
    const r = evaluateReturn(input, policy);
    expect(r.recommended).toBe("FULL_REFUND_KEEP");
    expect(r.advantageMinor).toBe("1300");
    expect(r.options.map((o) => o.totalMinor)).toEqual([
      "9300",
      "8000",
      "2000",
    ]);
    expect(r.options[2]?.requiresConsent).toBe(true);
    expect(evaluateReturn(input, policy)).toEqual(r);
  });
  it("recommends physical return for high recovery value", () =>
    expect(
      evaluateReturn(
        {
          ...input,
          orderMinor: "24000",
          capturedMinor: "24000",
          recoveryMinor: "18000",
        },
        policy,
      ).recommended,
    ).toBe("FULL_REFUND_RETURN"));
  it("allows zero costs and recovery and uses a conservative tie", () =>
    expect(
      evaluateReturn(
        { ...input, recoveryMinor: "0" },
        { ...policy, shippingMinor: "0", handlingMinor: "0" },
      ).recommended,
    ).toBe("FULL_REFUND_RETURN"));
  it("computes customer shipping separately without inventing merchant savings", () => {
    const r = evaluateReturn(input, {
      ...policy,
      shippingResponsibility: "CUSTOMER",
    });
    expect(r.options[0]).toMatchObject({
      shippingMinor: "0",
      customerShippingMinor: "1800",
      totalMinor: "7500",
    });
  });
  it.each([
    [{ paymentVerified: false }, "UNVERIFIED_PAYMENT"],
    [{ ledgerReconciled: false }, "UNVERIFIED_PAYMENT"],
    [{ capturedMinor: null }, "CAPTURE_AMOUNT_MISMATCH"],
    [{ currency: "EUR" }, "CURRENCY_MISMATCH"],
    [{ refundedMinor: "8000" }, "FULLY_REFUNDED"],
    [{ reservedMinor: "100" }, "REFUND_RESERVED"],
    [{ refundedMinor: "100" }, "PREVIOUS_REFUND_REVIEW"],
    [{ refundedMinor: "8001" }, "LEDGER_MISMATCH"],
    [{ recoveryMinor: null }, "MISSING_RECOVERY"],
    [{ recoveryMinor: "8001" }, "RECOVERY_EXCEEDS_ITEM_VALUE"],
    [{ timingTrusted: false }, "UNRELIABLE_TIMING"],
    [{ purchasedAt: null }, "UNRELIABLE_TIMING"],
    [{ submittedAt: "2026-10-01T00:00:00.000Z" }, "FUTURE_PURCHASE"],
    [{ reason: "OTHER" }, "REASON_REQUIRES_REVIEW"],
    [{ condition: "UNKNOWN" }, "CONDITION_REQUIRES_REVIEW"],
    [{ category: "Excluded" }, "CATEGORY_REQUIRES_REVIEW"],
  ])("routes unsafe or missing inputs to manual review: %s", (change, code) => {
    const r = evaluateReturn({ ...input, ...change }, policy);
    expect(r.reasonCodes).toContain(code);
    expect(r.manualReview).toBe(true);
    expect(r.options).toEqual([]);
  });
  it("uses inclusive UTC elapsed-time deadline, down to a millisecond", () => {
    expect(
      evaluateReturn(
        { ...input, submittedAt: "2026-12-01T00:00:00.000Z" },
        policy,
      ).manualReview,
    ).toBe(false);
    expect(
      evaluateReturn(
        { ...input, submittedAt: "2026-12-01T00:00:00.001Z" },
        policy,
      ).reasonCodes,
    ).toContain("OUTSIDE_STANDARD_WINDOW");
  });
  it.each(["-1", "1.5", "1e3", "9007199254740993"])(
    "rejects invalid integer estimate %s",
    (shippingMinor) =>
      expect(
        evaluateReturn(input, { ...policy, shippingMinor }).reasonCodes,
      ).toContain("INVALID_POLICY"),
  );
  it("flags unusually high shipping and manual threshold", () => {
    expect(
      evaluateReturn(input, { ...policy, shippingMinor: "8001" }).reasonCodes,
    ).toContain("UNUSUAL_SHIPPING_REVIEW");
    expect(
      evaluateReturn(input, { ...policy, highValueMinor: "7999" }).reasonCodes,
    ).toContain("HIGH_VALUE_REVIEW");
  });
  it("respects category exclusions and returnless limits", () => {
    expect(
      evaluateReturn(input, { ...policy, excludedCategories: ["Home"] })
        .manualReview,
    ).toBe(true);
    expect(
      evaluateReturn(input, { ...policy, allowReturnless: false }).options.map(
        (o) => o.resolution,
      ),
    ).toEqual(["FULL_REFUND_RETURN"]);
    expect(
      evaluateReturn(input, { ...policy, maxPartialBps: 1000 }).options,
    ).toHaveLength(2);
  });
  it("labels hypothetical finance as synthetic and never requires fictional provider IDs", () =>
    expect(
      evaluateReturn(
        { ...input, source: "SIMULATED", paymentVerified: false },
        policy,
      ),
    ).toMatchObject({ source: "SIMULATED", recommended: "FULL_REFUND_KEEP" }));
  it("rejects missing policy and invalid state transitions", () => {
    expect(evaluateReturn(input, null).reasonCodes).toContain("INVALID_POLICY");
    expect(() => assertTransition("SUBMITTED", "APPROVED")).toThrow();
    expect(() => assertTransition("CLOSED", "EVALUATED")).toThrow();
    expect(() =>
      assertTransition("EVALUATED", "RESOLUTION_PROPOSED"),
    ).not.toThrow();
  });
});
