import { z } from "zod";

export const analyticsFilterSchema = z
  .object({
    source: z.enum(["all", "sandbox", "synthetic"]).default("all"),
    period: z.enum(["all", "30", "90"]).default("all"),
    category: z.string().trim().max(80).default(""),
    page: z.coerce.number().int().min(1).max(10000).default(1),
  })
  .strict();
export type AnalyticsFilter = z.infer<typeof analyticsFilterSchema>;
export const SNAPSHOT_LIMIT = 500;
const integer = z.string().regex(/^-?\d{1,16}$/);
export const economicSnapshotSchema = z.object({
  logicVersion: z.enum(["returns-v1", "returns-v2-reviewed-evidence"]),
  manualReview: z.boolean(),
  recommended: z
    .enum(["FULL_REFUND_KEEP", "FULL_REFUND_RETURN", "PARTIAL_REFUND_KEEP"])
    .nullable(),
  options: z
    .array(
      z.object({
        resolution: z.enum([
          "FULL_REFUND_KEEP",
          "FULL_REFUND_RETURN",
          "PARTIAL_REFUND_KEEP",
        ]),
        totalMinor: integer,
        shippingMinor: integer,
        handlingMinor: integer,
        disposalMinor: integer,
        processingMinor: integer,
        recoveryMinor: integer,
        refundMinor: integer,
      }),
    )
    .max(3),
});
export type CaseMetric = {
  id: string;
  reference: string;
  product: string;
  category: string;
  source: "Sandbox order" | "Synthetic scenario";
  status: string;
  reason: string;
  resolution: string;
  recommendation: string;
  day: string | null;
  dateProvenance: string;
  aiStatus: string;
  evaluationVersion: string | null;
  comparable: number;
  physicalMinor: number | null;
  returnlessMinor: number | null;
  selectedMinor: number | null;
  avoidanceMinor: number | null;
  shippingMinor: number | null;
  handlingMinor: number | null;
  recoveryMinor: number | null;
};
export function metricNumber(value: bigint) {
  if (
    value > BigInt(Number.MAX_SAFE_INTEGER) ||
    value < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw Error("Analytics amount exceeds exact integer range");
  return Number(value);
}
export const label = (value: string) =>
  value.toLowerCase().replaceAll("_", " ");
