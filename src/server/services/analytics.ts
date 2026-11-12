import type { PrismaClient, Prisma } from "@/generated/prisma/client";
import type { Principal } from "./auth";
import { invariant, digest } from "./payment-rules";
import {
  analyticsFilterSchema,
  SNAPSHOT_LIMIT,
  label,
  type CaseMetric,
} from "@/lib/analytics/contracts";
import { economics, aggregateEconomics } from "@/lib/analytics/calculations";
import { aiConfig } from "@/lib/ai/config";

export class AnalyticsService {
  constructor(readonly db: PrismaClient) {}
  async snapshot(p: Principal, raw: unknown = {}) {
    const filter = analyticsFilterSchema.parse(raw);
    let agentEnabled = false;
    try {
      const config = aiConfig();
      agentEnabled = config.enabled && !!config.apiKey;
    } catch {
      /* Charts remain available with invalid AI configuration. */
    }
    return this.db.$transaction(
      async (tx) => {
        // Includes reads only; this also prevents accidental future writes in this service.
        await tx.$executeRaw`SET TRANSACTION READ ONLY`;
        invariant(
          await tx.user.findFirst({
            where: { id: p.userId, merchantId: p.merchantId, disabledAt: null },
            select: { id: true },
          }),
          "FORBIDDEN",
          "Active merchant access required",
          403,
        );
        const since =
          filter.period === "all"
            ? undefined
            : new Date(Date.now() - Number(filter.period) * 86400000);
        const order: Prisma.OrderWhereInput = {
          NOT: { publicOrderNumber: { startsWith: "AI-EVAL-" } },
          ...(filter.source === "all"
            ? {}
            : {
                origin:
                  filter.source === "sandbox" ? "PAYPAL_SANDBOX" : "SIMULATED",
              }),
          ...(filter.category
            ? { product: { category: filter.category } }
            : {}),
          ...(since
            ? {
                timingProvenance: {
                  in: ["UTC_RECORDED", "PROVIDER_VERIFIED", "SIMULATED"],
                },
              }
            : {}),
        };
        const where: Prisma.ReturnCaseWhereInput = {
          merchantId: p.merchantId,
          order,
          ...(since
            ? { workflowVersion: { gte: 1 }, submittedAt: { gte: since } }
            : {}),
        };
        const [
          total,
          states,
          records,
          categories,
          money,
          refundStates,
          ai,
          attempts,
          pageRecords,
        ] = await Promise.all([
          tx.returnCase.count({ where }),
          tx.returnCase.groupBy({
            by: ["status"],
            where,
            _count: { _all: true },
          }),
          tx.returnCase.findMany({
            where,
            orderBy: [
              { submittedAt: { sort: "desc", nulls: "last" } },
              { id: "desc" },
            ],
            take: SNAPSHOT_LIMIT,
            select: {
              id: true,
              status: true,
              reason: true,
              submittedAt: true,
              workflowVersion: true,
              aiReviewRequired: true,
              order: {
                select: {
                  origin: true,
                  currency: true,
                  timingProvenance: true,
                  product: { select: { name: true, category: true } },
                },
              },
              evaluations: {
                orderBy: { caseVersion: "desc" },
                take: 1,
                select: { result: true, logicVersion: true },
              },
              proposals: {
                where: { status: "APPROVED" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { resolution: true },
              },
              analyses: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true },
              },
            },
          }),
          tx.product.findMany({
            where: { merchantId: p.merchantId },
            distinct: ["category"],
            select: { category: true },
            take: 100,
            orderBy: { category: "asc" },
          }),
          tx.providerRefund.aggregate({
            where: {
              merchantId: p.merchantId,
              providerStatus: "COMPLETED",
              currency: "USD",
              payment: {
                merchantId: p.merchantId,
                ledgerState: "RECONCILED",
                paypalCaptureId: { not: null },
                order: { AND: [order, { origin: "PAYPAL_SANDBOX" }] },
              },
              ...(since ? { providerUpdatedAt: { gte: since } } : {}),
            },
            _sum: { amountMinor: true },
            _count: { _all: true },
          }),
          tx.refundOperation.groupBy({
            by: ["status"],
            where: {
              merchantId: p.merchantId,
              payment: {
                order: { AND: [order, { origin: "PAYPAL_SANDBOX" }] },
              },
              ...(since ? { createdAt: { gte: since } } : {}),
            },
            _count: { _all: true },
          }),
          tx.evidenceAnalysis.groupBy({
            by: ["status"],
            where: { merchantId: p.merchantId, returnCase: where },
            _count: { _all: true },
          }),
          tx.analysisAttempt.aggregate({
            where: {
              merchantId: p.merchantId,
              analysis: { returnCase: where },
            },
            _sum: { estimatedNano: true },
            _count: { _all: true },
          }),
          tx.returnCase.findMany({
            where,
            orderBy: [
              { submittedAt: { sort: "desc", nulls: "last" } },
              { id: "desc" },
            ],
            skip: (filter.page - 1) * 25,
            take: 25,
            select: {
              id: true,
              status: true,
              order: {
                select: {
                  origin: true,
                  product: { select: { name: true, category: true } },
                },
              },
            },
          }),
        ]);
        const rows: CaseMetric[] = records.map((c) => {
          const trusted =
            c.workflowVersion >= 1 &&
            c.submittedAt &&
            ["UTC_RECORDED", "PROVIDER_VERIFIED", "SIMULATED"].includes(
              c.order.timingProvenance,
            );
          const e = c.evaluations[0],
            cost =
              c.order.currency === "USD"
                ? economics(e?.result, c.aiReviewRequired)
                : null;
          const recommendation =
            e?.result &&
            typeof e.result === "object" &&
            !Array.isArray(e.result)
              ? e.result.recommended
              : null;
          return {
            id: c.id,
            reference: c.id.slice(0, 8).toUpperCase(),
            product: (c.order.product?.name ?? "Historical item").slice(0, 100),
            category: c.order.product?.category ?? "Unknown",
            source:
              c.order.origin === "PAYPAL_SANDBOX"
                ? "Sandbox order"
                : "Synthetic scenario",
            status: label(c.status),
            reason: label(c.reason),
            resolution: c.proposals[0]
              ? label(c.proposals[0].resolution)
              : "No approved resolution",
            recommendation:
              typeof recommendation === "string"
                ? label(recommendation)
                : "Manual assessment",
            day: trusted ? c.submittedAt!.toISOString().slice(0, 10) : null,
            dateProvenance: trusted
              ? c.order.origin === "SIMULATED"
                ? "Synthetic UTC scenario"
                : "Trusted UTC submission"
              : "Untrusted historical date — excluded from trends",
            aiStatus: c.analyses[0]?.status ?? "NOT_REQUESTED",
            evaluationVersion: e?.logicVersion ?? null,
            comparable: cost ? 1 : 0,
            physicalMinor: null,
            returnlessMinor: null,
            selectedMinor: null,
            avoidanceMinor: null,
            shippingMinor: null,
            handlingMinor: null,
            recoveryMinor: null,
            ...cost,
          };
        });
        const stateCount = (names: string[]) =>
          states
            .filter((s) => names.includes(s.status))
            .reduce((n, s) => n + s._count._all, 0);
        return {
          generatedAt: new Date().toISOString(),
          workspace: digest(p.merchantId).slice(0, 16),
          filter,
          total,
          coverage: {
            included: rows.length,
            limit: SNAPSHOT_LIMIT,
            truncated: total > rows.length,
          },
          summary: {
            totalCases: total,
            awaitingReview: stateCount([
              "SUBMITTED",
              "MANUAL_REVIEW",
              "EVALUATED",
              "RESOLUTION_PROPOSED",
              "REFUND_FAILED",
            ]),
            manualReview: stateCount(["MANUAL_REVIEW"]),
            verifiedRefundMinor: (money._sum.amountMinor ?? 0n).toString(),
            verifiedRefundCount: money._count._all,
            pendingRefunds: refundStates
              .filter(
                (s) =>
                  !["COMPLETED", "FAILED_FINAL", "CANCELLED"].includes(
                    s.status,
                  ),
              )
              .reduce((n, s) => n + s._count._all, 0),
            aiRequests: attempts._count._all,
            aiEstimatedNano: (attempts._sum.estimatedNano ?? 0n).toString(),
          },
          economics: aggregateEconomics(rows),
          syntheticEconomics: aggregateEconomics(
            rows.filter((r) => r.source === "Synthetic scenario"),
          ),
          rows,
          trends: rows.filter((r) => r.day !== null),
          excludedHistoricalDates: rows.filter((r) => !r.day).length,
          states: states.map((s) => ({
            status: label(s.status),
            count: s._count._all,
          })),
          refunds: refundStates.map((s) => ({
            status: label(s.status),
            count: s._count._all,
          })),
          ai: ai.map((s) => ({
            status: label(s.status),
            count: s._count._all,
          })),
          categories: categories.map((c) => c.category),
          pageRows: pageRecords.map((c) => ({
            id: c.id,
            reference: c.id.slice(0, 8).toUpperCase(),
            product: (c.order.product?.name ?? "Historical item").slice(0, 100),
            category: c.order.product?.category ?? "Unknown",
            source:
              c.order.origin === "PAYPAL_SANDBOX"
                ? "Sandbox order"
                : "Synthetic scenario",
            status: label(c.status),
          })),
          agent: {
            enabled: p.role === "ADMIN" && agentEnabled,
            model: "deepseek-flash",
          },
        };
      },
      { isolationLevel: "RepeatableRead", timeout: 15000 },
    );
  }
}
export type AnalyticsSnapshot = Awaited<
  ReturnType<AnalyticsService["snapshot"]>
>;
