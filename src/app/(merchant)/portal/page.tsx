import Link from "next/link";
import { requirePrincipal } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PageHeading } from "@/components/page-heading";
import { AccessControls } from "@/components/returns/access-controls";
import { formatUsd } from "@/lib/money";
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const p = await requirePrincipal(),
    query = await searchParams;
  const page = Math.max(
    1,
    Math.min(100000, Math.floor(Number(query.page) || 1)),
  );
  const orders = await getDb().order.findMany({
    where: { merchantId: p.merchantId },
    include: { product: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 25,
    skip: (page - 1) * 25,
  });
  return (
    <>
      <PageHeading
        eyebrow="Customer experience"
        title="A calmer start to every return."
        description="Create a private link only after verifying the recipient is this order’s customer. Intake expires in one day; case access in seven. Replacement links revoke earlier access."
      />
      <p className="mb-6 text-sm text-muted-foreground">
        Configure a return policy in Settings before issuing intake. Share links
        privately; anyone holding one can access that order’s return.
      </p>
      <div className="grid gap-5 lg:grid-cols-2">
        {orders.map((o) => (
          <section
            key={o.id}
            className="space-y-4 rounded-xl border bg-card p-6"
          >
            <p className="text-xs text-primary">
              {o.origin === "SIMULATED"
                ? "Synthetic demonstration"
                : "PayPal Sandbox order"}
            </p>
            <h2 className="font-semibold">{o.product.name}</h2>
            <p className="text-sm">
              {o.publicOrderNumber} · {formatUsd(o.totalMinor)}
            </p>
            {p.role === "ADMIN" ? (
              <AccessControls orderId={o.id} />
            ) : (
              <p className="text-xs">
                An administrator must issue customer access.
              </p>
            )}
          </section>
        ))}
      </div>
      {!orders.length && <p>No orders available.</p>}
      <nav aria-label="Order pages" className="mt-6 flex gap-6">
        {page > 1 && <Link href={`?page=${page - 1}`}>Previous</Link>}
        {orders.length === 25 && <Link href={`?page=${page + 1}`}>Next</Link>}
      </nav>
    </>
  );
}
