import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { publicPayPalConfiguration } from "@/server/paypal";
import { paypalConfig } from "@/lib/payments/config";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent } from "@/components/ui/card";
import { Checkout } from "@/components/payments/checkout";
import { formatUsd } from "@/lib/money";
export default async function CheckoutPage() {
  const principal = await requirePrincipal(),
    db = getDb();
  const config = publicPayPalConfiguration();
  const merchant = await db.merchant.findUniqueOrThrow({
    where: { id: principal.merchantId },
  });
  const enabled =
    config.configured &&
    merchant.paymentsEnabled &&
    merchant.paypalMerchantId === paypalConfig().merchantId &&
    principal.role === "ADMIN";
  const products = await db.product.findMany({
    where: { merchantId: principal.merchantId, currency: "USD" },
    orderBy: { name: "asc" },
  });
  return (
    <>
      <PageHeading
        eyebrow="PayPal Sandbox"
        title="A real checkout. A safe demonstration."
        description="Fictional products, persisted prices, and genuine PayPal Sandbox payments. No real funds are used."
      />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardContent className="p-6 md:p-8">
            {enabled && config.clientId ? (
              <Checkout
                clientId={config.clientId}
                products={products.map((p) => ({
                  id: p.id,
                  name: p.name,
                  price: formatUsd(p.saleAmountMinor),
                }))}
              />
            ) : (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold">
                  Sandbox checkout is not enabled
                </h2>
                <p className="text-sm text-muted-foreground">
                  An administrator must configure server credentials and bind
                  this merchant to the matching Sandbox business account. Staff
                  can view transactions but cannot execute payments.
                </p>
                <p className="text-sm">
                  Follow the local setup in <code>docs/paypal-sandbox.md</code>.
                  No payment has been submitted by this page.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <aside className="space-y-6 rounded-xl bg-[#e8eee2] p-7">
          <h2 className="text-xl font-semibold">Every step, accounted for.</h2>
          <ol className="space-y-5 text-sm">
            <li>1. Choose a fictional product at its saved USD price.</li>
            <li>2. Approve with a separate Sandbox buyer account.</li>
            <li>3. Verify the captured amount and provider IDs.</li>
            <li>
              4. Review and explicitly authorize a full or partial refund.
            </li>
          </ol>
          <Link
            href="/transactions"
            className="inline-block font-semibold text-primary underline"
          >
            View merchant transactions →
          </Link>
          <p className="text-xs leading-5">
            A submitted request is never displayed as a completed refund.
            Pending or uncertain responses remain reserved until reconciled.
          </p>
        </aside>
      </div>
    </>
  );
}
