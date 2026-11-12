import { describe, expect, it } from "vitest";
import { aggregateEconomics, economics } from "@/lib/analytics/calculations";
import {
  analyticsFilterSchema,
  metricNumber,
  type CaseMetric,
} from "@/lib/analytics/contracts";
const option = (resolution: string, physical: boolean) => ({
  resolution,
  refundMinor: "8000",
  shippingMinor: physical ? "1800" : "0",
  handlingMinor: physical ? "700" : "0",
  disposalMinor: "0",
  processingMinor: "0",
  recoveryMinor: physical ? "1200" : "0",
  totalMinor: physical ? "9300" : "8000",
});
const result = () => ({
  logicVersion: "returns-v1",
  manualReview: false,
  recommended: "FULL_REFUND_KEEP",
  options: [
    option("FULL_REFUND_RETURN", true),
    option("FULL_REFUND_KEEP", false),
  ],
});
describe("read-only analytics financial definitions", () => {
  it("reproduces the $13 full-remedy advantage using exact minor units", () => {
    expect(economics(result())).toMatchObject({
      avoidanceMinor: 1300,
      physicalMinor: 9300,
      returnlessMinor: 8000,
      shippingMinor: 1800,
      handlingMinor: 700,
      recoveryMinor: 1200,
    });
  });
  it("excludes manual review and evidence awaiting review", () => {
    expect(economics({ ...result(), manualReview: true })).toBeNull();
    expect(economics(result(), true)).toBeNull();
  });
  it("never treats cheaper partial settlement as full-remedy savings", () => {
    expect(
      economics({ ...result(), recommended: "PARTIAL_REFUND_KEEP" }),
    ).toBeNull();
  });
  it("rejects missing estimates and unrecognized calculation snapshots", () => {
    expect(economics({ ...result(), options: [] })).toBeNull();
    expect(economics({ ...result(), logicVersion: "unknown" })).toBeNull();
  });
  it("rejects unequal refund entitlements", () => {
    const r = result();
    r.options[1]!.refundMinor = "7999";
    expect(economics(r)).toBeNull();
  });
  it("rejects negative or inconsistent configured values", () => {
    const r = result();
    r.options[0]!.shippingMinor = "-1";
    expect(economics(r)).toBeNull();
    r.options[0]!.shippingMinor = "1801";
    expect(economics(r)).toBeNull();
  });
  it("keeps zero-cost and negative net costs meaningful without negative refunds", () => {
    const r = result();
    Object.assign(r.options[0]!, {
      shippingMinor: "0",
      handlingMinor: "0",
      recoveryMinor: "9000",
      totalMinor: "-1000",
    });
    r.recommended = "FULL_REFUND_RETURN";
    expect(economics(r)).toMatchObject({
      selectedMinor: -1000,
      avoidanceMinor: 0,
    });
  });
  it("rejects values beyond the exact chart integer range", () => {
    expect(() => metricNumber(9007199254740992n)).toThrow();
    expect(metricNumber(9007199254740991n)).toBe(9007199254740991);
  });
  it("aggregates amounts as integers and excludes incomplete rows", () => {
    const c = economics(result())!;
    const rows = [
      { ...c, comparable: 1 },
      { ...c, comparable: 1 },
      { comparable: 0 },
    ] as CaseMetric[];
    expect(aggregateEconomics(rows)).toMatchObject({
      compared: 2,
      baselineMinor: "18600",
      selectedMinor: "16000",
      avoidanceMinor: "2600",
    });
  });
  it("rejects arbitrary tenant, query, payment and unbounded pagination parameters", () => {
    for (const input of [
      { merchantId: "other" },
      { query: "DROP TABLE" },
      { action: "refund" },
      { page: 10001 },
      { source: "live" },
      { category: "x".repeat(81) },
    ])
      expect(analyticsFilterSchema.safeParse(input).success).toBe(false);
  });
});
