import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/money";
export default async function Transactions({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requirePrincipal(),
    query = (await searchParams).q?.slice(0, 100) ?? "";
  const payments = await getDb().payment.findMany({
    where: {
      merchantId: actor.merchantId,
      ...(query
        ? {
            OR: [
              {
                paypalOrderId: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
              {
                paypalCaptureId: {
                  contains: query,
                  mode: "insensitive" as const,
                },
              },
              {
                order: {
                  publicOrderNumber: {
                    contains: query,
                    mode: "insensitive" as const,
                  },
                },
              },
            ],
          }
        : {}),
    },
    include: { order: { include: { product: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeading
        eyebrow="Payment ledger"
        title="Transactions, with the facts attached."
        description="Genuine Sandbox operations only. Provider IDs, verified statuses, and a clear path to reconciliation."
        action={
          <Button asChild>
            <Link href="/checkout">Demo checkout</Link>
          </Button>
        }
      />
      <form className="mb-5 flex max-w-xl gap-3">
        <Input
          name="q"
          aria-label="Search transactions"
          placeholder="Order number or PayPal order / capture ID"
          defaultValue={query}
        />
        <Button variant="outline">Search</Button>
      </form>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
              <tr>
                {["Transaction", "Amount", "Status", "Last verified"].map(
                  (h) => (
                    <th key={h} className="px-5 py-4 font-medium">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="max-w-70 px-5 py-5">
                    <Link
                      href={`/transactions/${p.id}`}
                      className="font-semibold text-primary underline"
                    >
                      {p.order.product.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {p.paypalOrderId ?? "Order response unresolved"}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-5 tabular-nums">
                    {formatUsd(p.expectedAmountMinor)} USD
                  </td>
                  <td className="px-5 py-5">
                    <Badge>{p.status.replaceAll("_", " ")}</Badge>
                  </td>
                  <td className="px-5 py-5 text-xs text-muted-foreground">
                    {p.lastVerifiedAt?.toISOString() ?? "Not verified"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!payments.length && (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No matching Sandbox transactions. Start with the demo checkout.
          </p>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Showing the latest 100 matching transactions. Seeded illustrative orders
        are excluded.
      </p>
    </>
  );
}
