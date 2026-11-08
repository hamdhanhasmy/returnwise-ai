import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getCase } from "@/server/services/merchant";
import { formatUsd } from "@/lib/money";
import { PageHeading } from "@/components/page-heading";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/cases-table";

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const principal = await requirePrincipal();
  const record = await getCase(getDb(), principal, (await params).id);
  if (!record) notFound();
  return (
    <>
      <Link
        href="/cases"
        className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground"
      >
        <ArrowLeft className="size-3" /> Return cases
      </Link>
      <PageHeading
        eyebrow={record.order.publicOrderNumber}
        title={record.order.product.name}
        description="Synthetic case · No verified PayPal capture is linked to this order."
        action={<StatusBadge status={record.status} />}
      />
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Customer account of the issue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-7 text-muted-foreground">
              {record.description}
            </p>
            <p className="mt-6 text-xs text-muted-foreground">
              Reason: {record.reason.toLowerCase().replaceAll("_", " ")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Order context</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Illustrative order value
                </dt>
                <dd className="font-medium">
                  {formatUsd(record.order.totalMinor)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Policy snapshot</dt>
                <dd>Version {record.policy.version}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Payment verification</dt>
                <dd>Not available</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
      <div className="mt-6 flex gap-3 rounded-xl border bg-card p-5">
        <LockKeyhole className="size-5 shrink-0 text-primary" />
        <div>
          <h2 className="text-sm font-semibold">
            Resolution tools are coming next
          </h2>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">
            Policy evaluation, customer offers, evidence analysis, and refund
            approval are unavailable. This case cannot trigger a payment.
          </p>
        </div>
      </div>
    </>
  );
}
