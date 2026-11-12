import published from "./published.json";
import {
  analyticsFilterSchema,
  type CaseMetric,
} from "@/lib/analytics/contracts";
import { aggregateEconomics } from "@/lib/analytics/calculations";
import type { AnalyticsSnapshot } from "@/server/services/analytics";
export { published };
export const publicDemoEnabled = () =>
  process.env.PUBLIC_DEMO_ENABLED === "true";
export function publicAnalytics(raw: unknown = {}): AnalyticsSnapshot {
  const filter = analyticsFilterSchema.parse(raw);
  const since =
    filter.period === "all"
      ? null
      : new Date(
          new Date(published.publishedAt).getTime() -
            Number(filter.period) * 86400000,
        )
          .toISOString()
          .slice(0, 10);
  const selected = published.cases.filter(
    (c) =>
      (filter.source === "all" ||
        c.metric.source ===
          (filter.source === "sandbox"
            ? "Sandbox order"
            : "Synthetic scenario")) &&
      (!filter.category || c.metric.category === filter.category) &&
      (!since || (c.metric.day && c.metric.day >= since)),
  );
  const rows = selected.map((c) => c.metric as CaseMetric);
  const refunds = selected.flatMap((c) =>
    c.payment?.currency === "USD" ? c.payment.refunds : [],
  );
  const completed = refunds.filter((r) => r.status === "COMPLETED");
  const group = (values: string[]) =>
    [...new Set(values)].map((status) => ({
      status,
      count: values.filter((v) => v === status).length,
    }));
  return {
    generatedAt: published.publishedAt,
    workspace: "public-demo",
    filter,
    total: rows.length,
    coverage: { included: rows.length, limit: 500, truncated: false },
    summary: {
      totalCases: rows.length,
      awaitingReview: rows.filter(
        (r) => !["closed", "rejected"].includes(r.status),
      ).length,
      manualReview: rows.filter((r) => r.status === "manual review").length,
      verifiedRefundMinor: completed
        .reduce((sum, r) => sum + BigInt(r.amountMinor), 0n)
        .toString(),
      verifiedRefundCount: completed.length,
      pendingRefunds: refunds.filter((r) => r.status === "PENDING").length,
      aiRequests: selected.reduce((n, c) => n + c.analysisUsage.requests, 0),
      aiEstimatedNano: selected
        .reduce((n, c) => n + BigInt(c.analysisUsage.estimatedNano), 0n)
        .toString(),
    },
    economics: aggregateEconomics(rows),
    syntheticEconomics: aggregateEconomics(
      rows.filter((r) => r.source === "Synthetic scenario"),
    ),
    rows,
    trends: rows.filter((r) => r.day !== null),
    excludedHistoricalDates: rows.filter((r) => r.day === null).length,
    states: group(rows.map((r) => r.status)),
    refunds: group(refunds.map((r) => r.status.toLowerCase())),
    ai: group(
      selected.map(
        (c) => c.assessment?.status.toLowerCase() ?? "not requested",
      ),
    ),
    categories: [...new Set(published.cases.map((c) => c.metric.category))],
    pageRows: rows
      .slice((filter.page - 1) * 25, filter.page * 25)
      .map(({ id, reference, product, category, source, status }) => ({
        id,
        reference,
        product,
        category,
        source,
        status,
      })),
    agent: { enabled: false, model: "deepseek-flash" },
  };
}
