import {
  economicSnapshotSchema,
  metricNumber,
  type CaseMetric,
} from "./contracts";

export function economics(result: unknown, reviewRequired = false) {
  const parsed = economicSnapshotSchema.safeParse(result);
  if (!parsed.success || reviewRequired || parsed.data.manualReview)
    return null;
  const r = parsed.data;
  const physical = r.options.find((o) => o.resolution === "FULL_REFUND_RETURN");
  const keep = r.options.find((o) => o.resolution === "FULL_REFUND_KEEP");
  const selected = r.options.find(
    (o) =>
      o.resolution === r.recommended && o.resolution !== "PARTIAL_REFUND_KEEP",
  );
  // Require equivalent full remedies. A cheaper partial settlement is never savings.
  if (
    !physical ||
    !keep ||
    !selected ||
    physical.refundMinor !== keep.refundMinor
  )
    return null;
  for (const o of r.options) {
    for (const v of [
      o.shippingMinor,
      o.handlingMinor,
      o.disposalMinor,
      o.processingMinor,
      o.recoveryMinor,
      o.refundMinor,
    ])
      if (BigInt(v) < 0n) return null;
  }
  const total = (o: typeof physical) =>
    BigInt(o.refundMinor) +
    BigInt(o.shippingMinor) +
    BigInt(o.handlingMinor) +
    BigInt(o.disposalMinor) +
    BigInt(o.processingMinor) -
    BigInt(o.recoveryMinor);
  if (r.options.some((o) => total(o) !== BigInt(o.totalMinor))) return null;
  return {
    physicalMinor: metricNumber(BigInt(physical.totalMinor)),
    returnlessMinor: metricNumber(BigInt(keep.totalMinor)),
    selectedMinor: metricNumber(BigInt(selected.totalMinor)),
    avoidanceMinor: metricNumber(
      BigInt(physical.totalMinor) - BigInt(selected.totalMinor),
    ),
    shippingMinor: metricNumber(BigInt(physical.shippingMinor)),
    handlingMinor: metricNumber(
      BigInt(physical.handlingMinor) + BigInt(physical.disposalMinor),
    ),
    recoveryMinor: metricNumber(BigInt(physical.recoveryMinor)),
  };
}
export function aggregateEconomics(rows: CaseMetric[]) {
  const sum = (
    field:
      | "physicalMinor"
      | "selectedMinor"
      | "avoidanceMinor"
      | "shippingMinor"
      | "handlingMinor"
      | "recoveryMinor",
  ) => rows.reduce((n, row) => n + BigInt(row[field] ?? 0), 0n).toString();
  return {
    compared: rows.filter((r) => r.comparable === 1).length,
    baselineMinor: sum("physicalMinor"),
    selectedMinor: sum("selectedMinor"),
    avoidanceMinor: sum("avoidanceMinor"),
    processingMinor: (
      BigInt(sum("shippingMinor")) + BigInt(sum("handlingMinor"))
    ).toString(),
    recoveryMinor: sum("recoveryMinor"),
  };
}
