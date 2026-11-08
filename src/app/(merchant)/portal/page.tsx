import Link from "next/link";
import { ArrowUpRight, Link2, ShieldCheck } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function PortalPage() {
  return (
    <>
      <PageHeading
        eyebrow="Customer experience"
        title="A calmer start to every return."
        description="The customer portal will give each shopper a private, order-scoped way to share their issue."
        action={
          <Button asChild variant="outline">
            <Link href="/returns">
              View portal introduction <ArrowUpRight />
            </Link>
          </Button>
        }
      />
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Link2 className="mb-4 size-6 text-primary" />
            <CardTitle>One order. One private link.</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Intake links will be opaque, expiring, and tied to the right
              merchant and order. Link issuance and claim submission arrive in
              Phase 3.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <ShieldCheck className="mb-4 size-6 text-primary" />
            <CardTitle>Consent stays explicit</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-muted-foreground">
              Future partial refund offers will require acceptance of the exact
              amount and terms. This preview does not collect claims or accept
              offers.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
