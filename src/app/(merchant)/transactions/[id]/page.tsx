import { notFound } from "next/navigation";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/money";
import { refundableBalance } from "@/server/services/payment-rules";
import {
  RefundControls,
  PaymentAction,
  NewCheckout,
} from "@/components/payments/refund-controls";
export default async function Transaction({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ approval?: string }>;
}) {
  const actor = await requirePrincipal(),
    { id } = await params,
    { approval } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();
  const payment = await getDb().payment.findFirst({
    where: { id, merchantId: actor.merchantId },
    include: {
      order: { include: { product: true } },
      providerRefunds: true,
      refundOperations: { orderBy: { createdAt: "asc" } },
      refundApprovals: true,
      audit: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
  if (!payment) notFound();
  let remaining = 0n;
  try {
    remaining = refundableBalance(
      payment,
      payment.providerRefunds,
      payment.refundOperations,
    ).remaining;
  } catch {
    /* Frozen ledger is displayed without offering refunds. */
  }
  const review = payment.refundApprovals.find(
    (a) => a.id === approval && a.requestedByUserId === actor.userId,
  );
  const admin = actor.role === "ADMIN";
  return (
    <>
      <PageHeading
        eyebrow="PayPal Sandbox · fictional product"
        title={payment.order.product.name}
        description="Persisted provider records. Amounts in USD. Refresh from PayPal to verify the latest state."
        action={
          <Badge className="p-3">{payment.status.replaceAll("_", " ")}</Badge>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          ["Purchase", payment.expectedAmountMinor],
          ["Verified capture", payment.captureAmountMinor ?? 0n],
          ["Available to refund", remaining],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{String(label)}</p>
              <p className="mt-3 text-2xl font-semibold">
                {formatUsd(value as bigint)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Provider verification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="space-y-3 break-all">
                {[
                  ["PayPal order", payment.paypalOrderId],
                  ["Order status", payment.orderProviderStatus],
                  ["PayPal capture", payment.paypalCaptureId],
                  ["Capture status", payment.captureProviderStatus],
                  ["Ledger", payment.ledgerState],
                  ["Verified at", payment.lastVerifiedAt?.toISOString()],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="mt-1 font-mono">{v ?? "Not verified"}</dd>
                  </div>
                ))}
              </dl>
              {payment.reconciliationReason && (
                <p
                  role="status"
                  className="rounded-lg bg-amber-50 p-3 text-amber-950"
                >
                  Manual review / reconciliation: {payment.reconciliationReason}
                  . No additional refund should be submitted until resolved.
                </p>
              )}
              {admin && (
                <div className="flex flex-wrap gap-3">
                  <PaymentAction
                    paymentId={id}
                    action="reconcile"
                    label="Refresh from PayPal"
                  />
                  {payment.orderProviderStatus === "APPROVED" &&
                    !payment.paypalCaptureId && (
                      <PaymentAction
                        paymentId={id}
                        action="capture"
                        label="Capture approved order"
                      />
                    )}
                  {[
                    "CAPTURED",
                    "PARTIALLY_REFUNDED",
                    "REFUNDED",
                    "CANCELLED",
                    "FAILED",
                  ].includes(payment.status) && (
                    <NewCheckout productId={payment.order.productId} />
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Refund records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!payment.refundOperations.length && (
                <p className="text-sm text-muted-foreground">
                  No refund has been requested.
                </p>
              )}
              {payment.refundOperations.map((op) => (
                <div
                  key={op.id}
                  className="space-y-2 rounded-lg border p-4 text-sm"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{formatUsd(op.amountMinor)} USD</strong>
                    <Badge>{op.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="break-all font-mono text-xs">
                    Refund ID:{" "}
                    {op.candidateRefundId ?? "Unknown — funds remain reserved"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Reservation: {op.reservation}. Attempts: {op.attemptCount}.
                  </p>
                  {admin &&
                    op.reservation === "HELD" &&
                    !op.candidateRefundId && (
                      <PaymentAction
                        paymentId={id}
                        action="reconcile"
                        retryOperationId={op.id}
                        label="Reconcile and retry the same refund"
                      />
                    )}
                </div>
              ))}
              {payment.providerRefunds.map((refund) => (
                <dl key={refund.id} className="space-y-1 rounded-lg bg-muted/40 p-4 text-xs break-all">
                  <dt className="font-semibold">Verified PayPal refund response</dt>
                  <dd className="font-mono">{refund.paypalRefundId}</dd>
                  <dd>{formatUsd(refund.amountMinor)} {refund.currency} · {refund.providerStatus}</dd>
                  <dd>Verified {refund.verifiedAt.toISOString()}{refund.external ? " · External activity — manual review" : ""}</dd>
                </dl>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Payment timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4 border-l pl-5">
                {payment.audit.map((a) => (
                  <li key={a.id}>
                    <p className="text-sm font-medium">
                      {a.action.replaceAll("_", " ")}
                    </p>
                    <time className="text-xs text-muted-foreground">
                      {a.createdAt.toISOString()}
                    </time>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Review a refund</CardTitle>
            <p className="text-sm text-muted-foreground">
              Human authorization, exact amounts, verified outcomes.
            </p>
          </CardHeader>
          <CardContent>
            {admin &&
            payment.captureCompletedAt &&
            payment.ledgerState === "RECONCILED" ? (
              <RefundControls
                paymentId={id}
                remaining={remaining.toString()}
                review={
                  review
                    ? {
                        approvalId: review.id,
                        amountMinor: review.amountMinor.toString(),
                        reason: review.reason,
                        requiresConsent: review.requiresConsent,
                        expiresAt: review.expiresAt.toISOString(),
                      }
                    : null
                }
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Refunds require an administrator and a reconciled, verified
                completed capture.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
