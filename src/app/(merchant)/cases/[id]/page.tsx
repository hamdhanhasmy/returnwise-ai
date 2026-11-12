import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getCase } from "@/server/services/merchant";
import { formatUsd } from "@/lib/money";
import { PageHeading } from "@/components/page-heading";
import { StatusBadge } from "@/components/cases-table";
import { CaseActions } from "@/components/returns/case-actions";
import { EvidencePanel } from "@/components/returns/evidence-panel";
import { CaseRefundPanel } from "@/components/returns/case-refund-panel";
import type { Evaluation } from "@/lib/returns/engine";
import { human } from "@/components/returns/form-parts";
const money = (v: string) => formatUsd(BigInt(v));
export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requirePrincipal(),
    record = await getCase(getDb(), principal, (await params).id);
  if (!record) notFound();
  const evaluation = record.evaluations[0],
    result = evaluation?.result as Evaluation | undefined,
    proposal = record.proposals[0],
    operation = record.refundApproval?.operation;
  return (
    <>
      <Link href="/cases" className="mb-6 inline-block text-sm text-primary">
        ← Return cases
      </Link>
      <PageHeading
        eyebrow={`${record.order.publicOrderNumber} · ${record.id.slice(0, 8)}`}
        title={record.order.product.name}
        description={
          record.order.origin === "SIMULATED"
            ? "Synthetic demonstration · modeled amounts, no provider payment"
            : "PayPal Sandbox order · payment outcome is separate from case approval"
        }
        action={<StatusBadge status={record.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Customer account of the issue</h2>
          <p className="whitespace-pre-wrap text-sm leading-7">
            {record.description}
          </p>
          <p className="text-xs text-muted-foreground">
            {human(record.reason)} · {human(record.condition ?? "UNKNOWN")} ·
            Customer reported; evidence assessment is shown separately
          </p>
          <p className="text-xs text-muted-foreground">
            Submitted:{" "}
            {record.submittedAt?.toISOString() ??
              "Historical timestamp unverified — manual review required"}
          </p>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">Order & policy</h2>
          <dl className="space-y-3 text-sm">
            <div>
              Stored order amount:{" "}
              <strong>{formatUsd(record.order.totalMinor)}</strong>
            </div>
            <div>
              Policy version: {record.policy.version} ·{" "}
              {record.workflowVersion === 1
                ? "Frozen at submission"
                : "Legacy — no trusted return-policy snapshot"}
            </div>
            <div>Timing provenance: {record.order.timingProvenance}</div>
            <div>
              Capture: {record.order.payment?.status ?? "No provider payment"}
            </div>
          </dl>
          {record.order.payment && (
            <Link
              href={`/transactions/${record.order.payment.id}`}
              className="text-sm text-primary"
            >
              View verified transaction and refund balance →
            </Link>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer">Recorded policy rules</summary>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words">
              {JSON.stringify(record.policySnapshot, null, 2) ?? "Unavailable"}
            </pre>
          </details>
        </section>
      </div>
      <section className="my-6 space-y-4 rounded-xl border bg-card p-6">
        <p className="text-xs uppercase tracking-wide text-primary">
          Deterministic decision · {evaluation?.logicVersion ?? "Not evaluated"}
        </p>
        {record.aiReviewRequired && (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm">
            Evidence review required. The calculation below is a previously
            recorded policy assessment, not a current approval. Review the
            evidence and re-evaluate policy before proposing a remedy.
          </p>
        )}
        <h2 className="text-xl font-semibold capitalize">
          {human(result?.recommended ?? "MANUAL_REVIEW")}
        </h2>
        <p className="text-sm leading-7">
          {result?.explanation ??
            "Historical cases require human assessment. Unverified dates and missing policy snapshots cannot establish eligibility."}
        </p>
        {result && (
          <>
            <p className="text-xs text-muted-foreground">
              Source: {result.source}. Costs and recovery are configured
              estimates.{" "}
              {result.advantageMinor !== null &&
                `Estimated return-minus-keep difference: ${money(result.advantageMinor)}.`}
            </p>
            <ul className="list-inside list-disc space-y-2 text-xs text-muted-foreground">
              {[
                ...result.rules,
                ...result.reasonCodes,
                ...result.missingInformation,
              ].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <div className="grid gap-4 xl:grid-cols-3">
              {result.options.map((o) => (
                <article
                  key={o.resolution}
                  className={`space-y-3 rounded-xl border p-5 ${o.resolution === result.recommended ? "border-primary bg-primary/5" : ""}`}
                >
                  <h3 className="font-semibold capitalize">
                    {human(o.resolution)}
                  </h3>
                  <p className="text-2xl font-semibold">
                    {money(o.totalMinor)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estimated merchant cost
                  </p>
                  <dl className="space-y-2 text-xs">
                    {[
                      ["Refund", o.refundMinor],
                      ["Merchant return shipping", o.shippingMinor],
                      ["Customer shipping (separate)", o.customerShippingMinor],
                      ["Handling", o.handlingMinor],
                      ["Disposal", o.disposalMinor],
                      ["Keep processing", o.processingMinor],
                      ["Recovery credit", o.recoveryMinor],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt>{label}</dt>
                        <dd>{money(value!)}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="text-xs leading-6 text-muted-foreground">
                    {o.explanation}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {proposal && (
        <section className="mb-6 rounded-xl border bg-card p-6">
          <h2 className="font-semibold">
            Current resolution · {human(proposal.status)}
          </h2>
          <p className="mt-3 capitalize">
            {human(proposal.resolution)} · {formatUsd(proposal.amountMinor)}
          </p>
          <p className="mt-3 text-sm">{proposal.explanation}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Customer agreement:{" "}
            {proposal.requiresConsent
              ? proposal.respondedAt
                ? `Recorded ${proposal.respondedAt.toISOString()}`
                : "Required before approval"
              : "Full-refund remedy; no partial settlement"}
            . Expires {proposal.expiresAt.toISOString()}.
          </p>
        </section>
      )}
      {principal.role === "ADMIN" && (
        <CaseRefundPanel
          caseId={record.id}
          version={record.version}
          status={record.status}
          synthetic={record.order.origin === "SIMULATED"}
          received={!!record.returnReceivedAt}
          proposal={
            proposal
              ? {
                  id: proposal.id,
                  termsHash: proposal.termsHash,
                  resolution: proposal.resolution,
                  amountMinor: proposal.amountMinor.toString(),
                  currency: proposal.currency,
                  status: proposal.status,
                  requiresConsent: proposal.requiresConsent,
                  respondedAt: proposal.respondedAt?.toISOString() ?? null,
                  explanation: proposal.explanation,
                }
              : null
          }
          refund={
            operation
              ? {
                  status: operation.status,
                  providerStatus:
                    operation.providerRefund?.providerStatus ?? null,
                  providerId: operation.providerRefund?.paypalRefundId ?? null,
                  verifiedAt:
                    operation.providerRefund?.verifiedAt.toISOString() ?? null,
                  canReplay:
                    operation.reservation === "HELD" &&
                    !operation.candidateRefundId &&
                    !!operation.retryNotAfter &&
                    operation.retryNotAfter > new Date(),
                }
              : null
          }
        />
      )}
      {principal.role === "ADMIN" && <EvidencePanel caseId={record.id} />}
      {principal.role === "ADMIN" ? (
        <CaseActions
          key={`${record.id}-${record.version}`}
          id={record.id}
          version={record.version}
          status={record.status}
          options={result?.options ?? []}
          modern={record.workflowVersion === 1}
          synthetic={record.order.origin === "SIMULATED"}
        />
      ) : (
        <p>Only an administrator can change the resolution.</p>
      )}
      <section className="mt-6 rounded-xl border bg-card p-6">
        <h2 className="mb-5 font-semibold">
          Review history · latest 50 events
        </h2>
        <ol className="space-y-4">
          {record.audit.map((a) => (
            <li key={a.id} className="border-l-2 pl-4 text-xs">
              <p className="font-medium capitalize">{human(a.action)}</p>
              <p className="mt-1 text-muted-foreground">
                {a.createdAt.toISOString()} · {a.actorType}
              </p>
              <p className="mt-2 break-words">
                {String(
                  (a.redactedMetadataJson as { message?: string })?.message ??
                    "",
                )}
              </p>
            </li>
          ))}
        </ol>
        {!record.audit.length && (
          <p className="text-sm text-muted-foreground">
            No review events recorded.
          </p>
        )}
      </section>
    </>
  );
}
