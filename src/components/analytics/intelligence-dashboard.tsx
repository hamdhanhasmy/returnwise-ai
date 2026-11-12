"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BrainCircuit,
  CheckCheck,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/money";
import type { AnalyticsFilter } from "@/lib/analytics/contracts";
import type { AnalyticsSnapshot } from "@/server/services/analytics";
import type { ReportView } from "./studio-report";
const StudioCanvas = dynamic(() => import("./studio-canvas"), {
  ssr: false,
  loading: () => (
    <div
      className="flex h-96 items-center justify-center text-sm text-muted-foreground"
      role="status"
    >
      Loading AG Studio workspace…
    </div>
  ),
});
const select = "h-10 max-w-full rounded-lg border bg-card px-3 text-sm";
const usd = (n: string) => formatUsd(BigInt(n));
const compactSnapshot = () => window.matchMedia("(max-width: 720px)").matches;
function subscribeCompact(notify: () => void) {
  const media = window.matchMedia("(max-width: 720px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
}
export function IntelligenceDashboard({
  initial,
  workspace,
  endpoint = "/api/analytics",
  caseBase = "/cases",
  studioEnabled = true,
  publicDemo = false,
}: {
  initial: AnalyticsSnapshot;
  workspace: string;
  endpoint?: string;
  caseBase?: string;
  studioEnabled?: boolean;
  publicDemo?: boolean;
}) {
  const [assistant, setAssistant] = useState(false);
  const compact = useSyncExternalStore(
    subscribeCompact,
    compactSnapshot,
    () => false,
  );
  const [data, setData] = useState(initial),
    [view, setView] = useState<ReportView>("overview"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load(filter: AnalyticsFilter) {
    controller.current?.abort();
    const active = new AbortController();
    controller.current = active;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(
        `${endpoint}?${new URLSearchParams(Object.entries(filter).map(([k, v]) => [k, String(v)]))}`,
        { signal: active.signal, cache: "no-store" },
      );
      if (!r.ok)
        throw Error("Analytics unavailable. Check your session and retry.");
      const next: AnalyticsSnapshot = await r.json();
      if (next.workspace !== workspace)
        throw Error(
          "Your merchant session changed. Reload this workspace before continuing.",
        );
      setData(next);
    } catch (e) {
      if (!active.signal.aborted) setError((e as Error).message);
    } finally {
      if (!active.signal.aborted) setBusy(false);
    }
  }
  function filter(change: Partial<AnalyticsFilter>) {
    void load({ ...data.filter, page: 1, ...change });
  }
  const cards = [
    {
      label: "Return cases",
      value: String(data.summary.totalCases),
      note: `${data.summary.awaitingReview} awaiting merchant review`,
      icon: ArrowDownLeft,
    },
    {
      label: "Verified Sandbox refunds",
      value: usd(data.summary.verifiedRefundMinor),
      note: `${data.summary.verifiedRefundCount} completed provider refunds · all selected records`,
      icon: CheckCheck,
    },
    {
      label: "Modeled cost avoidance",
      value: usd(data.economics.avoidanceMinor),
      note: `${data.economics.compared} equivalent full remedies · estimates`,
      icon: ArrowUpRight,
    },
    {
      label: "Human judgment needed",
      value: String(data.summary.manualReview),
      note: `${data.summary.aiRequests} evidence analysis requests in scope`,
      icon: BrainCircuit,
    },
  ];
  return (
    <div className="space-y-6" aria-busy={busy}>
      <section className="relative overflow-hidden rounded-2xl bg-[#284b38] px-6 py-7 text-white sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-[#c0d4b8]">
              {studioEnabled
                ? "Return intelligence · Powered by AG Studio"
                : "Return intelligence · Read-only metric explorer"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Every return tells a bigger story.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#d2dfcd]">
              Explore the decisions, the economics and the verified outcomes.
              Find where a thoughtful resolution makes the difference.
            </p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1.5 text-xs">
            PayPal Sandbox · Read-only data
          </span>
        </div>
      </section>
      <div
        className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
        aria-label="Analytics filters"
      >
        <SlidersHorizontal
          className="mb-3 size-4 text-primary"
          aria-hidden="true"
        />
        <label className="grid gap-1 text-xs font-medium">
          Record source
          <select
            className={select}
            value={data.filter.source}
            onChange={(e) =>
              filter({ source: e.target.value as AnalyticsFilter["source"] })
            }
          >
            <option value="all">All return records</option>
            <option value="sandbox">Sandbox orders</option>
            <option value="synthetic">Synthetic scenarios</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Time window
          <select
            className={select}
            value={data.filter.period}
            onChange={(e) =>
              filter({ period: e.target.value as AnalyticsFilter["period"] })
            }
          >
            <option value="all">All time</option>
            <option value="30">Last 30 days · trusted dates</option>
            <option value="90">Last 90 days · trusted dates</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Product category
          <select
            className={select}
            value={data.filter.category}
            onChange={(e) => filter({ category: e.target.value })}
          >
            <option value="">All categories</option>
            {data.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void load(data.filter)}
        >
          {busy ? "Refreshing…" : "Refresh data"}
        </Button>
        <span className="text-xs text-muted-foreground sm:ml-auto">
          {data.coverage.included} cases in Studio snapshot
        </span>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm"
        >
          {error}{" "}
          <Button variant="ghost" onClick={() => void load(data.filter)}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div className="rounded-xl border bg-card p-5" key={c.label}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {c.label}
              </p>
              <c.icon className="size-4 text-primary" />
            </div>
            <p
              className="mt-4 text-3xl font-semibold tracking-tight"
              data-testid={
                c.label === "Modeled cost avoidance"
                  ? "modeled-avoidance"
                  : undefined
              }
            >
              {c.value}
            </p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              {c.note}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Metric
          title="Estimated return processing"
          value={usd(data.economics.processingMinor)}
          detail="Configured shipping, handling and disposal for comparable full-return options."
        />
        <Metric
          title="Estimated recoverable value"
          value={usd(data.economics.recoveryMinor)}
          detail="Merchant-configured recovery assumptions, not realized proceeds."
        />
        <Metric
          title="Pending refund operations"
          value={String(data.summary.pendingRefunds)}
          detail="Unresolved operations require reconciliation; pending does not mean refunded."
        />
      </div>
      <label className="flex items-start gap-3 rounded-xl border bg-card p-4 text-xs leading-5">
        <input
          type="checkbox"
          className="mt-1"
          checked={
            assistant &&
            data.agent.enabled &&
            !compact &&
            studioEnabled &&
            !publicDemo
          }
          disabled={
            !data.agent.enabled || compact || !studioEnabled || publicDemo
          }
          onChange={(e) => setAssistant(e.target.checked)}
        />
        <span>
          <strong>Enable optional DeepSeek analytics assistant.</strong> I
          consent to sending my questions to DeepSeek (processing may occur in
          China; no zero-retention guarantee). Do not enter personal data. Each
          new question uses one bounded request within the shared AI cap; exact
          aggregates are computed on our server. No photographs or customer
          records are sent.{" "}
          {publicDemo
            ? "Public exploration is read-only: no new AI requests or financial operations."
            : !studioEnabled
              ? "Hosted AG Studio and its assistant are unavailable until an authorized licence is configured."
              : compact
                ? "Optional native chat and layout editing require a desktop-sized window. Mobile reports remain interactive."
                : data.agent.enabled
                  ? "Choose Open AI assistant in the Studio toolbar after enabling."
                  : "Disabled: requires an administrator and configured AI service. Manual Studio exploration remains available."}
        </span>
      </label>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div
          className="flex flex-wrap gap-1 border-b p-2"
          role="tablist"
          aria-label="Intelligence views"
        >
          {(
            [
              ["overview", "Return overview"],
              ["economics", "Economics lab"],
              ["cases", "Case explorer"],
            ] as const
          ).map(([id, text]) => (
            <button
              key={id}
              role="tab"
              aria-selected={view === id}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium ${view === id ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted"}`}
              onClick={() => setView(id)}
            >
              {text}
            </button>
          ))}
        </div>
        {!studioEnabled ? (
          <div
            className="overflow-x-auto p-5"
            data-testid="studio-license-fallback"
          >
            <h2 className="font-semibold">
              Read-only metric table — AG Studio licence pending
            </h2>
            <p className="my-3 text-sm text-muted-foreground">
              This fallback is an ordinary table, not AG Studio. Hosted Studio
              is enabled only with an authorized trial or licence.
            </p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-2">Product</th>
                  <th className="p-2">Source</th>
                  <th className="p-2">Recommendation</th>
                  <th className="p-2">Modeled advantage</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">{r.product}</td>
                    <td className="p-2">{r.source}</td>
                    <td className="p-2">{r.recommendation}</td>
                    <td className="p-2">
                      {r.avoidanceMinor === null
                        ? "Manual review"
                        : usd(String(r.avoidanceMinor))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : data.rows.length ? (
          <StudioCanvas
            key={`${workspace}:${view}:${data.filter.source}:${data.filter.period}:${data.filter.category}:${compact}:${assistant && data.agent.enabled && !compact}`}
            workspace={workspace}
            view={view}
            snapshot={data}
            compact={compact}
            assistant={
              assistant && data.agent.enabled && !compact && !publicDemo
            }
          />
        ) : (
          <div className="px-6 py-20 text-center">
            <h2 className="text-lg font-semibold">
              A clear view starts with a return.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              No return records match these filters. Choose another scope or
              submit a return through the customer portal.
            </p>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Know what you’re comparing
          </p>
          <p className="mt-3 text-sm leading-6">
            PayPal totals are verified Sandbox financial records. Return
            processing, recovery and avoidance are configured estimates. The
            baseline requires physical return for each comparable full-refund
            remedy; partial settlements are never ranked as savings.
          </p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Charts use exact USD cents. Studio selections filter its widgets;
            cards reflect the source, category and time window above. Economics
            cover {data.coverage.included} recent cases
            {data.coverage.truncated
              ? ` of ${data.total}; refine filters to inspect older records`
              : ""}
            . {data.excludedHistoricalDates} historical dates excluded from
            trends. AI evaluation fixtures are excluded.
          </p>
        </div>
        <div className="rounded-xl border bg-[#eef3e9] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Analytics assistant
          </p>
          <h2 className="mt-3 text-lg font-semibold">
            Explore with confidence.
          </h2>
          <p className="mt-2 text-sm leading-6">
            Ask about common return reasons, full-remedy economics, estimated
            recovery or verified Sandbox refunds. AG Studio’s Agent Framework
            connects to a server-controlled, read-only DeepSeek tool runner.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Questions are independent and bounded to one tool-selection request.
            Successful unchanged questions are cached. Unknown results are not
            automatically retried. The assistant cannot change the dashboard’s
            financial records, merchant policies or payments.
          </p>
        </div>
      </div>
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Open the story behind a case</h2>
          <span className="text-xs text-muted-foreground">
            Page {data.filter.page} · 25 records per page
          </span>
        </div>
        <div className="mt-4 divide-y">
          {data.pageRows.map((r) => (
            <Link
              key={r.id}
              href={`${caseBase}/${r.id}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm hover:text-primary"
            >
              <span>
                <strong>{r.reference}</strong> · {r.product}
                <span className="mt-1 block text-xs text-muted-foreground">
                  {r.source} · {r.category}
                </span>
              </span>
              <span className="text-xs capitalize">{r.status} →</span>
            </Link>
          ))}
          {!data.pageRows.length && (
            <p className="py-5 text-sm text-muted-foreground">
              No cases on this page.
            </p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy || data.filter.page <= 1}
            onClick={() =>
              void load({ ...data.filter, page: data.filter.page - 1 })
            }
          >
            Previous cases
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || data.filter.page * 25 >= data.total}
            onClick={() =>
              void load({ ...data.filter, page: data.filter.page + 1 })
            }
          >
            Next cases
          </Button>
        </div>
      </section>
    </div>
  );
}
function Metric({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="mt-2 text-xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}
