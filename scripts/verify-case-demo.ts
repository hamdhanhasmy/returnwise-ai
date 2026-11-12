import { scriptDatabase } from "./database";
import { demoIds } from "../prisma/fixtures";
// Read-only database evidence. Provider verification is separately paypal:verify.
const db = scriptDatabase();
try {
  const payments = await db.payment.findMany({
    where: {
      merchantId: demoIds.merchant,
      order: { product: { sku: "PHASE5-BOWL-USD5" } },
    },
    include: { providerRefunds: true, refundOperations: true },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  for (const p of payments) {
    const c = await db.returnCase.findFirst({
      where: { merchantId: p.merchantId, orderId: p.orderId },
      include: {
        proposals: true,
        analyses: { include: { attempts: true } },
        audit: {
          select: { action: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    console.log(
      JSON.stringify(
        {
          paymentId: p.id,
          status: p.status,
          amountMinor: p.captureAmountMinor,
          currency: p.currency,
          ledger: p.ledgerState,
          captureCompletedAt: p.captureCompletedAt,
          providerOrderSuffix: p.paypalOrderId?.slice(-6),
          captureSuffix: p.paypalCaptureId?.slice(-6),
          refunds: p.providerRefunds.map((r) => ({
            suffix: r.paypalRefundId.slice(-6),
            amountMinor: r.amountMinor,
            status: r.providerStatus,
            verifiedAt: r.verifiedAt,
          })),
          operations: p.refundOperations.map((o) => ({
            status: o.status,
            amountMinor: o.amountMinor,
          })),
          case: c
            ? {
                id: c.id,
                status: c.status,
                aiReviewRequired: c.aiReviewRequired,
                policyId: c.policyId,
                recommendation: c.recommendation,
                proposals: c.proposals.map((x) => ({
                  resolution: x.resolution,
                  amountMinor: x.amountMinor,
                  status: x.status,
                  requiresConsent: x.requiresConsent,
                  respondedAt: x.respondedAt,
                  approvedAt: x.approvedAt,
                })),
                analyses: c.analyses.map((a) => ({
                  status: a.status,
                  model: a.model,
                  reviewedAt: a.reviewedAt,
                  result: a.result,
                  attempts: a.attempts.map((t) => ({
                    promptTokens: t.promptTokens,
                    completionTokens: t.completionTokens,
                    estimatedNano: t.estimatedNano,
                    latencyMs: t.latencyMs,
                  })),
                })),
                audit: c.audit,
              }
            : null,
        },
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
  }
  if (!payments.length) console.log("No Phase 5 demonstration payment exists.");
} catch {
  console.error("Read-only case demo inventory failed. No records changed.");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
