import Link from "next/link";
import { notFound } from "next/navigation";
import { published } from "@/lib/demo/analytics";
import { formatUsd } from "@/lib/money";
import Image from "next/image";
export default async function PublicCase({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = published.cases.find((row) => row.slug === slug);
  if (!item) notFound();
  return (
    <div className="space-y-6">
      <Link href="/demo" className="text-sm text-primary">
        ← Return intelligence
      </Link>
      <section className="rounded-xl border bg-white p-6">
        <p className="text-xs uppercase tracking-widest text-primary">
          {item.metric.source} · {item.metric.status}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{item.metric.product}</h1>
        <p className="mt-4 text-muted-foreground">{item.claim}</p>
        <p className="mt-3 text-sm">
          Reason: {item.metric.reason} · Recommendation:{" "}
          {item.metric.recommendation}
        </p>
      </section>
      {item.assessment && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">
            Previously stored genuine DeepSeek assessment
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            {item.assessment.model} · {item.assessment.promptVersion} ·
            Synthetic generated image, no real customer photograph
          </p>
          <Image
            src="/demo/evidence"
            alt="Generated synthetic broken-bowl demonstration image"
            width={600}
            height={600}
            unoptimized
            className="mt-5 h-auto max-w-full rounded-lg"
          />
          <p className="mt-4">{item.assessment.result.caseSummary}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {item.assessment.result.visibleObservations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm font-medium">
            Uncertainty: {item.assessment.result.uncertainty} · Human review
            required
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {item.assessment.result.evidenceLimitations.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </section>
      )}
      <section className="overflow-x-auto rounded-xl border bg-white p-6">
        <h2 className="text-xl font-semibold">
          Configured economics · estimates, not measured savings
        </h2>
        {item.financial ? (
          <table className="mt-4 w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Resolution</th>
                <th className="p-2">Refund</th>
                <th className="p-2">Shipping</th>
                <th className="p-2">Handling</th>
                <th className="p-2">Recovery</th>
                <th className="p-2">Modeled cost</th>
              </tr>
            </thead>
            <tbody>
              {item.financial.options.map((o) => (
                <tr className="border-t" key={o.resolution}>
                  <td className="p-2">{o.resolution.replaceAll("_", " ")}</td>
                  {[
                    o.refundMinor,
                    o.shippingMinor,
                    o.handlingMinor,
                    o.recoveryMinor,
                    o.totalMinor,
                  ].map((n, i) => (
                    <td className="p-2" key={i}>
                      {formatUsd(BigInt(n))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3">
            Missing evidence or restricted eligibility: manual review; no
            supported financial recommendation.
          </p>
        )}
      </section>
      {item.payment && (
        <section className="rounded-xl border bg-white p-6">
          <h2 className="text-xl font-semibold">
            Previously verified PayPal Sandbox history
          </h2>
          <p className="mt-3">
            Captured {formatUsd(BigInt(item.payment.capturedMinor))}; refunded{" "}
            {formatUsd(BigInt(item.payment.refundedMinor))}. Ledger:{" "}
            {item.payment.ledgerState}.
          </p>
          <p className="mt-2 text-sm">
            Sanitized capture reference: {item.payment.captureReference}
          </p>
          {item.payment.refunds.map((r) => (
            <p key={r.reference} className="mt-2 text-sm">
              Refund {r.reference} · {formatUsd(BigInt(r.amountMinor))} ·{" "}
              {r.status}
            </p>
          ))}
          <p className="mt-4 text-sm text-muted-foreground">
            Published verification snapshot from the original local run; this
            page neither retrieves PayPal nor creates payment records in hosted
            PostgreSQL.
          </p>
        </section>
      )}
    </div>
  );
}
