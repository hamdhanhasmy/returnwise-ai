import type { Evaluation } from "./engine";
/** Compare only equivalent eligible full remedies against a physical-return baseline. */
export function modeledImpact(results: Evaluation[]) {
  let baseline = 0n,
    selected = 0n,
    shipping = 0n,
    handling = 0n,
    recovery = 0n,
    manual = 0,
    compared = 0;
  for (const r of results) {
    const physical = r.options.find(
        (o) => o.resolution === "FULL_REFUND_RETURN",
      ),
      chosen = r.options.find(
        (o) =>
          o.resolution === r.recommended &&
          o.resolution !== "PARTIAL_REFUND_KEEP",
      );
    if (r.manualReview || !physical || !chosen) {
      manual++;
      continue;
    }
    compared++;
    baseline += BigInt(physical.totalMinor);
    selected += BigInt(chosen.totalMinor);
    shipping += BigInt(physical.shippingMinor);
    handling += BigInt(physical.handlingMinor) + BigInt(physical.disposalMinor);
    recovery += BigInt(physical.recoveryMinor);
  }
  return {
    source: "MODELED_ESTIMATE",
    baseline: "Physical return for each eligible full-refund request",
    compared,
    manualReview: manual,
    baselineMinor: baseline.toString(),
    selectedMinor: selected.toString(),
    avoidableLossMinor: (baseline - selected).toString(),
    baselineShippingMinor: shipping.toString(),
    baselineHandlingDisposalMinor: handling.toString(),
    baselineRecoveryMinor: recovery.toString(),
  };
}
